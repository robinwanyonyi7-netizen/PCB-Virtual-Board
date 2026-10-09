// Clocked (sequential) logic: flip-flops and counters.
// A chip is a list of units. Each unit keeps a small state vector [value, clkPrev, ...inputs sampled one step earlier].
// Outputs are combinational functions of that state (plus a few live inputs), so the solver can treat them like gate outputs.
// The state advances once per time step: a clock edge seen between two steps clocks the unit using the inputs sampled
// BEFORE the edge (so data that changes together with the clock is not captured early). Outputs therefore change one
// time step after the edge, which stands in for propagation delay.

export interface DFF { kind: 'dff'; clk: number; d: number; q: number; qn: number; clr: number; pre: number }                       // rising edge; clr, pre active low, async
export interface JKFF { kind: 'jkff'; clk: number; j: number; k: number; q: number; qn: number; clr: number; pre: number }       // falling edge; clr, pre active low, async
export interface Counter { kind: 'counter'; clk: number; clr: number; sync_clr?: boolean; load: number; data: number[]; cep: number; cet: number; q: number[]; tc: number } // 74HC161/163: rising edge; clr, load active low
export interface Ripple { kind: 'ripple'; clk: number; clr: number; q: number[] }                                                  // 74HC393: falling edge; clr active high, async
export interface Decade { kind: 'decade'; clk: number; ce: number; clr: number; q: number[]; co: number }                          // 74HC4017: rising edge while ce is low; clr active high, async; q = 10 one-hot outputs
export interface Shift595 { kind: 'shift595'; clk: number; ds: number; stcp: number; mr: number; oe: number; q: number[]; q7s: number } // clk = SHCP (rising), stcp = storage clock (rising), mr and oe active low; value = shift register | storage << 8; q outputs float while oe is high
export interface Latch373 { kind: 'latch373'; clk: number; oe: number; d: number[]; q: number[] }                                   // clk = LE: transparent while high, holds the last value when it falls; oe active low (outputs float)
export type SeqUnit = DFF | JKFF | Counter | Ripple | Decade | Shift595 | Latch373;
type Lv = (node: number) => boolean; // logic level of a node

/** Input nodes sampled each step, in a fixed order per kind (their previous values are what a clock edge acts on). */
export function inNodes(u: SeqUnit): number[] {
  switch (u.kind) {
    case 'dff': return [u.d];
    case 'jkff': return [u.j, u.k];
    case 'counter': return [u.clr, u.load, ...u.data, u.cep, u.cet];
    case 'ripple': return [];
    case 'decade': return [u.ce];
    case 'shift595': return [u.ds, u.stcp, u.mr];
    case 'latch373': return [];
  }
}
export const unitLen = (u: SeqUnit) => 2 + inNodes(u).length;
/** Output nodes, in the same order as outputs(). */
export function outNodes(u: SeqUnit): number[] {
  switch (u.kind) {
    case 'dff': case 'jkff': return [u.q, u.qn];
    case 'counter': return [...u.q, u.tc];
    case 'ripple': return u.q;
    case 'decade': return [...u.q, u.co];
    case 'shift595': return [...u.q, u.q7s];
    case 'latch373': return u.q;
  }
}
export const outCount = (units: SeqUnit[]) => units.reduce((s, u) => s + outNodes(u).length, 0);

/** Level-sensitive (asynchronous) override of the stored value, if any control is active. */
function asyncValue(u: SeqUnit, v: number, lv: Lv): { v: number; active: boolean } {
  if (u.kind === 'dff' || u.kind === 'jkff') {
    const clr = !lv(u.clr), pre = !lv(u.pre);
    if (clr && pre) return { v: 1, active: true }; // both low: both outputs high (see outputs()), undefined afterwards; choose 1
    if (clr) return { v: 0, active: true };
    if (pre) return { v: 1, active: true };
  } else if (u.kind === 'counter') { if (!u.sync_clr && !lv(u.clr)) return { v: 0, active: true }; }
  else if (u.kind === 'shift595') { if (!lv(u.mr)) return { v: v & 0xff00, active: true }; } // master reset clears the shift register only
  else if (u.kind === 'latch373') return { v, active: false };
  else if (lv(u.clr)) return { v: 0, active: true };
  return { v, active: false };
}
export const effective = (u: SeqUnit, v: number, lv: Lv) => asyncValue(u, v, lv).v;

