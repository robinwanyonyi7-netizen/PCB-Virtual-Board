import { type SeqUnit, outCount, outNodes, outputs, stepUnits, unitValues } from './seq';
// Modified Nodal Analysis solver: DC operating point (Newton for diodes) + backward-Euler transient.
export type El =
  | { t: 'R' | 'V' | 'I' | 'C' | 'L'; a: number; b: number; v: number; w?: Wave } // ohm | volt (a=+) | amp a->b | farad | henry; w = waveform for a V source
  | { t: 'D'; a: number; b: number; is?: number; n?: number; bv?: number }      // anode a, cathode b; bv = Zener breakdown voltage (at 5 mA)
  | { t: 'DA'; a: number; b: number; anodes: number[]; is?: number; n?: number } // LED array (7-segment): a = first anode, b = common cathode; current = sum of all segments
  | { t: 'P'; a: number; b: number; wiper: number; v: number; pos?: number }     // potentiometer, v ohms end to end, wiper at pos (0 = end a, 1 = end b)
  | { t: 'REG'; a: number; b: number; out: number; vout: number; drop?: number; rout?: number; iq?: number } // regulator: a = input, b = reference (GND, or ADJ on an LM317); output = ref + vout, or input - drop in dropout
  | { t: 'CP'; a: number; b: number; amps: Amp[]; rsat?: number; iq?: number; vmin?: number } // open-collector comparator chip: a = V+, b = V-
  | { t: 'Q'; a: number; b: number; base: number; pnp?: boolean; is?: number; bf?: number; br?: number } // BJT, Ebers-Moll: a = collector, b = emitter (so V = Vce, current = into the collector)
  | { t: 'M'; a: number; b: number; gate: number; pmos?: boolean; kp?: number; vth?: number; lambda?: number } // MOSFET, level 1: a = drain, b = source (V = Vds, current = into the drain); kp in A/V^2
  | { t: 'G'; a: number; b: number; gates: Gate[]; rout?: number } // digital IC: a = Vcc node, b = GND node, one element per chip (its current = supply current)
  | { t: 'OA'; a: number; b: number; amps: Amp[]; gain?: number; gbw?: number; rout?: number; hi?: number; lo?: number; iq?: number; vmin?: number } // op-amp chip: a = V+, b = V-; outputs clamp to [V- + lo, V+ - hi]
  | { t: 'F'; a: number; b: number; units: SeqUnit[]; rout?: number } // clocked chip (flip-flops, counters): a = Vcc, b = GND; see seq.ts
  | { t: 'T'; a: number; b: number; trig: number; thr: number; out: number; reset: number; ctrl: number; dis: number; vmin?: number; drop?: number; rhi?: number; rlo?: number; rdis?: number; iq?: number }; // 555 timer: a = Vcc, b = GND
export type GateFn = 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'not' | 'add' | 'mux' | 'dec' | 'seg';
const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]; // 4511 digits 0-9 as segment bits a..g (bit 0 = a); 6 and 9 have their tails; 10-15 are blank
/** One digital output. ins = input nodes. Options: bit = which adder bit (add: ins = A0..An-1, B0..Bn-1, Cin) or which decoder line (dec);
 *  sel = number of select bits (mux: ins = data[2^sel], select[sel], enables...; dec: ins = select[sel], enables...);
 *  inv = invert the output; invIn = indexes of active-low inputs (inverted before use).
 *  seg: ins = A,B,C,D,lamp-test,blank (both active-low pins listed in invIn), bit = segment 0..6 = a..g; lamp test lights all, blanking turns all off. */
