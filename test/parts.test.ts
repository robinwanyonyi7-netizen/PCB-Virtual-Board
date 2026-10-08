import { describe, it, expect } from 'vitest';
import { solve, acSolve, transient, type El } from '../src/solver';
import { buildNetlist, type Part } from '../src/breadboard';
import { COMPONENTS, icElement, placeHoles } from '../src/components';

const pinNo = (ref: string, name: string) => { const i = COMPONENTS[ref].pins.findIndex(p => p.name === name); if (i < 0) throw new Error(`${ref} has no pin ${name}`); return i + 1; };

/** Power a logic chip at 5 V, drive the named input pins (1 = 5 V, 0 = 0 V) and read every named output as a bit. */
function runChip(ref: string, drive: Record<string, 0 | 1>, read: string[]) {
  const d = COMPONENTS[ref], m = d.model; if (m.type !== 'gates') throw new Error('not a gate chip');
  const node = (p: number) => (p === m.gnd ? 0 : p === m.vcc ? 1 : p + 1);
  const n = d.pins.length + 2, el = icElement({ ref, pins: d.pins.map((_, i) => `p${i + 1}`) }, h => node(+h.slice(1)))!;
  const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, el, ...Object.entries(drive).map(([name, b]): El => ({ t: 'V', a: node(pinNo(ref, name)), b: 0, v: b ? 5 : 0 }))];
  const r = solve(els, n);
  expect(r.ok, ref).toBe(true);
  return Object.fromEntries(read.map(name => [name, r.v[node(pinNo(ref, name))] > 2.5 ? 1 : 0]));
}

describe('combinational chips behave like their datasheets (independent of the solver\'s own truth tables)', () => {
  it('74HC283 adds two 4-bit numbers plus carry-in', () => {
    for (const [a, b, c] of [[0, 0, 0], [1, 1, 0], [7, 8, 0], [9, 7, 1], [15, 15, 1], [5, 10, 0], [12, 4, 1]]) {
      const drive: Record<string, 0 | 1> = { C0: c as 0 | 1 };
      for (let i = 0; i < 4; i++) { drive[`A${i + 1}`] = ((a >> i) & 1) as 0 | 1; drive[`B${i + 1}`] = ((b >> i) & 1) as 0 | 1; }
      const o = runChip('74HC283', drive, ['S1', 'S2', 'S3', 'S4', 'C4']), sum = a + b + c;
      expect(o.S1 | (o.S2 << 1) | (o.S3 << 2) | (o.S4 << 3) | (o.C4 << 4), `${a}+${b}+${c}`).toBe(sum);
    }
  });
  it('74HC151 selects one of eight inputs (and W = not Y; ~E high forces Y low)', () => {
    const data = 0b10110010;
    for (let s = 0; s < 8; s++) {
      const drive: Record<string, 0 | 1> = { S0: (s & 1) as 0 | 1, S1: ((s >> 1) & 1) as 0 | 1, S2: ((s >> 2) & 1) as 0 | 1, '~E': 0 };
      for (let i = 0; i < 8; i++) drive[`D${i}`] = ((data >> i) & 1) as 0 | 1;
      const o = runChip('74HC151', drive, ['Y', 'W']);
      expect(o.Y, `select ${s}`).toBe((data >> s) & 1); expect(o.W).toBe(1 - o.Y);
    }
    const off = runChip('74HC151', { D0: 1, D1: 1, S0: 0, S1: 0, S2: 0, '~E': 1 }, ['Y', 'W']);
    expect(off).toEqual({ Y: 0, W: 1 });
  });
  it('74HC138 pulls exactly the addressed output low, and nothing when disabled', () => {
    for (let a = 0; a < 8; a++) {
      const drive: Record<string, 0 | 1> = { A: (a & 1) as 0 | 1, B: ((a >> 1) & 1) as 0 | 1, C: ((a >> 2) & 1) as 0 | 1, G1: 1, '~G2A': 0, '~G2B': 0 };
      const o = runChip('74HC138', drive, [0, 1, 2, 3, 4, 5, 6, 7].map(n => `~Y${n}`));
      [0, 1, 2, 3, 4, 5, 6, 7].forEach(n => expect(o[`~Y${n}`], `addr ${a}, line ${n}`).toBe(n === a ? 0 : 1));
    }
    for (const off of [{ G1: 0, '~G2A': 0, '~G2B': 0 }, { G1: 1, '~G2A': 1, '~G2B': 0 }, { G1: 1, '~G2A': 0, '~G2B': 1 }] as Record<string, 0 | 1>[]) {
      const o = runChip('74HC138', { A: 1, B: 0, C: 1, ...off }, [0, 1, 2, 3, 4, 5, 6, 7].map(n => `~Y${n}`));
      expect(Object.values(o).every(b => b === 1)).toBe(true);
    }
  });
  it('74HC157 passes A when S is low and B when S is high; ~G high forces the outputs low', () => {
    for (const s of [0, 1] as const) {
      const o = runChip('74HC157', { S: s, '1A': 1, '1B': 0, '2A': 0, '2B': 1, '3A': 1, '3B': 1, '4A': 0, '4B': 0, '~G': 0 }, ['1Y', '2Y', '3Y', '4Y']);
      expect(o).toEqual(s === 0 ? { '1Y': 1, '2Y': 0, '3Y': 1, '4Y': 0 } : { '1Y': 0, '2Y': 1, '3Y': 1, '4Y': 0 });
    }
    expect(Object.values(runChip('74HC157', { S: 0, '1A': 1, '2A': 1, '3A': 1, '4A': 1, '~G': 1 }, ['1Y', '2Y', '3Y', '4Y'])).every(b => b === 0)).toBe(true);
  });
  it('7410 / 7420 are 3- and 4-input NANDs', () => {
    expect(runChip('7410', { '1A': 1, '1B': 1, '1C': 1 }, ['1Y'])['1Y']).toBe(0);
    expect(runChip('7410', { '1A': 1, '1B': 1, '1C': 0 }, ['1Y'])['1Y']).toBe(1);
    expect(runChip('7420', { '2A': 1, '2B': 1, '2C': 1, '2D': 1 }, ['2Y'])['2Y']).toBe(0);
    expect(runChip('7420', { '2A': 1, '2B': 1, '2C': 1, '2D': 0 }, ['2Y'])['2Y']).toBe(1);
  });
});

