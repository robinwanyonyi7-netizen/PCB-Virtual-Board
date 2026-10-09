import { describe, it, expect } from 'vitest';
import { solve, transient, type El } from '../src/solver';
import { buildNetlist, type Part } from '../src/breadboard';
import { COMPONENTS, icElement, placeHoles } from '../src/components';

const pinNo = (ref: string, name: string) => { const i = COMPONENTS[ref].pins.findIndex(p => p.name === name); if (i < 0) throw new Error(`${ref} has no pin ${name}`); return i + 1; };
type Drive = 0 | 1 | { f: number }; // static level, or a 0-5 V square clock of frequency f (starts high, first rising edge at t = 1/f)

/** Power a chip at 5 V, drive named pins, optionally tie pins together (e.g. D to ~Q), run a transient and return per-step bit readers. */
function sim(ref: string, drive: Record<string, Drive>, tie: [string, string][], tStop: number, steps: number) {
  const d = COMPONENTS[ref], m = d.model; if (m.type !== 'seq') throw new Error('not a sequential chip');
  const tied = new Map(tie.map(([a, b]) => [pinNo(ref, a), pinNo(ref, b)]));
  const node = (p: number): number => { p = tied.get(p) ?? p; return p === m.gnd ? 0 : p === m.vcc ? 1 : p + 1; };
  let next = d.pins.length + 2;
  const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, icElement({ ref, pins: d.pins.map((_, i) => `p${i + 1}`) }, h => node(+h.slice(1)))!];
  for (const [name, val] of Object.entries(drive)) {
    const n = node(pinNo(ref, name));
    if (typeof val === 'number') els.push({ t: 'V', a: n, b: 0, v: val ? 5 : 0 });
    else { const off = next++; els.push({ t: 'V', a: off, b: 0, v: 2.5 }, { t: 'V', a: n, b: off, v: 2.5, w: { kind: 'square', freq: val.f } }); }
  }
  const tr = transient(els, next, tStop, steps), dt = tStop / steps;
  const at = (name: string, time: number) => (tr.v[Math.round(time / dt)][node(pinNo(ref, name))] > 2.5 ? 1 : 0);
  return { at, tr };
}
const T = 1e-3, F = 1000;                                   // 1 kHz clock
const after = (n: number) => n * T + 0.25 * T;              // shortly after the n-th rising edge
const word = (at: (n: string, t: number) => number, names: string[], t: number) => names.reduce((s, nm, i) => s + (at(nm, t) << i), 0);
const Q4 = ['Q0', 'Q1', 'Q2', 'Q3'];

describe('flip-flops', () => {
  it('74HC74: D tied to ~Q divides the clock by two', () => {
    const { at } = sim('74HC74', { '~1CLR': 1, '~1PRE': 1, '1CLK': { f: F } }, [['1D', '~1Q']], 9e-3, 900);
    for (let n = 1; n <= 8; n++) { expect(at('1Q', after(n)), `after edge ${n}`).toBe(n % 2); expect(at('~1Q', after(n))).toBe(1 - (n % 2)); }
  });
  it('74HC74: captures D on the rising edge only, and the second flip-flop is independent', () => {
    const { at } = sim('74HC74', { '~1CLR': 1, '~1PRE': 1, '1D': 1, '1CLK': { f: F }, '~2CLR': 1, '~2PRE': 1, '2D': 0, '2CLK': { f: F } }, [], 3e-3, 300);
    expect(at('1Q', 0.9 * T)).toBe(0);            // before the first rising edge nothing has been captured
    expect(at('1Q', after(1))).toBe(1); expect(at('2Q', after(1))).toBe(0); expect(at('~2Q', after(1))).toBe(1);
  });
  it('74HC74: asynchronous clear and preset override the clock; both low drives Q and ~Q high', () => {
    const run = (clr: 0 | 1, pre: 0 | 1, d: 0 | 1) => { const s = sim('74HC74', { '~1CLR': clr, '~1PRE': pre, '1D': d, '1CLK': { f: F } }, [], 2.5e-3, 250); return [s.at('1Q', 2.3e-3), s.at('~1Q', 2.3e-3)]; };
    expect(run(0, 1, 1)).toEqual([0, 1]);   // clear wins over D = 1
    expect(run(1, 0, 0)).toEqual([1, 0]);   // preset wins over D = 0
    expect(run(0, 0, 0)).toEqual([1, 1]);   // both active
    expect(run(1, 1, 1)).toEqual([1, 0]);   // normal: D = 1 clocked in
  });
  it('74HC112 JK: toggles on the FALLING edge when J = K = 1; J/K = 10 sets, 01 resets', () => {
    const fall = (n: number) => (n - 0.25) * T;      // shortly after the n-th falling edge (at (n - 0.5) T)
    const tog = sim('74HC112', { '~1PRE': 1, '~1CLR': 1, '1J': 1, '1K': 1, '~1CLK': { f: F } }, [], 8e-3, 800);
    for (let n = 1; n <= 6; n++) expect(tog.at('1Q', fall(n)), `falling edge ${n}`).toBe(n % 2);
    expect(tog.at('1Q', 0.9 * T)).toBe(1);           // changes at the falling edge (0.5 T), not the rising edge at T
    expect(tog.at('1Q', 1.1 * T)).toBe(1);           // ...and stays through the rising edge
    expect(sim('74HC112', { '~1PRE': 1, '~1CLR': 1, '1J': 1, '1K': 0, '~1CLK': { f: F } }, [], 3e-3, 300).at('1Q', fall(2))).toBe(1);
    expect(sim('74HC112', { '~1PRE': 0, '~1CLR': 1, '1J': 0, '1K': 1, '~1CLK': { f: F } }, [], 3e-3, 300).at('1Q', 0.1 * T)).toBe(1); // preset first...
    expect(sim('74HC112', { '~1PRE': 1, '~1CLR': 1, '1J': 0, '1K': 1, '~1CLK': { f: F } }, [], 3e-3, 300).at('1Q', fall(2))).toBe(0);
  });
});

