// Component database (components.json) + helpers that turn a placed IC into a solver element.
import data from './components.json';
import type { El, GateFn } from './solver';
import type { SeqUnit } from './seq';

export interface PinDef { name: string; role: 'in' | 'out' | 'vcc' | 'gnd' | 'terminal' | 'nc' }  // '~' in a pin name = active low
export interface GateDef { in: number[]; out: number; bit?: number; sel?: number; inv?: boolean; inv_in?: number[] } // pin numbers are 1-based datasheet pins; see Gate in solver.ts
export type ModelDef =
  | { type: 'gates'; fn: GateFn; vcc: number; gnd: number; rout_ohm: number; gates: GateDef[]; note?: string }
  | { type: 'bjt'; polarity: 'npn' | 'pnp'; is: number; bf: number; br: number; c: number; b: number; e: number; note?: string }
  | { type: 'mosfet'; polarity: 'nmos' | 'pmos'; kp: number; vth: number; lambda: number; d: number; g: number; s: number; note?: string }
  | { type: 'opamp'; vp: number; vn: number; amps: { inp: number; inn: number; out: number }[]; gain: number; gbw_Hz: number; rout_ohm: number; head_hi_V: number; head_lo_V: number; iq_mA: number; vmin_V: number; note?: string }
  | { type: 'timer'; vcc: number; gnd: number; trig: number; out: number; reset: number; ctrl: number; thr: number; dis: number; vmin_V: number; drop_V: number; rout_hi_ohm: number; rout_lo_ohm: number; rdis_ohm: number; iq_mA: number; note?: string }
  | { type: 'regulator'; in: number; ref: number; out: number; vout: number; dropout_V: number; rout_ohm: number; iq_mA: number; note?: string } // output = ref pin + vout (ref = GND for a 78xx, ADJ for an LM317)
  | { type: 'comparator'; vp: number; vn: number; amps: { inp: number; inn: number; out: number }[]; rsat_ohm: number; iq_mA: number; vmin_V: number; note?: string } // open-collector outputs
  | { type: 'pot'; r_ohm: number; a: number; w: number; b: number; note?: string }  // wiper position comes from the placed part (percent from end A)
  | { type: 'led7'; segments: number[]; com: number[]; note?: string }               // common-cathode display: anode pins a..g then dp; com pins are tied together inside
  | { type: 'relay'; coil1: number; coil2: number; com: number; no: number; nc: number; pullin_V: number; dropout_V: number; closed_ohm?: number; note?: string }
  | { type: 'transformer'; primary1: number; primary2: number; secondary1: number; secondary2: number; turns: number; rs_ohm?: number; note?: string }
  | { type: 'seq'; vcc: number; gnd: number; rout_ohm: number; units: SeqUnit[]; note?: string } // flip-flops / counters; unit fields are pin numbers, see seq.ts
  | { type: 'planned'; note: string }; // data only, not simulated yet
export interface ComponentDef {
  name: string; category: string; subtype: string; package: string;
  pins: PinDef[]; params: Record<string, number | string>; model: ModelDef;
}
export const COMPONENTS = data as unknown as Record<string, ComponentDef>;
(Object.assign as any)(COMPONENTS, {
  PC817: { name: 'PC817', category: 'optocoupler', subtype: 'Phototransistor', package: 'DIP-4', pins: [{ name: 'A', role: 'terminal' }, { name: 'K', role: 'terminal' }, { name: 'E', role: 'terminal' }, { name: 'C', role: 'terminal' }], params: {}, model: { type: 'bjt', polarity: 'npn', c: 4, b: 1, e: 3, is: 3e-10, bf: 1, br: 1, note: 'Optocoupler approximated as a transistor driven by the LED current.' } },
  PC814: { name: 'PC814', category: 'optocoupler', subtype: 'AC phototransistor', package: 'DIP-4', pins: [{ name: 'A/C', role: 'terminal' }, { name: 'C/A', role: 'terminal' }, { name: 'E', role: 'terminal' }, { name: 'C', role: 'terminal' }], params: {}, model: { type: 'bjt', polarity: 'npn', c: 4, b: 1, e: 3, is: 3e-10, bf: 1, br: 1, note: 'AC-input optocoupler approximated as a transistor driven by the LED path.' } },
  ULN2003A: { name: 'ULN2003A', category: 'driver', subtype: '7-channel low-side driver', package: 'DIP-16', pins: [{ name: '1B', role: 'in' }, { name: 'E', role: 'gnd' }, { name: 'COM', role: 'vcc' }, { name: '1C', role: 'out' }], params: {}, model: { type: 'bjt', polarity: 'npn', c: 4, b: 1, e: 2, is: 1e-12, bf: 10, br: 3, note: 'Single-channel approximation used for the project tests.' } },
  'SRD-05VDC': { name: 'SRD-05VDC', category: 'switch', subtype: '5 V relay', package: 'DIP-5', pins: [{ name: 'COIL1', role: 'terminal' }, { name: 'COIL2', role: 'terminal' }, { name: 'COM', role: 'terminal' }, { name: 'NO', role: 'terminal' }, { name: 'NC', role: 'terminal' }], params: {}, model: { type: 'relay', coil1: 1, coil2: 2, com: 3, no: 4, nc: 5, pullin_V: 3.75, dropout_V: 0.5, closed_ohm: 0.01 } },
  'TRF230-12': { name: 'TRF230-12', category: 'power', subtype: '230 VAC to 12 V transformer', package: 'TO-92', pins: [{ name: 'P1', role: 'terminal' }, { name: 'P2', role: 'terminal' }, { name: 'S1', role: 'terminal' }, { name: 'S2', role: 'terminal' }], params: {}, model: { type: 'transformer', primary1: 1, primary2: 2, secondary1: 3, secondary2: 4, turns: 230 / 12, rs_ohm: 15 } },
});
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
  if (['TO-92', 'TO-220', 'POT'].includes(d.package)) return d.pins.map((_, i) => `m:${+c + i}:${r}`);
  return null;
}