describe('MOSFET (level 1)', () => {
  // node 1 = Vdd, 2 = drain, 3 = gate; source on ground; 2N7000-like kp = 0.05, vth = 2.1
  const sw = (vgs: number, rd: number, vdd: number, pmos = false): El[] => pmos
    ? [{ t: 'V', a: 1, b: 0, v: vdd }, { t: 'V', a: 3, b: 0, v: vdd - vgs }, { t: 'R', a: 2, b: 0, v: rd }, { t: 'M', a: 2, b: 1, gate: 3, pmos: true }]
    : [{ t: 'V', a: 1, b: 0, v: vdd }, { t: 'V', a: 3, b: 0, v: vgs }, { t: 'R', a: 1, b: 2, v: rd }, { t: 'M', a: 2, b: 0, gate: 3 }];
  it('triode: a fully-on switch has a few ohms of Rds(on)', () => {
    const r = solve(sw(5, 1000, 5), 4), id = r.i[3];
    expect(r.ok).toBe(true); expect(r.v[2]).toBeGreaterThan(0.02); expect(r.v[2]).toBeLessThan(0.05);
    expect(id).toBeCloseTo((5 - r.v[2]) / 1000, 6);
  });
  it('saturation: Id = kp/2 * (Vgs - Vth)^2', () => {
    const r = solve(sw(3, 100, 10), 4), id = 0.025 * 0.9 ** 2;
    expect(r.ok).toBe(true); expect(r.i[3]).toBeCloseTo(id, 6); expect(r.v[2]).toBeCloseTo(10 - id * 100, 4);
  });
  it('cut-off below threshold', () => {
    const r = solve(sw(1, 1000, 5), 4); expect(r.v[2]).toBeCloseTo(5, 4); expect(Math.abs(r.i[3])).toBeLessThan(1e-9);
  });
  it('PMOS mirrors NMOS: same magnitude, current flows out of the drain', () => {
    const r = solve(sw(3, 100, 10, true), 4);
    expect(r.ok).toBe(true); expect(r.i[3]).toBeCloseTo(-0.025 * 0.9 ** 2, 6); expect(r.v[2]).toBeCloseTo(0.025 * 0.9 ** 2 * 100, 4);
  });
  it('common-source gain is -gm * Rd (AC)', () => {
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 10 }, { t: 'R', a: 1, b: 2, v: 100 }, { t: 'V', a: 4, b: 0, v: 3 }, { t: 'V', a: 3, b: 4, v: 0 }, { t: 'M', a: 2, b: 0, gate: 3 }];
    const op = solve(els, 5), a = acSolve(els, 5, 3, 1000, op.v)!, gm = 0.05 * 0.9;
    expect(a.re[2] / (-gm * 100)).toBeCloseTo(1, 2);
  });
  it('2N7000 and BS170 have opposite pin orders but behave the same on the board', () => {
    const run = (ref: string) => {
      const holes = placeHoles(ref, 'm:3:6')!, pin = (n: string) => holes[pinNo(ref, n) - 1];
      const parts: Part[] = [
        { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref, pins: holes, value: 0 },
        { kind: 'WIRE', pins: [pin('S'), 'r:1:1'].map((h, i) => (i ? h : h.replace(':6', ':7'))) as [string, string], value: 0 }, // source -> GND
        { kind: 'WIRE', pins: [pin('G').replace(':6', ':7'), 'r:0:1'], value: 0 },                                                 // gate -> +5 V
        { kind: 'R', pins: [pin('D').replace(':6', ':7'), 'r:0:2'], value: 1000 },                                                 // drain load
      ];
      const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes);
      expect(nl.warnings, ref).toEqual([]); expect(r.ok, ref).toBe(true);
      return Math.abs(r.i[nl.parts.findIndex(p => p.kind === 'R')]);
    };
    expect(run('2N7000')).toBeGreaterThan(4.9e-3); expect(run('BS170')).toBeCloseTo(run('2N7000'), 9);
  });
  it('random bias sweep converges (NMOS + PMOS)', () => {
    let bad = 0;
    for (const pmos of [false, true]) for (const vdd of [3.3, 5, 12, 30]) for (const vgs of [0, 1.5, 2.1, 2.5, 4, 8, 12, 30]) for (const rd of [1, 100, 1e3, 1e5]) {
      const r = solve(sw(Math.min(vgs, vdd), rd, vdd, pmos), 4);
      const id = pmos ? -r.i[3] : r.i[3], iR = pmos ? r.v[2] / rd : (vdd - r.v[2]) / rd;
      if (!r.ok || Math.abs(id - iR) > 1e-6 * (1 + Math.abs(iR))) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('op-amps', () => {
  const OA = (extra: Partial<Extract<El, { t: 'OA' }>> = {}): El => ({ t: 'OA', a: 1, b: 0, amps: [{ inp: 2, inn: 3, out: 4 }], ...extra });
  // nodes: 1 = V+, 2 = in+, 3 = in-, 4 = out, 5 = divider/input source
  const noninv = (vcc: number, vin: number): El[] => [{ t: 'V', a: 1, b: 0, v: vcc }, { t: 'V', a: 2, b: 0, v: vin }, { t: 'R', a: 4, b: 3, v: 10e3 }, { t: 'R', a: 3, b: 0, v: 1e3 }, OA()];
  it('non-inverting amplifier: gain = 1 + Rf/R1', () => {
    const r = solve(noninv(12, 0.5), 5); expect(r.ok).toBe(true); expect(r.v[4]).toBeCloseTo(5.5 / (1 + 11 / 1e5), 4); // finite open-loop gain (1e5) leaves a 0.011 % error
  });
  it('output clamps 1.5 V below the supply (LM358-style) and near ground', () => {
    // the clamp level is behind the 75 ohm output resistance, so the 11k feedback network sags it slightly
    expect(solve(noninv(12, 2), 5).v[4]).toBeCloseTo(10.5 * 11000 / 11075, 4);
    expect(solve(noninv(12, -2), 5).v[4]).toBeCloseTo(0.05 * 11000 / 11075, 4);
  });
  it('inverting amplifier about a Vcc/2 reference on a single supply', () => {
    // V+ = 12, ref = 6 V on in+, Rin 1k from the input, Rf 10k: Vout = 6 - 10 * (Vin - 6)
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 12 }, { t: 'V', a: 2, b: 0, v: 6 }, { t: 'V', a: 5, b: 0, v: 6.2 }, { t: 'R', a: 5, b: 3, v: 1e3 }, { t: 'R', a: 4, b: 3, v: 10e3 }, OA()];
    const r = solve(els, 6); expect(r.ok).toBe(true); expect(r.v[4]).toBeCloseTo(4, 3);
  });
  it('unpowered op-amp does not drive its output', () => { expect(Math.abs(solve(noninv(1, 0.5), 5).v[4])).toBeLessThan(0.1); });
  it('closed-loop bandwidth = GBW / gain: -3 dB at about 91 kHz for a gain of 11', () => {
    const els = noninv(12, 0.5), op = solve(els, 5), at = (f: number) => { const a = acSolve(els, 5, 1, f, op.v)!; return Math.hypot(a.re[4], a.im[4]); }; // |Vout| for 1 V in on the in+ source
    expect(at(100)).toBeCloseTo(11, 1);
    expect(at(1e6 / 11) / 11).toBeCloseTo(Math.SQRT1_2, 1);
    expect(at(1e6)).toBeLessThan(1.5);
  });
  it('LM358 voltage follower on the breadboard', () => {
    const holes = placeHoles('LM358', 'm:0:5')!; // pins 1..4 on row 6, 5..8 on row 5
    expect(holes.slice(0, 4)).toEqual(['m:0:5', 'm:1:5', 'm:2:5', 'm:3:5']);
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref: 'LM358', pins: holes, value: 0 },
      { kind: 'WIRE', pins: ['m:0:4', 'r:0:2'], value: 0 },   // pin 8 V+ -> +5 V
      { kind: 'WIRE', pins: ['m:3:6', 'r:1:2'], value: 0 },   // pin 4 GND -> 0 V
      { kind: 'WIRE', pins: ['m:0:6', 'm:1:6'], value: 0 },   // OUT1 (pin 1) -> IN1- (pin 2): follower
      { kind: 'R', pins: ['m:2:6', 'r:0:1'], value: 10e3 },   // divider on IN1+ (pin 3): 2.5 V
      { kind: 'R', pins: ['m:2:7', 'r:1:1'], value: 10e3 },
      { kind: 'R', pins: ['m:0:7', 'r:1:3'], value: 1e3 },    // 1k load on OUT1
    ];
    const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes);
    expect(nl.warnings).toEqual([]); expect(r.ok).toBe(true);
    expect(r.i[nl.parts.findIndex(p => p.kind === 'R' && p.value === 1e3)]).toBeCloseTo(2.5e-3, 5);
  });
});

