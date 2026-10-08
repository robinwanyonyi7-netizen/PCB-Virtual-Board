import { describe, it, expect } from 'vitest';
import { solve, acSolve, logic, type El } from '../src/solver';
import { buildNetlist, type Part } from '../src/breadboard';
import { COMPONENTS, dipHoles, placeHoles } from '../src/components';

const gateIcs = Object.entries(COMPONENTS).filter(([, d]) => d.model.type === 'gates');

describe('component database', () => {
  it('pin count matches package and gate pins are in range with the right roles', () => {
    for (const [id, d] of Object.entries(COMPONENTS)) {
      const n = d.package.match(/DIP-(\d+)/); if (n) expect(d.pins.length, id).toBe(+n[1]);
      if (d.model.type === 'bjt') { expect([d.model.c, d.model.b, d.model.e].sort(), id).toEqual([1, 2, 3]); expect(d.pins.length, id).toBe(3); }
      if (d.model.type !== 'gates') continue;
      const m = d.model;
      expect(d.pins[m.vcc - 1].role, id).toBe('vcc'); expect(d.pins[m.gnd - 1].role, id).toBe('gnd');
      m.gates.forEach(g => { expect(d.pins[g.out - 1].role, id).toBe('out'); g.in.forEach(i => expect(d.pins[i - 1].role, id).toBe('in')); });
    }
  });
  it('DIP-14 footprint: pin 1 bottom-left, pin 7 bottom-right, pin 8 top-right, pin 14 top-left', () => {
    const h = dipHoles('7400', 3)!;
    expect([h[0], h[6], h[7], h[13]]).toEqual(['m:3:5', 'm:9:5', 'm:9:4', 'm:3:4']);
  });
});

describe('logic ICs (solver)', () => {
  for (const [id, d] of gateIcs) {
    it(`${id} ${d.subtype}: every gate follows its truth table at 5 V`, () => {
      const m = d.model as Extract<typeof d.model, { type: 'gates' }>;
      const node = (p: number) => (p === m.gnd ? 0 : p === m.vcc ? 1 : p + 1);
      m.gates.forEach((g, gi) => {
        const total = 1 << g.in.length, count = Math.min(total, 128); // exhaustive up to 7 inputs, else 128 pseudo-random patterns
        for (let c = 0; c < count; c++) {
          const combo = total <= 128 ? c : (c * 2654435761 + gi * 40503) % total, bits = g.in.map((_, b) => !!((combo >> b) & 1));
          const els: El[] = [
            { t: 'V', a: 1, b: 0, v: 5 },
            { t: 'G', a: 1, b: 0, rout: m.rout_ohm, gates: m.gates.map(x => ({ fn: m.fn, ins: x.in.map(node), out: node(x.out), bit: x.bit, sel: x.sel, inv: x.inv, invIn: x.inv_in })) },
            ...g.in.map((pin, b): El => ({ t: 'V', a: node(pin), b: 0, v: bits[b] ? 5 : 0 })),
          ];
          const r = solve(els, d.pins.length + 2), want = logic(m.fn, bits, { bit: g.bit, sel: g.sel, inv: g.inv, invIn: g.inv_in }), vo = r.v[node(g.out)];
          expect(r.ok, `${id} gate ${gi + 1}`).toBe(true);
          expect(want ? vo > 4.9 : vo < 0.1, `${id} gate ${gi + 1} inputs ${bits}: Vout=${vo}`).toBe(true);
        }
      });
    });
  }
  it('loaded high output droops through 50 ohm and supply current equals load current', () => {
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'V', a: 2, b: 0, v: 0 },
      { t: 'G', a: 1, b: 0, gates: [{ fn: 'not', ins: [2], out: 3 }] }, { t: 'R', a: 3, b: 0, v: 1000 }];
    const r = solve(els, 4);
    expect(r.v[3]).toBeCloseTo(5 * 1000 / 1050, 4); // 4.7619 V
    expect(r.i[2]).toBeCloseTo(5 / 1050, 6);        // 4.762 mA from Vcc
  });
  it('an unpowered chip does not drive its output', () => {
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 1 }, { t: 'G', a: 1, b: 0, gates: [{ fn: 'not', ins: [2], out: 3 }] }, { t: 'R', a: 3, b: 0, v: 1000 }];
    expect(solve(els, 4).v[3]).toBeCloseTo(0, 6);
  });
});

describe('7400 placed on the breadboard', () => {
  // 5 V rails (rail 0 = +, rail 1 = -), chip at column 0, 1k load on 1Y (pin 3 -> m:2:5)
  const build = (a: boolean, b: boolean) => {
    const wire = (p: string, q: string): Part => ({ kind: 'WIRE', pins: [p, q], value: 0 });
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 },
      { kind: 'IC', ref: '7400', pins: dipHoles('7400', 0)!, value: 0 },
      wire('m:0:4', 'r:0:1'),                       // pin 14 VCC
      wire('m:6:5', 'r:1:1'),                       // pin 7 GND
      wire('m:0:5', a ? 'r:0:2' : 'r:1:2'),         // pin 1 = 1A
      wire('m:1:5', b ? 'r:0:3' : 'r:1:3'),         // pin 2 = 1B
      { kind: 'R', pins: ['m:2:6', 'r:1:4'], value: 1000 },
    ];
    const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes);
    return { nl, r, iLoad: r.i[nl.parts.findIndex(p => p.kind === 'R')] };
  };
  it('NAND: output low only when both inputs are high', () => {
    expect(build(true, true).iLoad).toBeLessThan(1e-6);
    for (const [a, b] of [[false, false], [false, true], [true, false]] as const) expect(build(a, b).iLoad).toBeCloseTo(4.76e-3, 4);
  });
  it('no warnings, and ICs without a model are reported instead of crashing', () => {
    expect(build(true, false).nl.warnings).toEqual([]);
    const nl = buildNetlist([{ kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref: 'XX9999', pins: [], value: 0 }]);
    expect(nl.warnings.some(w => w.includes('XX9999'))).toBe(true);
  });
});

