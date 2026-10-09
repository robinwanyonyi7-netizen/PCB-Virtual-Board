import { describe, it, expect } from 'vitest';
import { solve, transient, acSolve, segCurrents, type El } from '../src/solver';
import { buildNetlist, type Part } from '../src/breadboard';
import { COMPONENTS, icElement, placeHoles } from '../src/components';
import { logicChart } from '../src/plot';
import { demoParts } from '../src/demo';

const pinNo = (ref: string, name: string) => { const i = COMPONENTS[ref].pins.findIndex(p => p.name === name); if (i < 0) throw new Error(`${ref} has no pin ${name}`); return i + 1; };
type Drive = 0 | 1 | { f: number };
/** Power a gates/seq chip at 5 V, drive named pins (0, 1 or a 0-5 V square clock), transient, read pins as bits at given times. */
function sim(ref: string, drive: Record<string, Drive>, tStop: number, steps: number) {
  const d = COMPONENTS[ref], m = d.model; if (m.type !== 'seq' && m.type !== 'gates') throw new Error('unsupported');
  const node = (p: number) => (p === m.gnd ? 0 : p === m.vcc ? 1 : p + 1);
  let next = d.pins.length + 2;
  const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, icElement({ ref, pins: d.pins.map((_, i) => `p${i + 1}`) }, h => node(+h.slice(1)))!];
  for (const [name, val] of Object.entries(drive)) {
    const n = node(pinNo(ref, name));
    if (typeof val === 'number') els.push({ t: 'V', a: n, b: 0, v: val ? 5 : 0 });
    else { const off = next++; els.push({ t: 'V', a: off, b: 0, v: 2.5 }, { t: 'V', a: n, b: off, v: 2.5, w: { kind: 'square', freq: val.f } }); }
  }
  const tr = transient(els, next, tStop, steps), dt = tStop / steps;
  return { at: (name: string, time: number) => (tr.v[Math.round(time / dt)][node(pinNo(ref, name))] > 2.5 ? 1 : 0), v: (name: string, time: number) => tr.v[Math.round(time / dt)][node(pinNo(ref, name))] };
}
const word = (at: (n: string, t: number) => number, names: string[], t: number) => names.reduce((s, nm, i) => s + (at(nm, t) << i), 0);
const Q8 = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'];

describe('74HC595 shift register', () => {
  it('shifts DS in on SHCP, copies to the outputs on STCP; Q7S is the shift register\'s last bit', () => {
    // DS falls at 4.5 ms (111 Hz), SHCP edges at 1..8 ms: bits shifted in = 1,1,1,1,0,0,0,0 -> register 0xF0. STCP rises at 8.5 ms.
    const { at } = sim('74HC595', { '~MR': 1, '~OE': 0, DS: { f: 1000 / 9 }, SHCP: { f: 1000 }, STCP: { f: 1000 / 8.5 } }, 10e-3, 1000);
    expect(word(at, Q8, 8.25e-3)).toBe(0);               // storage not yet loaded
    expect(word(at, Q8, 8.75e-3)).toBe(0xf0);            // loaded: Q4..Q7 high
    expect(at('Q7S', 8.25e-3)).toBe(1);                  // the shift register itself already holds 0xF0
  });
  it('~MR clears the shift register; ~OE high floats the outputs', () => {
    expect(sim('74HC595', { '~MR': 0, '~OE': 0, DS: 1, SHCP: { f: 1000 }, STCP: 0 }, 9e-3, 900).at('Q7S', 8.5e-3)).toBe(0);
    const on = sim('74HC595', { '~MR': 1, '~OE': 0, DS: 1, SHCP: { f: 1000 }, STCP: { f: 1000 / 8.5 } }, 9.5e-3, 950);
    expect(on.at('Q3', 9.25e-3)).toBe(1);
    const off = sim('74HC595', { '~MR': 1, '~OE': 1, DS: 1, SHCP: { f: 1000 }, STCP: { f: 1000 / 8.5 } }, 9.5e-3, 950);
    expect(off.v('Q3', 9.25e-3)).toBeLessThan(0.1);      // no drive: the pin floats (reads 0 with nothing attached)
  });
});

