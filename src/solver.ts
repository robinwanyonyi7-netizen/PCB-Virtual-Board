// Modified Nodal Analysis solver: DC operating point (Newton for diodes) + backward-Euler transient.
export type El =
  | { t: 'R' | 'V' | 'I' | 'C' | 'L'; a: number; b: number; v: number; w?: Wave } // ohm | volt (a=+) | amp a->b | farad | henry; w = waveform for a V source
  | { t: 'D'; a: number; b: number; is?: number; n?: number };      // anode a, cathode b
/** Source waveform: dc = constant, step = 0 before t=0 then v, sine / square = +-v (bipolar) at freq Hz. */
export interface Wave { kind: 'dc' | 'step' | 'sine' | 'square'; freq?: number }
export interface Ctx { t?: number; pre?: boolean; iL?: number[]; tr?: boolean } // time, "just before t=0" flag, previous C / L currents, trapezoidal (else backward Euler)
export function srcValue(e: { v: number; w?: Wave }, t: number, pre = false): number {
  const w = e.w; if (!w || w.kind === 'dc') return e.v;
  if (w.kind === 'step') return pre || t < 0 ? 0 : e.v;
  const f = w.freq ?? 1000;
  if (w.kind === 'sine') return e.v * Math.sin(2 * Math.PI * f * t);
  return (((f * t) % 1) + 1) % 1 < 0.5 ? e.v : -e.v;
}
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
export function solve(els: El[], n: number, prev?: number[], dt = 0, ctx: Ctx = {}): Result {
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
      else if (e.t === 'L') { if (dt > 0) { const G = dt / ((ctx.tr ? 2 : 1) * e.v), vp = prev ? prev[e.a] - prev[e.b] : 0; g(e.a, e.b, G); src(e.a, e.b, (ctx.tr ? G * vp : 0) + (ctx.iL?.[k] ?? 0)); } else g(e.a, e.b, 1e4); } // DC: ~short
      else if (e.t === 'I') src(e.a, e.b, e.v);
      else if (e.t === 'C' && dt > 0) { const G = ((ctx.tr ? 2 : 1) * e.v) / dt, vp = prev ? prev[e.a] - prev[e.b] : 0; g(e.a, e.b, G); src(e.a, e.b, -G * vp - (ctx.tr ? ctx.iL?.[k] ?? 0 : 0)); }
      else if (e.t === 'D') {
        const nVt = (e.n ?? 1) * VT, Is = e.is ?? 1e-14, ex = Math.exp(vd[k] / nVt);
        const G = (Is / nVt) * ex; g(e.a, e.b, G); src(e.a, e.b, Is * (ex - 1) - G * vd[k]);
      } else if (e.t === 'V') {
        const row = n - 1 + vsIdx.indexOf(k);
        if (e.a > 0) { A[row][e.a - 1] += 1; A[e.a - 1][row] += 1; }
        if (e.b > 0) { A[row][e.b - 1] -= 1; A[e.b - 1][row] -= 1; }
        z[row] = srcValue(e, ctx.t ?? 0, ctx.pre);
      }
    });
    const xn = gauss(A, z);
    if (!xn) return { v: new Array(n).fill(0), i: [], ok: false };
    const volt = (nx: number[], node: number) => (node > 0 ? nx[node - 1] : 0);
    let delta = 0;
    xn.forEach((val, i) => (delta = Math.max(delta, Math.abs(val - x[i]))));
    els.forEach((e, k) => { // limited diode voltage update for Newton stability
      if (e.t !== 'D') return;
      const want = volt(xn, e.a) - volt(xn, e.b) - vd[k];
      delta = Math.max(delta, Math.abs(want)); // not converged until diode voltage settles
      vd[k] += Math.max(-0.3, Math.min(0.3, want));
    });
    x = xn;
    ok = delta < 1e-9 && it > 0;
  }
  const v = [0, ...x.slice(0, n - 1)];
  const i = els.map((e, k) => {
    const dV = v[e.a] - v[e.b];
    if (e.t === 'R') return dV / e.v;
    if (e.t === 'L') { if (dt <= 0) return dV * 1e4; const G = dt / ((ctx.tr ? 2 : 1) * e.v), vp = prev ? prev[e.a] - prev[e.b] : 0; return G * dV + (ctx.tr ? G * vp : 0) + (ctx.iL?.[k] ?? 0); }
    if (e.t === 'I') return e.v;
    if (e.t === 'C') { if (dt <= 0) return 0; const G = ((ctx.tr ? 2 : 1) * e.v) / dt; return G * (dV - (prev ? prev[e.a] - prev[e.b] : 0)) - (ctx.tr ? ctx.iL?.[k] ?? 0 : 0); }
    if (e.t === 'D') return (e.is ?? 1e-14) * (Math.exp(dV / ((e.n ?? 1) * VT)) - 1);
    return -x[n - 1 + vsIdx.indexOf(k)];
  });
  return { v, i, ok };
}