/** Output levels (node, high?, floating?) for a stored value v. Order matches outNodes(). */
export type Out = [number, boolean, boolean?];
export function outputs(u: SeqUnit, v: number, lv: Lv): Out[] {
  const w = effective(u, v, lv);
  switch (u.kind) {
    case 'dff': case 'jkff': { const both = !lv(u.clr) && !lv(u.pre); return [[u.q, both || w === 1], [u.qn, both || w === 0]]; }
    case 'counter': return [...u.q.map((n, i): Out => [n, ((w >> i) & 1) === 1]), [u.tc, lv(u.cet) && w === (1 << u.q.length) - 1]];
    case 'ripple': return u.q.map((n, i): Out => [n, ((w >> i) & 1) === 1]);
    case 'decade': return [...u.q.map((n, i): Out => [n, w === i]), [u.co, w < 5]];
    case 'shift595': { const hz = lv(u.oe); return [...u.q.map((n, i): Out => [n, ((w >> (8 + i)) & 1) === 1, hz]), [u.q7s, ((w >> 7) & 1) === 1]]; }
    case 'latch373': { const hz = lv(u.oe), open = lv(u.clk); return u.q.map((n, i): Out => [n, open ? lv(u.d[i]) : ((w >> i) & 1) === 1, hz]); }
  }
}

/** Advance one unit by one time step. prev = its state vector from the previous step (undefined at the first solve: no edge is possible yet). */
function stepUnit(u: SeqUnit, prev: number[] | undefined, lv: Lv, on: boolean): number[] {
  const ins = inNodes(u).map(n => (lv(n) ? 1 : 0)), clk = lv(u.clk);
  if (!on) return [0, clk ? 1 : 0, ...ins.map(() => 0)]; // an unpowered chip forgets its state
  let v = prev ? prev[0] : 0;
  const clkPrev = prev ? prev[1] === 1 : clk, pin = prev ? prev.slice(2) : ins, a = asyncValue(u, v, lv);
  if (a.active) v = a.v;
  else if (prev) {
    const rising = !clkPrev && clk, falling = clkPrev && !clk;
    if (u.kind === 'dff' && rising) v = pin[0];
    else if (u.kind === 'jkff' && falling) v = pin[0] && pin[1] ? 1 - v : pin[0] ? 1 : pin[1] ? 0 : v;
    else if (u.kind === 'counter' && rising) {
      const w = u.data.length, [clr, load] = pin, cep = pin[2 + w], cet = pin[3 + w];
      if (u.sync_clr && !clr) v = 0;
      else if (!load) v = pin.slice(2, 2 + w).reduce((s, b, i) => s + (b ? 2 ** i : 0), 0);
      else if (cep && cet) v = (v + 1) % 2 ** w;
    }
    else if (u.kind === 'ripple' && falling) v = (v + 1) % 2 ** u.q.length;
    else if (u.kind === 'decade' && rising && !pin[0]) v = (v + 1) % 10;
    else if (u.kind === 'shift595') { // inputs sampled one step earlier: [ds, stcp, mr]
      let sh = v & 0xff, st = (v >> 8) & 0xff;
      if (!pin[1] && lv(u.stcp)) st = sh;                        // storage takes the shift register as it was BEFORE this step's shift
      if (rising) sh = ((sh << 1) | (pin[0] ? 1 : 0)) & 0xff;
      v = sh | (st << 8);
    }
  }
  if (u.kind === 'latch373' && clk) v = u.d.reduce((s, n, i) => s + (lv(n) ? 2 ** i : 0), 0); // transparent while LE is high
  return [v, clk ? 1 : 0, ...ins];
}
/** State vector of a whole chip after this step (flat: units concatenated). */
export function stepUnits(units: SeqUnit[], prev: number[] | undefined, lv: Lv, on: boolean): number[] {
  const ok = prev && prev.length === units.reduce((s, u) => s + unitLen(u), 0);
  let off = 0;
  return units.flatMap(u => { const len = unitLen(u), p = ok ? prev!.slice(off, off + len) : undefined; off += len; return stepUnit(u, p, lv, on); });
}
/** Stored value of each unit (for outputs()), from a flat state vector. */
export function unitValues(units: SeqUnit[], st: number[] | undefined): number[] {
  const ok = st && st.length === units.reduce((s, u) => s + unitLen(u), 0);
  let off = 0;
  return units.map(u => { const v = ok ? st![off] : 0; off += unitLen(u); return v; });
}