describe('BJT (Ebers-Moll)', () => {
  // nodes: 1 = Vcc, 2 = collector, 3 = base drive; emitter on ground. Q is element 3: a = collector, b = emitter, base
  const ce = (vcc: number, rb: number, extra: Partial<Extract<El, { t: 'Q' }>> = {}): El[] => [
    { t: 'V', a: 1, b: 0, v: vcc }, { t: 'R', a: 1, b: 2, v: 1000 }, { t: 'R', a: 1, b: 3, v: rb },
    { t: 'Q', a: 2, b: 0, base: 3, ...extra },
  ];
  it('active region: Ic = bf * Ib and Vbe about 0.6-0.7 V', () => {
    const r = solve(ce(10, 430e3), 4), Ib = (10 - r.v[3]) / 430e3;
    expect(r.ok).toBe(true);
    expect(r.v[3]).toBeGreaterThan(0.55); expect(r.v[3]).toBeLessThan(0.75);
    expect(r.i[3] / Ib).toBeCloseTo(200, -1); // within ~5 of 200
    expect(r.v[2]).toBeCloseTo(10 - r.i[3] * 1000, 3);
  });
  it('saturation: heavily driven switch pulls the collector to about 0.1-0.2 V', () => {
    const r = solve(ce(5, 10e3), 4);
    expect(r.ok).toBe(true); expect(r.v[2]).toBeLessThan(0.25); expect(r.v[2]).toBeGreaterThan(0.02);
  });
  it('cut-off: base tied to ground leaves the collector at Vcc', () => {
    const els = ce(5, 1e12); const r = solve(els, 4);
    expect(r.v[2]).toBeCloseTo(5, 3); expect(Math.abs(r.i[3])).toBeLessThan(1e-9);
  });
  it('PNP mirrors the NPN: emitter on Vcc, collector current flows out of the collector', () => {
    // node 1 = Vcc (emitter), 2 = collector with 1k to ground, 3 = base with 430k to ground
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 10 }, { t: 'R', a: 2, b: 0, v: 1000 }, { t: 'R', a: 3, b: 0, v: 430e3 }, { t: 'Q', a: 2, b: 1, base: 3, pnp: true }];
    const r = solve(els, 4), Ib = r.v[3] / 430e3;
    expect(r.ok).toBe(true);
    expect(10 - r.v[3]).toBeGreaterThan(0.55); expect(10 - r.v[3]).toBeLessThan(0.75); // Veb
    expect(-r.i[3] / Ib).toBeCloseTo(200, -1); expect(r.v[2]).toBeCloseTo(-r.i[3] * 1000, 3);
  });
  it('small-signal gain of a common-emitter stage is about -gm*Rc (AC solver)', () => {
    // 10 V, Rc 1k, base bias 430k, AC source in series with the base via a big capacitor
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 10 }, { t: 'R', a: 1, b: 2, v: 1000 }, { t: 'R', a: 1, b: 3, v: 430e3 },
      { t: 'V', a: 4, b: 0, v: 0 }, { t: 'C', a: 4, b: 3, v: 1e-3 }, { t: 'Q', a: 2, b: 0, base: 3 }];
    const op = solve(els, 5), gm = op.i[5] / 0.025852, a = acSolve(els, 5, 3, 1000, op.v)!;
    const gain = a.re[2]; // collector phasor for 1 V into the base: -gm * Rc (about -77 here)
    expect(gain).toBeLessThan(0); expect(gain / (-gm * 1000)).toBeCloseTo(1, 1);
  });
  it('2N2222 on the breadboard: footprint, netlist and a saturated switch', () => {
    expect(placeHoles('2N2222', 'm:3:6')).toEqual(['m:3:6', 'm:4:6', 'm:5:6']);            // E B C, left to right
    expect(placeHoles('2N2222', 'r:0:3')).toBeNull();                                    // rails are not allowed
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 },
      { kind: 'IC', ref: '2N2222', pins: placeHoles('2N2222', 'm:3:6')!, value: 0 },
      { kind: 'WIRE', pins: ['m:3:7', 'r:1:1'], value: 0 },       // emitter -> GND
      { kind: 'R', pins: ['m:4:7', 'r:0:1'], value: 100e3 },       // base resistor from +5 V
      { kind: 'R', pins: ['m:5:7', 'r:0:2'], value: 1000 },        // collector load
    ];
    const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes);
    expect(nl.warnings).toEqual([]); expect(r.ok).toBe(true);
    expect(Math.abs(r.i[nl.parts.findIndex(p => p.kind === 'R' && p.value === 1000)])).toBeGreaterThan(4.7e-3); // sign: the load's pins run collector -> +rail
  });
});