export interface Gate { fn: GateFn; ins: number[]; out: number; bit?: number; sel?: number; inv?: boolean; invIn?: number[] }
export interface Amp { inp: number; inn: number; out: number }
/** Boolean function of a gate. xor of many inputs = odd parity. */
export function logic(fn: GateFn, ins: boolean[], o: { bit?: number; sel?: number; inv?: boolean; invIn?: number[] } = {}): boolean {
  const v = ins.map((b, i) => (o.invIn?.includes(i) ? !b : b));
  const num = (xs: boolean[]) => xs.reduce((s, b, i) => s + (b ? 2 ** i : 0), 0);
  const all = v.every(Boolean), any = v.some(Boolean), odd = v.filter(Boolean).length % 2 === 1;
  let r: boolean;
  if (fn === 'add') { const n = (v.length - 1) / 2; r = ((num(v.slice(0, n)) + num(v.slice(n, 2 * n)) + (v[2 * n] ? 1 : 0)) >> (o.bit ?? 0) & 1) === 1; }
  else if (fn === 'mux') { const k = o.sel ?? 1, d = 2 ** k; r = v.slice(d + k).every(Boolean) && v[num(v.slice(d, d + k))]; }
  else if (fn === 'seg') { const d = num(v.slice(0, 4)); r = v[4] ? true : v[5] ? false : d <= 9 && ((SEG7[d] >> (o.bit ?? 0)) & 1) === 1; }
  else if (fn === 'dec') { const k = o.sel ?? 3; r = v.slice(k).every(Boolean) && num(v.slice(0, k)) === (o.bit ?? 0); }
  else r = { and: all, or: any, nand: !all, nor: !any, xor: odd, not: !v[0] }[fn];
  return o.inv ? !r : r;
}
/** Source waveform: dc = constant, step = 0 before t=0 then v, sine / square = +-v (bipolar) at freq Hz. */
export interface Wave { kind: 'dc' | 'step' | 'sine' | 'square' | 'clock'; freq?: number } // clock = 0 / V square, low for the first half period
export interface Ctx { t?: number; pre?: boolean; iL?: number[]; tr?: boolean; st?: number[][] } // time, "just before t=0" flag, previous C / L currents, trapezoidal (else backward Euler)
export function srcValue(e: { v: number; w?: Wave }, t: number, pre = false): number {
  const w = e.w; if (!w || w.kind === 'dc') return e.v;
  if (w.kind === 'step') return pre || t < 0 ? 0 : e.v;
  const f = w.freq ?? 1000;
  if (w.kind === 'clock') return (((f * t) % 1) + 1) % 1 >= 0.5 ? e.v : 0;
  if (w.kind === 'sine') return e.v * Math.sin(2 * Math.PI * f * t);
  return (((f * t) % 1) + 1) % 1 < 0.5 ? e.v : -e.v;
}
export interface Result { v: number[]; i: number[]; ok: boolean; st?: number[][] } // st = per-element latch state carried between transient steps (555: [q])
const VT = 0.025852;
const nv = (xv: number[], node: number) => (node > 0 ? xv[node - 1] : 0); // node voltage from the solution vector (node 0 = ground)
/** Diode current and conductance at voltage v (anode - cathode). A Zener adds a reverse-breakdown branch that reaches 5 mA at -bv. */
function diodeEval(e: { is?: number; n?: number; bv?: number }, v: number) {
  const nVt = (e.n ?? 1) * VT, Is = e.is ?? 1e-14, ex = Math.exp(Math.min(v / nVt, 80));
  let I = Is * (ex - 1), G = (Is / nVt) * ex;
  if (e.bv) { const knee = e.bv - VT * Math.log(5e-3 / Is), eb = Math.exp(Math.min(-(v + knee) / VT, 80)); I -= Is * (eb - 1); G += (Is / VT) * eb; }
  return { I, G };
}
/** Per-segment currents of a LED array at node voltages v. */
export function segCurrents(e: Extract<El, { t: 'DA' }>, v: number[]) { return e.anodes.map(an => diodeEval(e, v[an] - v[e.b]).I); }
type BJT = Extract<El, { t: 'Q' }>;
/** Ebers-Moll transport model of an NPN in terms of its junction voltages xe = Vbe, xc = Vbc (a PNP is the same with all voltages negated). */
function bjtEval(e: BJT, xe: number, xc: number) {
  const Is = e.is ?? 1e-14, bf = e.bf ?? 200, br = e.br ?? 3, fe = Math.exp(xe / VT), fc = Math.exp(xc / VT);
  const ef = Is * (fe - 1), er = Is * (fc - 1), gf = (Is / VT) * fe, gr = (Is / VT) * fc;
  return { Ic: ef - er * (1 + 1 / br), Ib: ef / bf + er / br, gf, gr };
}
/** Current leaving each terminal into the device, as [node, I0, d/dVbe, d/dVbc]: collector, base, emitter. */
function bjtRows(e: BJT, m: ReturnType<typeof bjtEval>): [number, number, number, number][] {
  const bf = e.bf ?? 200, br = e.br ?? 3;
  return [[e.a, m.Ic, m.gf, -m.gr * (1 + 1 / br)], [e.base, m.Ib, m.gf / bf, m.gr / br], [e.b, -(m.Ic + m.Ib), -(m.gf + m.gf / bf), m.gr]];
}
type MOS = Extract<El, { t: 'M' }>;
function mosF(K: number, vth: number, lam: number, vgs: number, vds: number) { // level-1 square law, vds >= 0
  const vov = vgs - vth; if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  const m = 1 + lam * vds;
  if (vds < vov) { const core = vov * vds - vds * vds / 2; return { id: K * core * m, gm: K * vds * m, gds: K * (vov - vds) * m + K * core * lam }; }
  const core = vov * vov / 2; return { id: K * core * m, gm: K * vov * m, gds: K * core * lam };
}
/** Drain current and partials for model voltages xg = Vgs, xd = Vds (a PMOS is the same with all voltages negated). Negative Vds swaps drain and source. */
function mosEval(e: MOS, xg: number, xd: number) {
  const K = e.kp ?? 0.05, vth = e.vth ?? 2.1, lam = e.lambda ?? 0;
  if (xd >= 0) return mosF(K, vth, lam, xg, xd);
  const r = mosF(K, vth, lam, xg - xd, -xd);
  return { id: -r.id, gm: -r.gm, gds: r.gm + r.gds };
}
const G_ON = 2; // a logic IC is unpowered (outputs float) below this supply voltage

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
  const vq = els.map(() => [0, 0]); // BJT linearisation point: junction voltages [Vbe, Vbc] (x -1 for a PNP)
  let x = new Array(N).fill(0), ok = false;
  const gs = els.map(e => (e.t === 'G' ? e.gates.map(() => 0) : e.t === 'OA' ? e.amps.map(() => 0) : e.t === 'F' ? new Array(outCount(e.units)).fill(0) : e.t === 'CP' ? e.amps.map(() => 0) : e.t === 'REG' ? [0] : [] as number[]));
  const vda = els.map(e => (e.t === 'DA' ? e.anodes.map(() => 0) : [] as number[])); // LED-array junction voltages // digital outputs / op-amp state: 0 = unpowered (floating), G: 1 low 2 high, OA: 1 linear 2 sat high 3 sat low
  const q0 = els.map((e, k) => (e.t === 'T' ? ctx.st?.[k]?.[0] ?? 0 : 0)); // 555 latch as committed at the end of the previous time step
  const ts = els.map((e, k) => (e.t === 'T' ? [q0[k], 0] : [] as number[])); // 555 now: [latch q, powered]
  const vm = els.map(() => [0, 0]); // MOSFET linearisation point: model [Vgs, Vds]
  for (let it = 0; it < 200 && !ok; it++) {
    let changed = false; // digital / latch states come from the previous iterate; not converged until they stop flipping
    els.forEach((e, k) => {
      const vp = nv(x, e.a), vn = nv(x, e.b);
      if (e.t === 'G') {
        const th = vn + (vp - vn) / 2, on = vp - vn > G_ON;
        e.gates.forEach((gt, j) => {
          const s = !on ? 0 : logic(gt.fn, gt.ins.map(n => nv(x, n) > th), gt) ? 2 : 1;
          if (s !== gs[k][j]) { gs[k][j] = s; changed = true; }
        });
      } else if (e.t === 'OA') {
        const on = vp - vn > (e.vmin ?? 3), hi = vp - (e.hi ?? 1.5), lo = vn + (e.lo ?? 0.05);
        e.amps.forEach((am, j) => {
          // powers up linear; linear may saturate either way; a clamped output can only be released back to linear (never straight to the other rail), otherwise 2 <-> 3 can ping-pong
          const want = (e.gain ?? 1e5) * (nv(x, am.inp) - nv(x, am.inn)), old = gs[k][j];
          const s = !on ? 0 : old === 2 ? (want >= hi ? 2 : 1) : old === 3 ? (want <= lo ? 3 : 1) : want >= hi && old === 1 ? 2 : want <= lo && old === 1 ? 3 : 1;
          if (s !== gs[k][j]) { gs[k][j] = s; changed = true; }
        });
      } else if (e.t === 'T') {
        const on = vp - vn > (e.vmin ?? 4.5), ref = nv(x, e.ctrl), lo = vn + (ref - vn) / 2; // upper comparator ref = CTRL, lower = CTRL / 2
        let q = q0[k];
        if (!on || nv(x, e.reset) - vn < 0.7) q = 0; else if (nv(x, e.trig) < lo) q = 1; else if (nv(x, e.thr) > ref) q = 0; // RESET beats TRIG beats THRESHOLD, else hold
        if (q !== ts[k][0] || (on ? 1 : 0) !== ts[k][1]) { ts[k] = [q, on ? 1 : 0]; changed = true; }
      } else if (e.t === 'REG') {
        const s = vp - vn < 1 ? 0 : vp - (e.drop ?? 2) >= vn + e.vout ? 1 : 2; // 0 = off, 1 = regulating, 2 = dropout
        if (s !== gs[k][0]) { gs[k][0] = s; changed = true; }
      } else if (e.t === 'CP') {
        const on = vp - vn > (e.vmin ?? 2);
        e.amps.forEach((am, j) => { // sinks while in+ < in-; 0.5 mV hysteresis stops the iteration chattering
          const vd = nv(x, am.inp) - nv(x, am.inn), s = !on ? 0 : (gs[k][j] === 2 ? vd < 5e-4 : vd < -5e-4) ? 2 : 1;
          if (s !== gs[k][j]) { gs[k][j] = s; changed = true; }
        });
      } else if (e.t === 'F') { // outputs from the state committed at the end of the previous step (plus live async controls)
        const th = vn + (vp - vn) / 2, on = vp - vn > G_ON, lv = (n: number) => nv(x, n) > th, vals = unitValues(e.units, ctx.st?.[k]);
        let o = 0;
        e.units.forEach((u, j) => outputs(u, vals[j], lv).forEach(([, hi, hz]) => { const s = !on || hz ? 0 : hi ? 2 : 1; if (s !== gs[k][o]) { gs[k][o] = s; changed = true; } o++; }));
      }
    });
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
      else if (e.t === 'G') e.gates.forEach((gt, j) => { if (gs[k][j]) g(gt.out, gs[k][j] === 2 ? e.a : e.b, 1 / (e.rout ?? 50)); }); // output = rout to Vcc or GND
      else if (e.t === 'Q') { // Newton companion: linearise the three terminal currents around the junction voltages in vq
        const s = e.pnp ? -1 : 1, [xe, xc] = vq[k];
        bjtRows(e, bjtEval(e, xe, xc)).forEach(([node, I0, dbe, dbc]) => {
          if (node <= 0) return;
          const add = (m: number, c: number) => { if (m > 0) A[node - 1][m - 1] += c; };
          add(e.base, dbe + dbc); add(e.b, -dbe); add(e.a, -dbc);
          z[node - 1] -= s * (I0 - dbe * xe - dbc * xc);
        });
      }
      else if (e.t === 'M') { // Newton companion around the model voltages in vm: I = gm*(Vg-Vs) + gds*(Vd-Vs) + const
        const s = e.pmos ? -1 : 1, [xg, xd] = vm[k], m = mosEval(e, xg, xd), c = s * (m.id - m.gm * xg - m.gds * xd);
        const add = (r: number, col: number, val: number) => { if (r > 0 && col > 0) A[r - 1][col - 1] += val; };
        add(e.a, e.gate, m.gm); add(e.a, e.b, -(m.gm + m.gds)); add(e.a, e.a, m.gds); if (e.a > 0) z[e.a - 1] -= c;
        add(e.b, e.gate, -m.gm); add(e.b, e.b, m.gm + m.gds); add(e.b, e.a, -m.gds); if (e.b > 0) z[e.b - 1] += c;
      }
      else if (e.t === 'OA') e.amps.forEach((am, j) => { // output: rout to a controlled source (linear) or to a clamp level (saturated)
        const st = gs[k][j]; if (!st || am.out <= 0) return;
        const R = e.rout ?? 75, Ag = e.gain ?? 1e5;
        A[am.out - 1][am.out - 1] += 1 / R;
        if (st === 1) { if (am.inp > 0) A[am.out - 1][am.inp - 1] -= Ag / R; if (am.inn > 0) A[am.out - 1][am.inn - 1] += Ag / R; }
        else z[am.out - 1] += (st === 2 ? nv(x, e.a) - (e.hi ?? 1.5) : nv(x, e.b) + (e.lo ?? 0.05)) / R;
      })
      else if (e.t === 'F') { let o = 0; e.units.forEach(u => outNodes(u).forEach(n => { const s = gs[k][o++]; if (s) g(n, s === 2 ? e.a : e.b, 1 / (e.rout ?? 50)); })); } // each output = rout to Vcc or GND
      else if (e.t === 'T') { // 555: internal 5k-5k-5k divider, output stage, discharge switch (on while the latch is reset)
        if (!ts[k][1]) return;
        const q = ts[k][0], rhi = e.rhi ?? 50;
        g(e.a, e.ctrl, 1 / 5000); g(e.ctrl, e.b, 1 / 10000);
        if (q) { g(e.out, e.a, 1 / rhi); src(e.out, e.a, (e.drop ?? 0) / rhi); } else { g(e.out, e.b, 1 / (e.rlo ?? 10)); g(e.dis, e.b, 1 / (e.rdis ?? 10)); }
      }
      else if (e.t === 'C' && dt > 0) { const G = ((ctx.tr ? 2 : 1) * e.v) / dt, vp = prev ? prev[e.a] - prev[e.b] : 0; g(e.a, e.b, G); src(e.a, e.b, -G * vp - (ctx.tr ? ctx.iL?.[k] ?? 0 : 0)); }
      else if (e.t === 'D') {
        const { I, G } = diodeEval(e, vd[k]); g(e.a, e.b, G); src(e.a, e.b, I - G * vd[k]);
      } else if (e.t === 'DA') { e.anodes.forEach((an, j) => { const { I, G } = diodeEval(e, vda[k][j]); g(an, e.b, G); src(an, e.b, I - G * vda[k][j]); });
      } else if (e.t === 'P') { const pos = e.pos ?? 0.5; g(e.a, e.wiper, 1 / Math.max(e.v * pos, 1)); g(e.wiper, e.b, 1 / Math.max(e.v * (1 - pos), 1));
      } else if (e.t === 'REG') {
        const s = gs[k][0]; if (!s) return;
        const G = 1 / (e.rout ?? 0.1); // output = Norton equivalent of the target level behind rout
        if (e.out > 0) { A[e.out - 1][e.out - 1] += G; if (s === 1) { if (e.b > 0) A[e.out - 1][e.b - 1] -= G; z[e.out - 1] += G * e.vout; } else { if (e.a > 0) A[e.out - 1][e.a - 1] -= G; z[e.out - 1] -= G * (e.drop ?? 2); } }
        src(e.a, e.b, e.iq ?? 0); // quiescent current, input -> reference pin
      } else if (e.t === 'CP') { e.amps.forEach((am, j) => { if (gs[k][j] === 2) g(am.out, e.b, 1 / (e.rsat ?? 60)); }); // open collector: pulls low or lets go
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
    els.forEach((e, k) => { // LED array: limit each segment junction like a diode
      if (e.t !== 'DA') return;
      e.anodes.forEach((an, j) => { const w = volt(xn, an) - volt(xn, e.b) - vda[k][j]; delta = Math.max(delta, Math.abs(w)); vda[k][j] += Math.max(-0.3, Math.min(0.3, w)); });
    });
    els.forEach((e, k) => { // same limiting for the two BJT junctions
      if (e.t !== 'Q') return;
      const s = e.pnp ? -1 : 1, want = [s * (volt(xn, e.base) - volt(xn, e.b)), s * (volt(xn, e.base) - volt(xn, e.a))];
      want.forEach((w, j) => { const d = w - vq[k][j]; delta = Math.max(delta, Math.abs(d)); vq[k][j] += Math.max(-0.3, Math.min(0.3, d)); });
    });
    els.forEach((e, k) => { // MOSFET: limit the model-voltage steps (square law is stiff near the region boundaries)
      if (e.t !== 'M') return;
      const s = e.pmos ? -1 : 1, want = [s * (volt(xn, e.gate) - volt(xn, e.b)), s * (volt(xn, e.a) - volt(xn, e.b))];
      want.forEach((w, j) => { const d = w - vm[k][j]; delta = Math.max(delta, Math.abs(d)); vm[k][j] += Math.max(-1, Math.min(1, d)); });
    });
    x = xn;
    ok = delta < 1e-9 && it > 0 && !changed;
  }
  const v = [0, ...x.slice(0, n - 1)];
  const i = els.map((e, k) => {
    const dV = v[e.a] - v[e.b];
    if (e.t === 'R') return dV / e.v;
    if (e.t === 'L') { if (dt <= 0) return dV * 1e4; const G = dt / ((ctx.tr ? 2 : 1) * e.v), vp = prev ? prev[e.a] - prev[e.b] : 0; return G * dV + (ctx.tr ? G * vp : 0) + (ctx.iL?.[k] ?? 0); }
    if (e.t === 'I') return e.v;
    if (e.t === 'C') { if (dt <= 0) return 0; const G = ((ctx.tr ? 2 : 1) * e.v) / dt; return G * (dV - (prev ? prev[e.a] - prev[e.b] : 0)) - (ctx.tr ? ctx.iL?.[k] ?? 0 : 0); }
    if (e.t === 'D') return diodeEval(e, dV).I;
    if (e.t === 'DA') return segCurrents(e, v).reduce((s, c) => s + c, 0);
    if (e.t === 'P') return (v[e.a] - v[e.wiper]) / Math.max(e.v * (e.pos ?? 0.5), 1);
    if (e.t === 'REG') { const s = gs[k][0]; return s ? (e.iq ?? 0) + Math.max(0, ((s === 1 ? v[e.b] + e.vout : v[e.a] - (e.drop ?? 2)) - v[e.out]) / (e.rout ?? 0.1)) : 0; } // input current = quiescent + load
    if (e.t === 'CP') return gs[k].some(Boolean) ? e.iq ?? 0 : 0;
    if (e.t === 'Q') { const s = e.pnp ? -1 : 1; return s * bjtEval(e, s * (v[e.base] - v[e.b]), s * (v[e.base] - v[e.a])).Ic; } // current into the collector (negative for a PNP)
    if (e.t === 'M') { const s = e.pmos ? -1 : 1; return s * mosEval(e, s * (v[e.gate] - v[e.b]), s * (v[e.a] - v[e.b])).id; } // current into the drain (negative for a PMOS)
    if (e.t === 'OA') { // supply current = quiescent + current the outputs source into the circuit
      if (!gs[k].some(Boolean)) return 0;
      return (e.iq ?? 0) + e.amps.reduce((sum, am, j) => { const st = gs[k][j], R = e.rout ?? 75; const target = st === 1 ? (e.gain ?? 1e5) * (v[am.inp] - v[am.inn]) : st === 2 ? v[e.a] - (e.hi ?? 1.5) : v[e.b] + (e.lo ?? 0.05); return st ? sum + Math.max(0, (target - v[am.out]) / R) : sum; }, 0);
    }
    if (e.t === 'T') { // supply current = divider + quiescent + output source current
      if (!ts[k][1]) return 0;
      const rhi = e.rhi ?? 50;
      return (v[e.a] - v[e.ctrl]) / 5000 + (e.iq ?? 0) + (ts[k][0] ? Math.max(0, (v[e.a] - (e.drop ?? 0) - v[e.out]) / rhi) : 0);
    }
    if (e.t === 'F') { let o = 0; return e.units.reduce((sum, u) => sum + outNodes(u).reduce((s2, n) => (gs[k][o++] === 2 ? s2 + (v[e.a] - v[n]) / (e.rout ?? 50) : s2), 0), 0); } // supply current = outputs driven high
    if (e.t === 'G') return e.gates.reduce((s, gt, j) => (gs[k][j] === 2 ? s + (v[e.a] - v[gt.out]) / (e.rout ?? 50) : s), 0); // supply current = sum over outputs driven high
    return -x[n - 1 + vsIdx.indexOf(k)];
  });
  const st = els.map((e, k) => { // state to carry into the next time step
    if (e.t !== 'F') return [ts[k][0]];
    const vp = v[e.a], vn = v[e.b], th = vn + (vp - vn) / 2;
    return stepUnits(e.units, ctx.st?.[k], n => v[n] > th, vp - vn > G_ON);
  });
  return { v, i, ok, st };
}

