import { describe, it, expect } from 'vitest';
import { solve, type El } from '../src/solver';
describe('solver', () => {
  it('voltage divider 5V, 1k/1k -> 2.5V', () => {
    const r = solve([{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 2, v: 1000 }, { t: 'R', a: 2, b: 0, v: 1000 }], 3);
    expect(r.v[2]).toBeCloseTo(2.5, 6); expect(r.i[1]).toBeCloseTo(2.5e-3, 6);
  });
  it('LED + 330R from 5V converges near 9 mA', () => {
    const r = solve([{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 2, v: 330 }, { t: 'D', a: 2, b: 0, is: 1e-18, n: 2 }], 3);
    expect(r.ok).toBe(true); expect(r.i[1]).toBeGreaterThan(0.008); expect(r.i[1]).toBeLessThan(0.011);
  });
  it('RC charging follows 1-exp(-t/RC)', () => {
    const els: El[] = [{ t: 'V', a: 1, b: 0, v: 5 }, { t: 'R', a: 1, b: 2, v: 1000 }, { t: 'C', a: 2, b: 0, v: 1e-6 }];
    let v = [0, 0, 0]; const dt = 1e-5;
    for (let k = 0; k < 100; k++) v = solve(els, 3, v, dt).v; // t = 1 ms = 1 tau
    expect(v[2]).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);
  });
});
