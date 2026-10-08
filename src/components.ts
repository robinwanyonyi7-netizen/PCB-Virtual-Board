// Component database (components.json) + helpers that turn a placed IC into a solver element.
import data from './components.json';
import type { El, GateFn } from './solver';

export interface PinDef { name: string; role: 'in' | 'out' | 'vcc' | 'gnd' | 'terminal' | 'nc' }  // '~' in a pin name = active low
export interface GateDef { in: number[]; out: number; bit?: number; sel?: number; inv?: boolean; inv_in?: number[] } // pin numbers are 1-based datasheet pins; see Gate in solver.ts
export type ModelDef =
  | { type: 'gates'; fn: GateFn; vcc: number; gnd: number; rout_ohm: number; gates: GateDef[]; note?: string }
  | { type: 'bjt'; polarity: 'npn' | 'pnp'; is: number; bf: number; br: number; c: number; b: number; e: number; note?: string }
  | { type: 'mosfet'; polarity: 'nmos' | 'pmos'; kp: number; vth: number; lambda: number; d: number; g: number; s: number; note?: string }
  | { type: 'opamp'; vp: number; vn: number; amps: { inp: number; inn: number; out: number }[]; gain: number; gbw_Hz: number; rout_ohm: number; head_hi_V: number; head_lo_V: number; iq_mA: number; vmin_V: number; note?: string }
  | { type: 'timer'; vcc: number; gnd: number; trig: number; out: number; reset: number; ctrl: number; thr: number; dis: number; vmin_V: number; drop_V: number; rout_hi_ohm: number; rout_lo_ohm: number; rdis_ohm: number; iq_mA: number; note?: string }
  | { type: 'planned'; note: string }; // data only, not simulated yet
export interface ComponentDef {
  name: string; category: string; subtype: string; package: string;
  pins: PinDef[]; params: Record<string, number | string>; model: ModelDef;
}
export const COMPONENTS = data as unknown as Record<string, ComponentDef>;
export const isSimulable = (ref: string) => { const t = COMPONENTS[ref]?.model.type; return t !== undefined && t !== 'planned'; };

/** Breadboard holes for a DIP package with pin 1 at column `col`, straddling the centre gap.
 *  Notch to the left: pins 1..n/2 run left to right along row 6 (index 5), pins n/2+1..n run right to left along row 5 (index 4). */
export function dipHoles(ref: string, col: number): string[] | null {
  const d = COMPONENTS[ref]; if (!d || !d.package.startsWith('DIP')) return null;
  const n = d.pins.length, half = n / 2;
  return d.pins.map((_, k) => { const pin = k + 1; return pin <= half ? `m:${col + pin - 1}:5` : `m:${col + (n - pin)}:4`; });
}

/** Holes a part occupies when the user clicks `hole` (main board only). DIP: pin 1 at the clicked column, straddling the gap.
 *  TO-92: its 3 pins in the clicked row, left to right in datasheet pin order. */
export function placeHoles(ref: string, hole: string): string[] | null {
  const d = COMPONENTS[ref], [k, c, r] = hole.split(':');
  if (!d || k !== 'm') return null;
  if (d.package.startsWith('DIP')) return dipHoles(ref, +c);
  if (d.package === 'TO-92') return d.pins.map((_, i) => `m:${+c + i}:${r}`);
  return null;
}

/** Solver element for a placed IC. nodeOf maps a hole id to a circuit node. Returns null if the part has no model yet. */
export function icElement(p: { ref: string; pins: string[] }, nodeOf: (hole: string) => number): El | null {
  const m = COMPONENTS[p.ref]?.model;
  if (!m || m.type === 'planned') return null;
  const pin = (n: number) => nodeOf(p.pins[n - 1]);
  if (m.type === 'mosfet') return { t: 'M', a: pin(m.d), b: pin(m.s), gate: pin(m.g), pmos: m.polarity === 'pmos', kp: m.kp, vth: m.vth, lambda: m.lambda };
  if (m.type === 'opamp') return { t: 'OA', a: pin(m.vp), b: pin(m.vn), amps: m.amps.map(x => ({ inp: pin(x.inp), inn: pin(x.inn), out: pin(x.out) })), gain: m.gain, gbw: m.gbw_Hz, rout: m.rout_ohm, hi: m.head_hi_V, lo: m.head_lo_V, iq: m.iq_mA / 1000, vmin: m.vmin_V };
  if (m.type === 'timer') return { t: 'T', a: pin(m.vcc), b: pin(m.gnd), trig: pin(m.trig), thr: pin(m.thr), out: pin(m.out), reset: pin(m.reset), ctrl: pin(m.ctrl), dis: pin(m.dis), vmin: m.vmin_V, drop: m.drop_V, rhi: m.rout_hi_ohm, rlo: m.rout_lo_ohm, rdis: m.rdis_ohm, iq: m.iq_mA / 1000 };
  if (m.type === 'bjt') return { t: 'Q', a: pin(m.c), b: pin(m.e), base: pin(m.b), pnp: m.polarity === 'pnp', is: m.is, bf: m.bf, br: m.br };
  return { t: 'G', a: pin(m.vcc), b: pin(m.gnd), rout: m.rout_ohm, gates: m.gates.map(g => ({ fn: m.fn, ins: g.in.map(pin), out: pin(g.out), bit: g.bit, sel: g.sel, inv: g.inv, invIn: g.inv_in })) };
}