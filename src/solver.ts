// Modified Nodal Analysis solver: DC operating point (Newton for diodes) + backward-Euler transient.
export type El =
  | { t: 'R' | 'V' | 'I' | 'C'; a: number; b: number; v: number } // ohm | volt (a=+) | amp a->b | farad
  | { t: 'D'; a: number; b: number; is?: number; n?: number };      // anode a, cathode b
export interface Result { v: number[]; i: number[]; ok: boolean }
const VT = 0.025852;

function gauss(A: number[][], z: number[]): number[] | null {
  const N = z.length;
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-18) return null;
    [A[c], A[p]] = [A[p], A[c]]; [z[c], z[p]] = [z[p], z[c]];
    for (let r = c + 1; r < N; r++) {
      const f = A[r][c] / A[c][c];
      if (f) { for (let k = c; k < N; k++) A[r][k] -= f * A[c][k]; z[r] -= f * z[c]; }
    }
  }
  const x = new Array(N).fill(0);
  for (let r = N - 1; r >= 0; r--) {
    let s = z[r];
    for (let k = r + 1; k < N; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/** n = node count incl. ground (node 0). prev = previous node voltages and dt>0 enable capacitor companions. */
export function solve(els: El[], n: number, prev?: number[], dt = 0): Result {
  const vsIdx = els.map((e, k) => (e.t === 'V' ? k : -1)).filter(k => k >= 0);
  const N = n - 1 + vsIdx.length;
  const vd = els.map(() => 0);
  let x = new Array(N).fill(0), ok = false;
  for (let it = 0; it < 200 && !ok; it++) {
    const A = Array.from({ length: N }, () => new Array(N).fill(0)), z = new Array(N).fill(0);
    const g = (a: number, b: number, G: number) => {
      if (a > 0) A[a - 1][a - 1] += G;
      if (b > 0) A[b - 1][b - 1] += G;
      if (a > 0 && b > 0) { A[a - 1][b - 1] -= G; A[b - 1][a - 1] -= G; }
    };
    const src = (a: number, b: number, I: number) => { if (a > 0) z[a - 1] -= I; if (b > 0) z[b - 1] += I; };
    for (let i = 1; i < n; i++) A[i - 1][i - 1] += 1e-12; // gmin keeps floating nets solvable
    els.forEach((e, k) => {
      if (e.t === 'R') g(e.a, e.b, 1 / e.v);
      else if (e.t === 'I') src(e.a, e.b, e.v);
      else if (e.t === 'C' && dt > 0) { const G = e.v / dt, vp = prev ? prev[e.a] - prev[e.b] : 0; g(e.a, e.b, G); src(e.a, e.b, -G * vp); }
      else if (e.t === 'D') {
        const nVt = (e.n ?? 1) * VT, Is = e.is ?? 1e-14, ex = Math.exp(vd[k] / nVt);
        const G = (Is / nVt) * ex; g(e.a, e.b, G); src(e.a, e.b, Is * (ex - 1) - G * vd[k]);
      } else if (e.t === 'V') {
        const row = n - 1 + vsIdx.indexOf(k);
        if (e.a > 0) { A[row][e.a - 1] += 1; A[e.a - 1][row] += 1; }
        if (e.b > 0) { A[row][e.b - 1] -= 1; A[e.b - 1][row] -= 1; }
        z[row] = e.v;
      }
    });
    const xn = gauss(A, z);
    if (!xn) return { v: new Array(n).fill(0), i: [], ok: false };
    const volt = (nx: number[], node: number) => (node > 0 ? nx[node - 1] : 0);
    let delta = 0;
    xn.forEach((val, i) => (delta = Math.max(delta, Math.abs(val - x[i]))));
    els.forEach((e, k) => { // limited diode voltage update for Newton stability
      if (e.t === 'D') vd[k] += Math.max(-0.3, Math.min(0.3, volt(xn, e.a) - volt(xn, e.b) - vd[k]));
    });
    x = xn;
    ok = delta < 1e-9 && it > 0;
  }
  const v = [0, ...x.slice(0, n - 1)];
  const i = els.map((e, k) => {
    const dV = v[e.a] - v[e.b];
    if (e.t === 'R') return dV / e.v;
    if (e.t === 'I') return e.v;
    if (e.t === 'C') return dt > 0 ? (e.v / dt) * (dV - (prev ? prev[e.a] - prev[e.b] : 0)) : 0;
    if (e.t === 'D') return (e.is ?? 1e-14) * (Math.exp(dV / ((e.n ?? 1) * VT)) - 1);
    return -x[n - 1 + vsIdx.indexOf(k)];
  });
  return { v, i, ok };
}