describe('counters', () => {
  const ctl = { '~MR': 1, '~PE': 1, CEP: 1, CET: 1, P0: 0, P1: 0, P2: 0, P3: 0, CP: { f: F } } as Record<string, Drive>;
  it('74HC161 counts 0..15, wraps, and TC is high only at 15', () => {
    const { at } = sim('74HC161', ctl, [], 20.5e-3, 2050);
    for (let n = 0; n <= 20; n++) { expect(word(at, Q4, after(n)), `after ${n} edges`).toBe(n % 16); expect(at('TC', after(n))).toBe(n % 16 === 15 ? 1 : 0); }
  });
  it('74HC161: CEP or CET low holds the count', () => {
    expect(word(sim('74HC161', { ...ctl, CEP: 0 }, [], 6.5e-3, 650).at, Q4, after(5))).toBe(0);
    const s = sim('74HC161', { ...ctl, CET: 0 }, [], 6.5e-3, 650); expect(word(s.at, Q4, after(5))).toBe(0); expect(s.at('TC', after(5))).toBe(0);
  });
  it('74HC161: ~PE low loads P3..P0 on the clock edge (priority over counting)', () => {
    const { at } = sim('74HC161', { ...ctl, '~PE': 0, P0: 1, P2: 1 }, [], 4.5e-3, 450); // loads 0b0101 = 5
    expect(word(at, Q4, 0.5 * T)).toBe(0); expect(word(at, Q4, after(1))).toBe(5); expect(word(at, Q4, after(3))).toBe(5);
  });
  it('74HC161 clears asynchronously, 74HC163 only on the next clock edge', () => {
    // ~MR / ~SR is a slow square wave: high for 6.25 ms (6 edges counted), then low
    const a = sim('74HC161', { ...ctl, '~MR': { f: 80 } }, [], 9e-3, 900), b = sim('74HC163', { ...Object.fromEntries(Object.entries(ctl).filter(([k]) => k !== '~MR')), '~SR': { f: 80 } } as Record<string, Drive>, [], 9e-3, 900); // 163 names pin 1 ~SR
    expect(word(a.at, Q4, 6.1e-3)).toBe(6); expect(word(b.at, Q4, 6.1e-3)).toBe(6);
    expect(word(a.at, Q4, 6.5e-3)).toBe(0);                    // 161: cleared at once, no clock needed
    expect(word(b.at, Q4, 6.5e-3)).toBe(6);                    // 163: still 6, clear waits for an edge
    expect(word(b.at, Q4, after(7))).toBe(0);                  // ...then clears on edge 7
  });
  it('74HC393 counts falling edges, 4-bit ripple, MR resets', () => {
    const { at } = sim('74HC393', { '1MR': 0, '1CP': { f: F } }, [], 19e-3, 1900), q = ['1Q0', '1Q1', '1Q2', '1Q3'];
    for (let n = 1; n <= 18; n++) expect(word(at, q, (n - 0.25) * T), `falling edge ${n}`).toBe(n % 16);
    const held = sim('74HC393', { '1MR': 1, '1CP': { f: F } }, [], 4e-3, 400); expect(word(held.at, q, 3.7e-3)).toBe(0);
    const second = sim('74HC393', { '2MR': 0, '2CP': { f: F } }, [], 6e-3, 600); expect(word(second.at, ['2Q0', '2Q1', '2Q2', '2Q3'], 4.75e-3)).toBe(5);
  });
  it('74HC4017 steps one-hot through Q0..Q9, CO high for 0-4, wraps after 9; ~CE high inhibits', () => {
    const outs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `Q${i}`), { at } = sim('74HC4017', { '~CE': 0, MR: 0, CP: { f: F } }, [], 14e-3, 1400);
    for (let n = 0; n <= 13; n++) {
      outs.forEach((q, i) => expect(at(q, after(n)), `after ${n} edges, ${q}`).toBe(i === n % 10 ? 1 : 0));
      expect(at('CO', after(n))).toBe(n % 10 < 5 ? 1 : 0);
    }
    const inh = sim('74HC4017', { '~CE': 1, MR: 0, CP: { f: F } }, [], 5e-3, 500); expect(inh.at('Q0', after(4))).toBe(1); expect(inh.at('Q4', after(4))).toBe(0);
  });
});