describe('555 timer', () => {
  // nodes: 1 = Vcc, 2 = DIS, 3 = THR/TRIG, 4 = OUT; R1 = 1k (Vcc-DIS), R2 = 10k (DIS-THR), C = 100 nF
  const astable = (): El[] => [
    { t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 2, v: 1e3 }, { t: 'R', a: 2, b: 3, v: 10e3 }, { t: 'C', a: 3, b: 0, v: 100e-9 },
    { t: 'T', a: 1, b: 0, trig: 3, thr: 3, out: 4, reset: 1, ctrl: 5, dis: 2, drop: 1.7 },
  ];
  it('astable: f = 1.44 / ((R1 + 2 R2) C) and duty = (R1 + R2) / (R1 + 2 R2)', () => {
    const tr = transient(astable(), 6, 12e-3, 6000), v = tr.v.map(x => x[4]), up: number[] = [], down: number[] = [];
    for (let k = 1; k < v.length; k++) { if (v[k - 1] < 2.5 && v[k] >= 2.5) up.push(tr.t[k]); if (v[k - 1] >= 2.5 && v[k] < 2.5) down.push(tr.t[k]); }
    expect(up.length).toBeGreaterThanOrEqual(6);
    const period = (up[up.length - 1] - up[1]) / (up.length - 2), high = down.find(d => d > up[2])! - up[2];
    expect(period).toBeCloseTo(Math.LN2 * 21e3 * 100e-9, 4);       // 1.455 ms
    expect(high / period).toBeCloseTo(11 / 21, 1);                   // 52 %
    expect(Math.max(...v.slice(100))).toBeCloseTo(3.3, 1);           // NE555 high level = Vcc - 1.7 V
  });
  it('RESET low forces the output low; TRIG low sets it high', () => {
    const mk = (trig: number, reset: number): El[] => [{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'V', a: 2, b: 0, v: trig }, { t: 'V', a: 3, b: 0, v: reset }, { t: 'T', a: 1, b: 0, trig: 2, thr: 0, out: 4, reset: 3, ctrl: 5, dis: 6, drop: 1.7 }];
    expect(solve(mk(0, 5), 7).v[4]).toBeCloseTo(3.3, 1); // triggered: output high
    expect(solve(mk(0, 0), 7).v[4]).toBeLessThan(0.05);  // reset wins
    expect(solve(mk(5, 5), 7).v[4]).toBeLessThan(0.05);  // idle: output low
  });
  it('NE555 and LMC555 pinouts on a DIP-8 footprint', () => {
    for (const ref of ['NE555', 'LMC555']) {
      const m = COMPONENTS[ref].model; expect(m.type).toBe('timer');
      expect(COMPONENTS[ref].pins.map(p => p.name)).toEqual(['GND', 'TRIG', 'OUT', '~RESET', 'CTRL', 'THR', 'DIS', 'VCC']);
      expect(placeHoles(ref, 'm:2:5')!.length).toBe(8);
    }
  });
});