describe('74HC373 latch', () => {
  it('passes D while LE is high, holds when LE falls, follows again when LE rises', () => {
    const { at } = sim('74HC373', { '~OE': 0, LE: { f: 1000 }, D0: { f: 750 } }, 1.5e-3, 300);
    expect(at('Q0', 0.2e-3)).toBe(1);   // LE high, D0 high
    expect(at('Q0', 0.8e-3)).toBe(1);   // LE fell at 0.5 ms with D0 = 1; D0 fell at 0.67 ms but the latch holds
    expect(at('Q0', 1.1e-3)).toBe(0);   // LE high again, D0 low
  });
  it('a static byte passes straight through', () => {
    const d: Record<string, Drive> = { '~OE': 0, LE: 1 }; [1, 0, 1, 0, 0, 1, 0, 1].forEach((b, i) => (d[`D${i}`] = b as 0 | 1));
    expect(word(sim('74HC373', d, 1e-4, 4).at, Q8, 5e-5)).toBe(0b10100101);
  });
});

describe('74HC4511 BCD to 7-segment', () => {
  const SEG = 'abcdefg', lit = (ref: string, drive: Record<string, 0 | 1>) => { const s = sim(ref, drive, 1e-4, 4); return [...SEG].filter(c => s.at(c, 5e-5)).join(''); };
  const digit = (n: number): Record<string, 0 | 1> => ({ A: (n & 1) as 0 | 1, B: ((n >> 1) & 1) as 0 | 1, C: ((n >> 2) & 1) as 0 | 1, D: ((n >> 3) & 1) as 0 | 1, '~LT': 1, '~BI': 1 });
  it('shows digits 0-9 and blanks 10-15', () => {
    const want = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
    want.forEach((w, n) => expect(lit('74HC4511', digit(n)), `digit ${n}`).toBe(w));
    for (let n = 10; n < 16; n++) expect(lit('74HC4511', digit(n)), `code ${n}`).toBe('');
  });
  it('lamp test lights everything, blanking turns everything off', () => {
    expect(lit('74HC4511', { ...digit(1), '~LT': 0 })).toBe('abcdefg');
    expect(lit('74HC4511', { ...digit(8), '~BI': 0 })).toBe('');
  });
});

