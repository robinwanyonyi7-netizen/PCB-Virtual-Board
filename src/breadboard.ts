// Board geometry + connectivity. Hole ids: "m:col:row" (row 0-9 = a-j) or "r:rail:idx" (rail 0-3).
import type { El, Wave } from './solver';
import { icElement, tiedHoles } from './components';
export const COLS = 30, RAIL_HOLES = 30; // per rail: 15 left half + 15 right half, one hole per column
export const strip = (h: string) => {
  const [k, a, b] = h.split(':');
  return k === 'r' ? `rail${a}${+b < 15 ? 'L' : 'R'}` : // each rail is split into separate left/right halves
    `c${a}${+b < 5 ? 'T' : 'B'}`; // a-e joined, f-j joined (gap in the middle)
};
export type Part =
  | { kind: 'R' | 'L' | 'C' | 'V' | 'LED' | 'D' | 'ZD' | 'SD' | 'SW' | 'CLK'; pins: [string, string]; value: number } // ZD value = Zener volts; SW value = 1 closed / 0 open; CLK value = Hz (5 V, 0 / 5 V square, pins = [output, ground])
  | { kind: 'WIRE'; pins: [string, string]; value: 0 }
  | { kind: 'IC'; ref: string; pins: string[]; value: number }; // ref = key in components.json; pins[i] = hole of datasheet pin i+1; value = wiper % for a potentiometer, else 0
export interface Netlist { els: El[]; parts: Part[]; nodes: number; warnings: string[]; src: number; nodeOf: (hole: string) => number } // src = index in els of the battery (-1 if none); nodeOf maps a hole to its circuit node

export function buildNetlist(parts: Part[], wave?: Wave): Netlist { // wave applies to the first battery (for time / frequency graphs)
  const parent = new Map<string, string>();
  const find = (s: string): string => { if (!parent.has(s)) parent.set(s, s); const p = parent.get(s)!; if (p === s) return s; const r = find(p); parent.set(s, r); return r; };
  parts.forEach(p => p.kind === 'WIRE' && parent.set(find(strip(p.pins[0])), find(strip(p.pins[1]))));
  parts.forEach(p => p.kind === 'IC' && tiedHoles(p).forEach(grp => grp.slice(1).forEach(h => parent.set(find(strip(h)), find(strip(grp[0])))))); // pins joined inside the part (a display's two COM pins)
  const warnings: string[] = [];
  const bat = parts.find(p => p.kind === 'V');
  if (!bat) warnings.push('No battery/source placed.');
  const ids = new Map<string, number>();
  if (bat) ids.set(find(strip(bat.pins[1])), 0); // battery negative = ground (node 0)
  const nodeOf = (h: string) => { const r = find(strip(h)); if (!ids.has(r)) ids.set(r, ids.size); return ids.get(r)!; };
  const els: El[] = [], used: Part[] = [];
  let src = -1;
  if (bat) parts.forEach(p => {
    if (p.kind === 'WIRE') return;
    if (p.kind === 'IC') {
      const el = icElement(p, nodeOf);
      if (!el) { warnings.push(`${p.ref} has no simulation model yet (ignored).`); return; }
      if (el.a === el.b) { warnings.push(`${p.ref}: VCC and GND pins are on the same net.`); return; }
      els.push(el); used.push(p); return;
    }
    const a = nodeOf(p.pins[0]), b = nodeOf(p.pins[1]);
    if (a === b) { warnings.push(`${p.kind} is shorted (both pins on one net).`); return; }
    if (p.kind === 'LED') els.push({ t: 'D', a, b, is: 1e-18, n: 2 });
    else if (p.kind === 'D') els.push({ t: 'D', a, b });
    else if (p.kind === 'ZD') els.push({ t: 'D', a, b, bv: p.value });
    else if (p.kind === 'SD') els.push({ t: 'D', a, b, is: 3e-8, n: 1.05 }); // Schottky: about 0.35 V at 10 mA
    else if (p.kind === 'SW') els.push({ t: 'R', a, b, v: p.value ? 0.01 : 1e9 });
    else if (p.kind === 'CLK') els.push({ t: 'V', a, b, v: 5, w: { kind: 'clock', freq: p.value } });
    else { if (p === bat) src = els.length; els.push(p === bat && wave ? { t: 'V', a, b, v: p.value, w: wave } : { t: p.kind, a, b, v: p.value }); }
    used.push(p);
  });
  return { els, parts: used, nodes: Math.max(ids.size, 1), warnings, src, nodeOf };
}