/** Time-domain run (trapezoidal after a backward-Euler first step). Starts from the DC state with sources at their t=0- value. */
export function transient(els: El[], n: number, tStop: number, steps: number) {
  const dt = tStop / steps, t: number[] = [0];
  let r = solve(els, n, undefined, 0, { t: 0, pre: true });
  const iLof = (i: number[]) => i.map((x, k) => (els[k].t === 'L' || els[k].t === 'C' ? x : 0));
  const v = [r.v], i = [r.i]; let iL = iLof(r.i), st = r.st;
  for (let k = 1; k <= steps; k++) {
    r = solve(els, n, v[k - 1], dt, { t: k * dt, iL, tr: k > 1, st }); st = r.st; // st carries 555 latches between steps
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
    else if (e.t === 'D') y(e.a, e.b, diodeEval(e, op[e.a] - op[e.b]).G, 0);
    else if (e.t === 'DA') e.anodes.forEach(an => y(an, e.b, diodeEval(e, op[an] - op[e.b]).G, 0));
    else if (e.t === 'REG') { if (op[e.a] - op[e.b] >= 1) y(e.out, 0, 1 / (e.rout ?? 0.1), 0); } // the regulated output holds its DC level: AC ground behind rout
    else if (e.t === 'P') { const pos = e.pos ?? 0.5; y(e.a, e.wiper, 1 / Math.max(e.v * pos, 1), 0); y(e.wiper, e.b, 1 / Math.max(e.v * (1 - pos), 1), 0); }
    else if (e.t === 'Q') { // small-signal (hybrid-pi equivalent) from the same partials at the DC operating point
      const s = e.pnp ? -1 : 1;
      bjtRows(e, bjtEval(e, s * (op[e.base] - op[e.b]), s * (op[e.base] - op[e.a]))).forEach(([node, , dbe, dbc]) => {
        if (node <= 0) return;
        const add = (m: number, c: number) => { if (m > 0) Ar[node - 1][m - 1] += c; };
        add(e.base, dbe + dbc); add(e.b, -dbe); add(e.a, -dbc);
      });
    }
    else if (e.t === 'M') { // small-signal gm, gds at the operating point
      const s = e.pmos ? -1 : 1, m = mosEval(e, s * (op[e.gate] - op[e.b]), s * (op[e.a] - op[e.b]));
      const add = (r: number, col: number, val: number) => { if (r > 0 && col > 0) Ar[r - 1][col - 1] += val; };
      add(e.a, e.gate, m.gm); add(e.a, e.b, -(m.gm + m.gds)); add(e.a, e.a, m.gds);
      add(e.b, e.gate, -m.gm); add(e.b, e.b, m.gm + m.gds); add(e.b, e.a, -m.gds);
    }
    else if (e.t === 'OA') { // single-pole op-amp: A(jw) = A0 / (1 + j f / fp), fp = GBW / A0; saturated outputs are held (no small-signal gain)
      const vp = op[e.a], vn = op[e.b], R = e.rout ?? 75, A0 = e.gain ?? 1e5;
      if (vp - vn <= (e.vmin ?? 3)) return;
      const xf = f / ((e.gbw ?? 1e6) / A0), gr = A0 / (1 + xf * xf), gi = (-A0 * xf) / (1 + xf * xf);
      e.amps.forEach(am => {
        if (am.out <= 0) return;
        const want = A0 * (op[am.inp] - op[am.inn]), lin = want < vp - (e.hi ?? 1.5) && want > vn + (e.lo ?? 0.05), r = am.out - 1;
        Ar[r][r] += 1 / R;
        if (lin) [[am.inp, -1], [am.inn, 1]].forEach(([m, sg]) => { if (m > 0) { Ar[r][m - 1] += (sg * gr) / R; Ai[r][m - 1] += (sg * gi) / R; } });
      });
    }
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