describe('analog and power parts', () => {
  it('LED display: a segment lights from its resistor, nothing else does, and both COM pins are tied', () => {
    expect(placeHoles('DISP7', 'm:0:5')!.length).toBe(10);
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref: 'DISP7', pins: placeHoles('DISP7', 'm:0:5')!, value: 0 },
      { kind: 'WIRE', pins: ['m:2:6', 'r:1:1'], value: 0 },        // only the pin-3 COM is wired to ground...
      { kind: 'R', pins: ['r:0:1', 'm:3:3'], value: 330 },          // ...and segment a (pin 7 = m:3:4, same strip as m:3:3) is driven through 330 ohm
    ];
    const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes), el = nl.els.find(e => e.t === 'DA')!;
    expect(nl.warnings).toEqual([]); expect(r.ok).toBe(true);
    const seg = segCurrents(el as Extract<El, { t: 'DA' }>, r.v);
    expect(seg[0]).toBeGreaterThan(8e-3); expect(seg[0]).toBeLessThan(11e-3);   // ~10 mA: 5 V - ~1.7 V over 330 ohm
    expect(seg.slice(1).every(c => Math.abs(c) < 1e-9)).toBe(true);
  });
  it('potentiometer: wiper voltage follows its position, with and without load', () => {
    const pot = (pos: number, load?: number): number => {
      const els: El[] = [{ t: 'V', a: 1, b: 0, v: 10 }, icElement({ ref: 'POT10K', pins: ['p1', 'p2', 'p3'], value: pos }, h => ({ p1: 1, p2: 2, p3: 0 })[h]!)!];
      if (load) els.push({ t: 'R', a: 2, b: 0, v: load });
      return solve(els, 3).v[2];
    };
    expect(pot(25)).toBeCloseTo(7.5, 4); expect(pot(50)).toBeCloseTo(5, 4); expect(pot(0)).toBeCloseTo(10, 2); // the track never goes below 1 ohm, so the end reads 9.999 V expect(pot(100)).toBeLessThan(0.01);
    expect(pot(25, 10e3)).toBeCloseTo(10 * (7.5e3 * 10e3 / 17.5e3) / (2.5e3 + 7.5e3 * 10e3 / 17.5e3), 3); // 6.316 V
  });
  it('78xx and LM317 regulators: regulate, drop out, and switch off', () => {
    const reg = (ref: string, vin: number, load = 1e3, adj?: [number, number]) => {
      const d = COMPONENTS[ref].model; if (d.type !== 'regulator') throw new Error();
      // nodes: 1 = in, 2 = out, 3 = adj/gnd reference node
      const els: El[] = [{ t: 'V', a: 1, b: 0, v: vin }, { t: 'R', a: 2, b: 0, v: load }, ...(adj ? [{ t: 'R', a: 2, b: 3, v: adj[0] } as El, { t: 'R', a: 3, b: 0, v: adj[1] } as El] : [])];
      const pin = (n: number) => (n === d.in ? 1 : n === d.out ? 2 : adj ? 3 : 0);
      els.push(icElement({ ref, pins: ['p1', 'p2', 'p3'] }, h => pin(+h.slice(1)))!);
      const r = solve(els, 4); return { r, v: r.v[2], i: r.i[els.length - 1] };
    };
    expect(reg('LM7805', 9).v).toBeCloseTo(5, 2);
    expect(reg('LM7812', 15).v).toBeCloseTo(12, 2);
    expect(reg('LM7805', 6).v).toBeCloseTo(4, 2);                       // dropout: input - 2 V
    expect(Math.abs(reg('LM7805', 0.5).v)).toBeLessThan(0.05);          // off
    const a = reg('LM7805', 9); expect(a.i).toBeCloseTo(5e-3 + 5e-3, 4); // quiescent 5 mA + 5 mA load
    expect(reg('LM317', 12, 1e3, [240, 720]).v).toBeGreaterThan(4.98); expect(reg('LM317', 12, 1e3, [240, 720]).v).toBeLessThan(5.1); // 1.25 (1 + 720/240) = 5 V plus the adjust-pin current
  });
  it('a regulator holds its output at AC ground: ripple on the input barely reaches the output', () => {
    const m = COMPONENTS.LM7805.model; if (m.type !== 'regulator') throw new Error();
    const map: Record<number, number> = { [m.in]: 1, [m.ref]: 0, [m.out]: 2 };
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 9 }, { t: 'R', a: 2, b: 0, v: 1e3 }, icElement({ ref: 'LM7805', pins: ['p1', 'p2', 'p3'] }, h => map[+h.slice(1)])!];
    const op = solve(els, 3), a = acSolve(els, 3, 0, 1000, op.v)!;
    expect(Math.hypot(a.re[2], a.im[2])).toBeLessThan(1e-3); // 1 V of ripple in, under 1 mV out
  });
  it('LM393: open-collector output sinks when IN+ < IN-, needs a pull-up', () => {
    const cmp = (vp: number, vm: number) => {
      // nodes: 1 = Vcc, 2 = IN+, 3 = IN-, 4 = OUT
      const m = COMPONENTS.LM393.model; if (m.type !== 'comparator') throw new Error();
      const map: Record<number, number> = { [m.vp]: 1, [m.vn]: 0, [m.amps[0].inp]: 2, [m.amps[0].inn]: 3, [m.amps[0].out]: 4 };
      const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'V', a: 2, b: 0, v: vp }, { t: 'V', a: 3, b: 0, v: vm }, { t: 'R', a: 1, b: 4, v: 10e3 },
        icElement({ ref: 'LM393', pins: COMPONENTS.LM393.pins.map((_, i) => `p${i + 1}`) }, h => map[+h.slice(1)] ?? 5)!];
      const r = solve(els, 6); expect(r.ok).toBe(true); return r.v[4];
    };
    expect(cmp(3, 2)).toBeCloseTo(5, 2);
    expect(cmp(1, 2)).toBeCloseTo(5 * 60 / 10060, 3);
    expect(cmp(2.001, 2)).toBeCloseTo(5, 2); expect(cmp(1.999, 2)).toBeLessThan(0.05); // just outside the 0.5 mV hysteresis band
  });
  it('Zener clamps at its voltage; Schottky drops less than a silicon diode', () => {
    const zener = (vin: number, vz: number, r: number) => { const els: El[] = [{ t: 'V', a: 1, b: 0, v: vin }, { t: 'R', a: 1, b: 2, v: r }, { t: 'D', a: 0, b: 2, bv: vz }]; const s = solve(els, 3); return { v: s.v[2], ok: s.ok }; };
    expect(zener(12, 5.1, 1e3).v).toBeCloseTo(5.1, 1);
    expect(zener(3, 5.1, 1e3).v).toBeGreaterThan(2.9);                       // below breakdown: just a reverse-biased diode
    let bad = 0; for (const vin of [6, 9, 12, 24, 48]) for (const r of [100, 1e3, 1e4]) for (const vz of [3.3, 5.1, 12]) { const z = zener(vin, vz, r); if (!z.ok || (vin > vz + 1 && Math.abs(z.v - vz) > 0.6)) bad++; }
    expect(bad).toBe(0);
    const fwd = (d: Partial<Extract<El, { t: 'D' }>>) => solve([{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 2, v: 470 }, { t: 'D', a: 2, b: 0, ...d }], 3).v[2];
    expect(fwd({})).toBeGreaterThan(0.6); expect(fwd({ is: 3e-8, n: 1.05 })).toBeLessThan(0.45); expect(fwd({ is: 3e-8, n: 1.05 })).toBeGreaterThan(0.25);
  });
  it('dual supply: a +/-12 V inverting amplifier swings negative and clamps 2 V inside the rails', () => {
    const amp = (vin: number) => {
      // nodes: 1 = +12, 2 = -12 (second battery: + to ground, - to node 2), 3 = inverting input, 4 = out, 5 = input source
      const m = COMPONENTS.LM741.model; if (m.type !== 'opamp') throw new Error();
      const map: Record<number, number> = { [m.vp]: 1, [m.vn]: 2, [m.amps[0].inp]: 0, [m.amps[0].inn]: 3, [m.amps[0].out]: 4 };
      const els: El[] = [{ t: 'V', a: 1, b: 0, v: 12 }, { t: 'V', a: 0, b: 2, v: 12 }, { t: 'V', a: 5, b: 0, v: vin }, { t: 'R', a: 5, b: 3, v: 1e3 }, { t: 'R', a: 4, b: 3, v: 10e3 },
        icElement({ ref: 'LM741', pins: COMPONENTS.LM741.pins.map((_, i) => `p${i + 1}`) }, h => map[+h.slice(1)] ?? 6)!];
      const r = solve(els, 7); expect(r.ok).toBe(true); return r.v[4];
    };
    expect(amp(0.5)).toBeCloseTo(-5, 2); expect(amp(-0.5)).toBeCloseTo(5, 2);
    // clamped at -12 + 2 = -10 V behind 75 ohm, and the feedback network pushes 1.09 mA into the output: -10 + 75 * (20 - 10 Vo) / 110k = -9.9187 V
    expect(amp(2)).toBeCloseTo(-9.9187, 2);
  });
});

