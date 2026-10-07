// Board geometry + connectivity. Hole ids: "m:col:row" (row 0-9 = a-j) or "r:rail:idx" (rail 0-3).
import type { El } from './solver';
export const COLS = 30, RAIL_HOLES = 30; // per rail: 15 left half + 15 right half, one hole per column
export const strip = (h: string) => {
  const [k, a, b] = h.split(':');
  return k === 'r' ? `rail${a}${+b < 15 ? 'L' : 'R'}` : // each rail is split into separate left/right halves
    `c${a}${+b < 5 ? 'T' : 'B'}`; // a-e joined, f-j joined (gap in the middle)
};
export type Part =
  | { kind: 'R' | 'C' | 'V' | 'LED' | 'D'; pins: [string, string]; value: number }
  | { kind: 'WIRE'; pins: [string, string]; value: 0 };
export interface Netlist { els: El[]; parts: Part[]; nodes: number; warnings: string[] }

export function buildNetlist(parts: Part[]): Netlist {
  const parent = new Map<string, string>();
  const find = (s: string): string => { if (!parent.has(s)) parent.set(s, s); const p = parent.get(s)!; if (p === s) return s; const r = find(p); parent.set(s, r); return r; };
  parts.forEach(p => p.kind === 'WIRE' && parent.set(find(strip(p.pins[0])), find(strip(p.pins[1]))));
  const warnings: string[] = [];
  const bat = parts.find(p => p.kind === 'V');
  if (!bat) warnings.push('No battery/source placed.');
  const ids = new Map<string, number>();
  if (bat) ids.set(find(strip(bat.pins[1])), 0); // battery negative = ground (node 0)
  const nodeOf = (h: string) => { const r = find(strip(h)); if (!ids.has(r)) ids.set(r, ids.size); return ids.get(r)!; };
  const els: El[] = [], used: Part[] = [];
  if (bat) parts.forEach(p => {
    if (p.kind === 'WIRE') return;
    const a = nodeOf(p.pins[0]), b = nodeOf(p.pins[1]);
    if (a === b) { warnings.push(`${p.kind} is shorted (both pins on one net).`); return; }
    if (p.kind === 'LED') els.push({ t: 'D', a, b, is: 1e-18, n: 2 });
    else if (p.kind === 'D') els.push({ t: 'D', a, b });
    else els.push({ t: p.kind, a, b, v: p.value });
    used.push(p);
  });
  return { els, parts: used, nodes: Math.max(ids.size, 1), warnings };
}