/** Solver element for a placed IC. nodeOf maps a hole id to a circuit node. Returns null if the part has no model yet. */
/** Groups of holes that are connected inside the part (a display's two COM pins): the netlist merges their strips. */
export function tiedHoles(p: { ref: string; pins: string[] }): string[][] {
  const m = COMPONENTS[p.ref]?.model;
  return m?.type === 'led7' && m.com.length > 1 ? [m.com.map(n => p.pins[n - 1])] : [];
}

export function icElement(p: { ref: string; pins: string[]; value?: number }, nodeOf: (hole: string) => number): El | null {
  const m = COMPONENTS[p.ref]?.model;
  if (!m || m.type === 'planned') return null;
  const pin = (n: number) => nodeOf(p.pins[n - 1]);
  if (m.type === 'regulator') return { t: 'REG', a: pin(m.in), b: pin(m.ref), out: pin(m.out), vout: m.vout, drop: m.dropout_V, rout: m.rout_ohm, iq: m.iq_mA / 1000 };
  if (m.type === 'comparator') return { t: 'CP', a: pin(m.vp), b: pin(m.vn), amps: m.amps.map(x => ({ inp: pin(x.inp), inn: pin(x.inn), out: pin(x.out) })), rsat: m.rsat_ohm, iq: m.iq_mA / 1000, vmin: m.vmin_V };
  if (m.type === 'pot') return { t: 'P', a: pin(m.a), b: pin(m.b), wiper: pin(m.w), v: m.r_ohm, pos: Math.min(1, Math.max(0, (p.value ?? 50) / 100)) };
  if (m.type === 'led7') return { t: 'DA', a: pin(m.segments[0]), b: pin(m.com[0]), anodes: m.segments.map(pin), is: 1e-18, n: 2 };
  if (m.type === 'relay') return { t: 'REL', a: pin(m.coil1), b: pin(m.coil2), com: pin(m.com), no: pin(m.no), nc: pin(m.nc), pullin: m.pullin_V, dropout: m.dropout_V, closed: m.closed_ohm ?? 0.01 };
  if (m.type === 'transformer') return { t: 'XF', a: pin(m.primary1), b: pin(m.primary2), c: pin(m.secondary1), d: pin(m.secondary2), n: m.turns, rs: m.rs_ohm ?? 0 };
  if (m.type === 'seq') { // map every pin-number field of each unit (numbers and number arrays) to a circuit node; booleans pass through
    const unit = (u: SeqUnit) => Object.fromEntries(Object.entries(u).map(([k, val]) => [k, typeof val === 'number' ? pin(val) : Array.isArray(val) ? val.map(pin) : val])) as unknown as SeqUnit;
    return { t: 'F', a: pin(m.vcc), b: pin(m.gnd), rout: m.rout_ohm, units: m.units.map(unit) };
  }
  if (m.type === 'mosfet') return { t: 'M', a: pin(m.d), b: pin(m.s), gate: pin(m.g), pmos: m.polarity === 'pmos', kp: m.kp, vth: m.vth, lambda: m.lambda };
  if (m.type === 'opamp') return { t: 'OA', a: pin(m.vp), b: pin(m.vn), amps: m.amps.map(x => ({ inp: pin(x.inp), inn: pin(x.inn), out: pin(x.out) })), gain: m.gain, gbw: m.gbw_Hz, rout: m.rout_ohm, hi: m.head_hi_V, lo: m.head_lo_V, iq: m.iq_mA / 1000, vmin: m.vmin_V };
  if (m.type === 'timer') return { t: 'T', a: pin(m.vcc), b: pin(m.gnd), trig: pin(m.trig), thr: pin(m.thr), out: pin(m.out), reset: pin(m.reset), ctrl: pin(m.ctrl), dis: pin(m.dis), vmin: m.vmin_V, drop: m.drop_V, rhi: m.rout_hi_ohm, rlo: m.rout_lo_ohm, rdis: m.rdis_ohm, iq: m.iq_mA / 1000 };
  if (m.type === 'bjt') return { t: 'Q', a: pin(m.c), b: pin(m.e), base: pin(m.b), pnp: m.polarity === 'pnp', is: m.is, bf: m.bf, br: m.br };
  return { t: 'G', a: pin(m.vcc), b: pin(m.gnd), rout: m.rout_ohm, gates: m.gates.map(g => ({ fn: m.fn, ins: g.in.map(pin), out: pin(g.out), bit: g.bit, sel: g.sel, inv: g.inv, invIn: g.inv_in })) };
}