describe('sequential chips: database and board', () => {
  it('every referenced pin has the right role and every input/output pin is used', () => {
    const IN = new Set(['clk', 'd', 'j', 'k', 'clr', 'pre', 'load', 'data', 'cep', 'cet', 'ce', 'ds', 'stcp', 'mr', 'oe']);
    for (const [id, d] of Object.entries(COMPONENTS)) {
      if (d.model.type !== 'seq') continue;
      const used = new Set<number>();
      expect(d.pins[d.model.vcc - 1].role, id).toBe('vcc'); expect(d.pins[d.model.gnd - 1].role, id).toBe('gnd');
      for (const u of d.model.units) for (const [f, val] of Object.entries(u)) {
        if (f === 'kind' || f === 'sync_clr') continue;
        for (const n of Array.isArray(val) ? val : [val as number]) { expect(d.pins[n - 1].role, `${id}.${f}`).toBe(IN.has(f) ? 'in' : 'out'); used.add(n); }
      }
      d.pins.forEach((p, i) => { if (p.role === 'in' || p.role === 'out') expect(used.has(i + 1), `${id} pin ${i + 1} ${p.name}`).toBe(true); });
    }
  });
  it('74HC74 on the breadboard builds a clocked element with no warnings and solves', () => {
    const parts: Part[] = [
      { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, { kind: 'IC', ref: '74HC74', pins: placeHoles('74HC74', 'm:0:5')!, value: 0 },
      { kind: 'WIRE', pins: ['m:0:4', 'r:0:1'], value: 0 }, { kind: 'WIRE', pins: ['m:6:5', 'r:1:1'], value: 0 },
    ];
    const nl = buildNetlist(parts); expect(nl.warnings).toEqual([]); expect(nl.els.some(e => e.t === 'F')).toBe(true);
    expect(solve(nl.els, nl.nodes).ok).toBe(true);
  });
});

describe('integration', () => {
  it('NE555 astable clocks a 74HC4017: the lit output advances one step per 555 pulse', () => {
    const p5 = (n: string) => pinNo('NE555', n), p4 = (n: string) => pinNo('74HC4017', n);
    // nodes: 1 = Vcc, 2 = clock (555 OUT = 4017 CP), 3 = THR/TRIG, 4 = DIS, 5 = CTRL, 6.. = 4017 outputs
    const n555 = new Map<number, number>([[p5('GND'), 0], [p5('VCC'), 1], [p5('OUT'), 2], [p5('TRIG'), 3], [p5('THR'), 3], [p5('DIS'), 4], [p5('~RESET'), 1], [p5('CTRL'), 5]]);
    const q = (i: number) => 6 + i, outs = Array.from({ length: 10 }, (_, i) => p4(`Q${i}`)), co = p4('CO');
    const n4017 = (p: number) => p === p4('GND') ? 0 : p === p4('VCC') ? 1 : p === p4('CP') ? 2 : p === p4('~CE') || p === p4('MR') ? 0 : outs.includes(p) ? q(outs.indexOf(p)) : p === co ? 16 : 17;
    const els: El[] = [
      { t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 4, v: 1e3 }, { t: 'R', a: 4, b: 3, v: 10e3 }, { t: 'C', a: 3, b: 0, v: 100e-9 },
      icElement({ ref: 'NE555', pins: COMPONENTS.NE555.pins.map((_, i) => `p${i + 1}`) }, h => n555.get(+h.slice(1))!)!,
      icElement({ ref: '74HC4017', pins: COMPONENTS['74HC4017'].pins.map((_, i) => `p${i + 1}`) }, h => n4017(+h.slice(1)))!,
    ];
    const dt = 2e-6, tr = transient(els, 18, 14e-3, 7000), up: number[] = [];
    for (let k = 1; k < tr.v.length; k++) if (tr.v[k - 1][2] < 2.5 && tr.v[k][2] >= 2.5) up.push(k);
    expect(up.length).toBeGreaterThanOrEqual(8);
    up.forEach((k, i) => { const k2 = k + Math.round(0.2e-3 / dt); for (let o = 0; o < 10; o++) expect(tr.v[k2][q(o)] > 2.5 ? 1 : 0, `pulse ${i + 1}, Q${o}`).toBe(o === (i + 1) % 10 ? 1 : 0); });
  });
});