describe('switch, clock and the logic view on the real board', () => {
  const wire = (a: string, b: string): Part => ({ kind: 'WIRE', pins: [a, b], value: 0 });
  it('switch: closed passes current, open does not', () => {
    const run = (closed: 0 | 1) => { const parts: Part[] = [{ kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'SW', pins: ['r:0:1', 'm:2:2'], value: closed }, { kind: 'R', pins: ['m:2:3', 'r:1:1'], value: 1000 }];
      const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes); return Math.abs(r.i[nl.parts.findIndex(p => p.kind === 'R')]); };
    expect(run(1)).toBeCloseTo(5e-3, 5); expect(run(0)).toBeLessThan(1e-8);
  });
  it('a CLK part on the board clocks a 74HC161 counter (full netlist, transient)', () => {
    const ic = placeHoles('74HC161', 'm:0:5')!;
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref: '74HC161', pins: ic, value: 0 },
      wire('m:0:3', 'r:0:1'), wire('m:7:6', 'r:1:1'),                         // VCC (pin 16), GND (pin 8)
      wire('m:0:6', 'r:0:2'), wire('m:7:3', 'r:0:3'), wire('m:6:6', 'r:0:4'), wire('m:6:3', 'r:0:5'), // ~MR, ~PE, CEP, CET high
      { kind: 'CLK', pins: ['m:1:6', 'r:1:2'], value: 1000 },                // clock into CP (pin 2)
      { kind: 'R', pins: ['m:2:3', 'r:1:3'], value: 10e3 },                  // Q0 (pin 14 = m:2:4) loaded so we can probe it
    ];
    const nl = buildNetlist(parts); expect(nl.warnings).toEqual([]);
    const q0 = nl.nodeOf('m:2:3'), tr = transient(nl.els, nl.nodes, 6e-3, 600), at = (t: number) => (tr.v[Math.round(t / 1e-5)][q0] > 2.5 ? 1 : 0);
    // rising edges of the 1 kHz clock at 0.5, 1.5, 2.5 ms...: Q0 toggles each time
    expect([0.75e-3, 1.75e-3, 2.75e-3, 3.75e-3, 4.75e-3].map(at)).toEqual([1, 0, 1, 0, 1]);
  });
  it('logicChart draws one lane per signal', () => {
    const t = [0, 1, 2, 3], svg = logicChart([{ name: 'CP', role: 'in', x: t, bits: [false, true, false, true] }, { name: 'Q0', role: 'out', x: t, bits: [false, false, true, true] }], { title: 'demo', xlabel: 'time (s)', xunit: 's' });
    expect((svg.match(/<polyline/g) ?? []).length).toBe(2); expect(svg).toContain('>CP<'); expect(svg).toContain('>Q0<');
  });

  it('whole demo board: 4511 shows a 5 on the display (a, c, d, f, g lit), and the transistor LED driver lights its LED', () => {
    const nl = buildNetlist(demoParts), r = solve(nl.els, nl.nodes);
    expect(nl.warnings).toEqual([]); expect(r.ok).toBe(true);
    const disp = nl.els.find(e => e.t === 'DA') as Extract<El, { t: 'DA' }>, seg = segCurrents(disp, r.v), names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
    const lit = names.filter((_, i) => seg[i] > 4e-3).join(''), dark = names.filter((_, i) => Math.abs(seg[i]) < 1e-6).join('');
    expect(lit).toBe('acdfg'); expect(dark).toBe('bedp'); // b, e and dp stay dark
    const led = nl.parts.findIndex(p => p.kind === 'LED'); expect(r.i[led]).toBeGreaterThan(8e-3); expect(r.i[led]).toBeLessThan(11e-3);
  });
});