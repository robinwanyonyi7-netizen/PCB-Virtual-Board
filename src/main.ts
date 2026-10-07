import { COLS, RAIL_HOLES, buildNetlist, type Part } from './breadboard';
import { solve } from './solver';
const P = 22, X0 = 30, NS = 'http://www.w3.org/2000/svg';
const tools = ['R', 'LED', 'D', 'C', 'V', 'WIRE'] as const;
type Tool = (typeof tools)[number];
const defaults: Record<Tool, number> = { R: 330, LED: 0, D: 0, C: 1e-6, V: 5, WIRE: 0 };
let tool: Tool = 'R', first: string | null = null;
const parts: Part[] = [];
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('width', String(X0 * 2 + COLS * P)); svg.setAttribute('height', '420');
document.getElementById('app')!.append(svg);
const pos = new Map<string, [number, number]>();
const add = (n: string, at: Record<string, string | number>, p: Element = svg) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, String(at[k])); p.append(e); return e; };
const layer = add('g', {});
const hole = (id: string, x: number, y: number) => {
  pos.set(id, [x, y]);
  add('circle', { cx: x, cy: y, r: 5, fill: '#333', style: 'cursor:pointer' }).addEventListener('click', () => click(id));
};
for (let c = 0; c < COLS; c++) for (let r = 0; r < 10; r++) hole(`m:${c}:${r}`, X0 + c * P, 130 + r * P + (r > 4 ? 30 : 0));
for (let rail = 0; rail < 4; rail++) for (let i = 0; i < RAIL_HOLES; i++)
  hole(`r:${rail}:${i}`, X0 + i * P * 1.15 + (i > 11 ? 10 : 0), rail < 2 ? 25 + rail * P : 350 + (rail - 2) * P);
const bar = document.getElementById('bar')!, out = document.getElementById('out')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.append(b); return b; };
tools.forEach(t => { const b = btn(t, () => { tool = t; first = null; bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); });
btn('Run DC', () => run());
btn('Clear', () => { parts.length = 0; redraw(); out.textContent = 'Cleared.'; });
function click(id: string) {
  if (!first) { first = id; return; }
  if (first !== id) {
    let value = defaults[tool];
    if (tool === 'R' || tool === 'C' || tool === 'V') { const s = prompt(`Value for ${tool} (SI units, e.g. 4700 or 1e-6)`, String(value)); if (s === null) { first = null; return; } value = Number(s) || value; }
    parts.push({ kind: tool, pins: [first, id], value } as Part); redraw();
  }
  first = null;
}
const colors: Record<string, string> = { R: '#c9a227', LED: '#e5383b', D: '#555', C: '#2f81f7', V: '#2a9d4b', WIRE: '#111' };
function redraw(glow = new Map<Part, number>()) {
  layer.replaceChildren();
  parts.forEach(p => {
    const [x1, y1] = pos.get(p.pins[0])!, [x2, y2] = pos.get(p.pins[1])!;
    add('line', { x1, y1, x2, y2, stroke: colors[p.kind], 'stroke-width': p.kind === 'WIRE' ? 3 : 8, 'stroke-linecap': 'round', opacity: p.kind === 'LED' ? 0.35 + (glow.get(p) ?? 0) * 0.65 : 1 }, layer);
    if (p.kind !== 'WIRE') add('text', { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2, 'font-size': 11, fill: '#000' }, layer).textContent = p.kind + (p.value ? ' ' + p.value : '');
  });
}
function run() {
  const nl = buildNetlist(parts), r = solve(nl.els, nl.nodes);
  const glow = new Map<Part, number>();
  nl.parts.forEach((p, k) => p.kind === 'LED' && glow.set(p, Math.min(1, Math.max(0, r.i[k] / 0.02))));
  redraw(glow);
  const eng = (x: number) => (Math.abs(x) >= 1 ? x.toFixed(3) + ' ' : (x * 1e3).toFixed(3) + ' m');
  out.textContent = [...nl.warnings.map(w => '⚠ ' + w), r.ok || !nl.els.length ? '' : '⚠ Did not converge / singular circuit.',
    ...nl.parts.map((p, k) => `${p.kind}${p.value ? ' ' + p.value : ''}: ${eng(r.i[k] ?? 0)}A, ${eng(r.v[nl.els[k].a] - r.v[nl.els[k].b])}V`)].filter(Boolean).join('\n');
}