/** Time-domain run (trapezoidal after a backward-Euler first step). Starts from the DC state with sources at their t=0- value. */
export function transient(els: El[], n: number, tStop: number, steps: number) {
  const dt = tStop / steps, t: number[] = [0];
  let r = solve(els, n, undefined, 0, { t: 0, pre: true });
  const iLof = (i: number[]) => i.map((x, k) => (els[k].t === 'L' || els[k].t === 'C' ? x : 0));
  const v = [r.v], i = [r.i]; let iL = iLof(r.i);
  for (let k = 1; k <= steps; k++) {
    r = solve(els, n, v[k - 1], dt, { t: k * dt, iL, tr: k > 1 });
    t.push(k * dt); v.push(r.v); i.push(r.i); iL = iLof(r.i);
  }
  return { t, v, i };
}

// ---- AC (frequency) analysis: complex nodal analysis, small-signal around the DC operating point ----
function cgauss(Ar: number[][], Ai: number[][], zr: number[], zi: number[]): [number[], number[]] | null {
  const N = zr.length;
  for (let c = 0; c < N; c++) {
    let p = c, best = Math.hypot(Ar[c][c], Ai[c][c]);
    for (let r = c + 1; r < N; r++) { const m = Math.hypot(Ar[r][c], Ai[r][c]); if (m > best) { best = m; p = r; } }
    if (best < 1e-30) return null;
    [Ar[c], Ar[p]] = [Ar[p], Ar[c]]; [Ai[c], Ai[p]] = [Ai[p], Ai[c]]; [zr[c], zr[p]] = [zr[p], zr[c]]; [zi[c], zi[p]] = [zi[p], zi[c]];
    const pr = Ar[c][c], pi = Ai[c][c], d = pr * pr + pi * pi;
    for (let r = c + 1; r < N; r++) {
      const ar = Ar[r][c], ai = Ai[r][c]; if (!ar && !ai) continue;
      const fr = (ar * pr + ai * pi) / d, fi = (ai * pr - ar * pi) / d;
      for (let k = c; k < N; k++) { Ar[r][k] -= fr * Ar[c][k] - fi * Ai[c][k]; Ai[r][k] -= fr * Ai[c][k] + fi * Ar[c][k]; }
      zr[r] -= fr * zr[c] - fi * zi[c]; zi[r] -= fr * zi[c] + fi * zr[c];
    }
  }
  const xr = new Array(N).fill(0), xi = new Array(N).fill(0);
  for (let r = N - 1; r >= 0; r--) {
    let sr = zr[r], si = zi[r];
    for (let k = r + 1; k < N; k++) { sr -= Ar[r][k] * xr[k] - Ai[r][k] * xi[k]; si -= Ar[r][k] * xi[k] + Ai[r][k] * xr[k]; }
    const pr = Ar[r][r], pi = Ai[r][r], d = pr * pr + pi * pi;
    xr[r] = (sr * pr + si * pi) / d; xi[r] = (si * pr - sr * pi) / d;
  }
  return [xr, xi];
}

/** Node phasors at frequency f (Hz) with source element srcK driven by 1 V at 0 deg, other V sources shorted. op = DC node voltages (for diodes). */
export function acSolve(els: El[], n: number, srcK: number, f: number, op: number[]) {
  const vs = els.map((e, k) => (e.t === 'V' ? k : -1)).filter(k => k >= 0), N = n - 1 + vs.length, w = 2 * Math.PI * f;
  const Ar = Array.from({ length: N }, () => new Array(N).fill(0)), Ai = Array.from({ length: N }, () => new Array(N).fill(0));
  const zr = new Array(N).fill(0), zi = new Array(N).fill(0);
  const y = (a: number, b: number, gr: number, gi: number) => {
    if (a > 0) { Ar[a - 1][a - 1] += gr; Ai[a - 1][a - 1] += gi; }
    if (b > 0) { Ar[b - 1][b - 1] += gr; Ai[b - 1][b - 1] += gi; }
    if (a > 0 && b > 0) { Ar[a - 1][b - 1] -= gr; Ai[a - 1][b - 1] -= gi; Ar[b - 1][a - 1] -= gr; Ai[b - 1][a - 1] -= gi; }
  };
  for (let i = 1; i < n; i++) Ar[i - 1][i - 1] += 1e-12;
  els.forEach((e, k) => {
    if (e.t === 'R') y(e.a, e.b, 1 / e.v, 0);
    else if (e.t === 'C') y(e.a, e.b, 0, w * e.v);
    else if (e.t === 'L') y(e.a, e.b, 0, -1 / (w * e.v));
    else if (e.t === 'D') { const nVt = (e.n ?? 1) * VT; y(e.a, e.b, ((e.is ?? 1e-14) / nVt) * Math.exp((op[e.a] - op[e.b]) / nVt), 0); }
    else if (e.t === 'V') {
      const row = n - 1 + vs.indexOf(k);
      if (e.a > 0) { Ar[row][e.a - 1] += 1; Ar[e.a - 1][row] += 1; }
      if (e.b > 0) { Ar[row][e.b - 1] -= 1; Ar[e.b - 1][row] -= 1; }
      zr[row] = k === srcK ? 1 : 0;
    }
  });
  const sol = cgauss(Ar, Ai, zr, zi);
  if (!sol) return null;
  return { re: [0, ...sol[0].slice(0, n - 1)], im: [0, ...sol[1].slice(0, n - 1)] };
}