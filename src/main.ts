import { COLS, RAIL_HOLES, buildNetlist, type Part } from './breadboard';
import { solve } from './solver';
const P = 22, X0 = 30, MY0 = 92, NS = 'http://www.w3.org/2000/svg';
const tools = ['R', 'LED', 'D', 'C', 'V', 'WIRE', 'SELECT', 'ERASE'] as const;
type Tool = (typeof tools)[number];
const defaults: Record<Tool, number> = { R: 330, LED: 0, D: 0, C: 1e-6, V: 5, WIRE: 0, SELECT: 0, ERASE: 0 };
let tool: Tool = 'R', first: string | null = null;
let sel: Part | null = null, selEnd: number | null = null; // Select tool: chosen part, and which end (0/1) is being moved
const parts: Part[] = [];
const svg = document.createElementNS(NS, 'svg');
const W = X0 * 2 + (COLS - 1) * P, H = 412;
// Each rail is split in two halves (columns 1-15 | 16-30): one rail hole per column, lined up with the grid.
const railX = (i: number) => X0 + i * P;
const railY = (rail: number) => (rail < 2 ? 30 + rail * P : 360 + (rail - 2) * P);
// Zoom = screen px per board unit. Phones start larger so holes are finger-sized; the board scrolls inside #app.
const ZOOMS = [0.6, 0.75, 1, 1.3, 1.8, 2.4];
let zi = (() => {
  try { const v = localStorage.getItem('vb.zoom'); if (v !== null && Number.isInteger(+v) && +v >= 0 && +v < ZOOMS.length) return +v; } catch { /* ignore */ }
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 3 : 1;
})();
svg.style.cssText = `display:block;margin:0 auto;height:auto;touch-action:manipulation;user-select:none;-webkit-user-select:none;width:${Math.round(W * ZOOMS[zi])}px`;
function applyZoom(i: number) { // zoom while keeping the same board point in the middle of the view
  const wrap = svg.parentElement!, old = svg.getBoundingClientRect().width || 1;
  const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / old;
  zi = Math.max(0, Math.min(ZOOMS.length - 1, i));
  svg.style.width = `${Math.round(W * ZOOMS[zi])}px`;
  wrap.scrollLeft = cx * W * ZOOMS[zi] - wrap.clientWidth / 2;
  try { localStorage.setItem('vb.zoom', String(zi)); } catch { /* ignore */ }
}
svg.setAttribute('viewBox', `0 0 ${W} ${H}`); // scales with the page; holes always stay inside the board
document.getElementById('app')!.append(svg);
const pos = new Map<string, [number, number]>();
const add = (n: string, at: Record<string, string | number>, p: Element = svg) => { const e = document.createElementNS(NS, n); for (const k in at) e.setAttribute(k, String(at[k])); p.append(e); return e; };
add('rect', { x: 4, y: 4, width: W - 8, height: H - 8, rx: 10, fill: '#f3efe2', stroke: '#b9b09a', 'stroke-width': 2 });
add('rect', { x: X0 - 1, y: MY0 + 4 * P + 14, width: (COLS - 1) * P + 2, height: 2 * P - 20, fill: '#d8d2bf' }); // centre gap
for (const [y1, y2] of [[railY(0) - 12, railY(1) + 12], [railY(2) - 12, railY(3) + 12]]) add('line', { x1: W / 2, x2: W / 2, y1, y2, stroke: '#b9b09a', 'stroke-width': 2, 'stroke-dasharray': '3 3' }); // marks the split between rail halves
const layer = add('g', {});
const hole = (id: string, x: number, y: number) => {
  pos.set(id, [x, y]);
  const go = () => click(id);
  add('circle', { cx: x, cy: y, r: 11, fill: 'transparent', style: 'cursor:pointer' }).addEventListener('click', go); // big invisible tap target (half the hole pitch) for fingers
  add('circle', { cx: x, cy: y, r: 5, fill: '#333', 'pointer-events': 'none' }).addEventListener('click', go);
};
for (let c = 0; c < COLS; c++) for (let r = 0; r < 10; r++) hole(`m:${c}:${r}`, X0 + c * P, MY0 + r * P + (r > 4 ? 30 : 0));
for (let rail = 0; rail < 4; rail++) for (let i = 0; i < RAIL_HOLES; i++)
  hole(`r:${rail}:${i}`, railX(i), railY(rail));
const lab = (t: number, x: number, y: number) => { const e = add('text', { x, y, 'font-size': 9, fill: '#8a826c', 'text-anchor': 'middle', 'pointer-events': 'none', 'font-family': 'Arial' }); e.textContent = String(t); };
for (let c = 0; c < COLS; c++) { lab(c + 1, X0 + c * P, MY0 - 14); lab(c + 1, X0 + c * P, MY0 + 9 * P + 30 + 22); } // column numbers, top and bottom
for (let r = 0; r < 10; r++) { const y = MY0 + r * P + (r > 4 ? 30 : 0) + 3; lab(r + 1, 15, y); lab(r + 1, W - 15, y); } // row numbers, both sides
for (let rail = 0; rail < 4; rail++) for (const x of [12, W - 12]) { const t = add('text', { x, y: railY(rail) + 4, 'font-size': 12, 'font-weight': 'bold', 'text-anchor': 'middle', 'pointer-events': 'none', fill: rail % 2 ? '#1d4ed8' : '#c1121f' }); t.textContent = rail % 2 ? '−' : '+'; } // rail polarity signs (convention), both ends
svg.append(layer); // re-append so parts/wires draw above the holes (SVG z-order = DOM order)
layer.setAttribute('pointer-events', 'none'); // clicks still reach the holes underneath
const bar = document.getElementById('bar')!, out = document.getElementById('out')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.append(b); return b; };
const hint: Record<string, string> = { R: 'Resistor: click two holes (either order).', C: 'Capacitor: click two holes (open circuit in DC).', V: 'Battery: FIRST click = + (positive), SECOND click = − (ground).', LED: 'LED: FIRST click = A (anode, +), SECOND click = K (cathode, −).', D: 'Diode: FIRST click = A (anode), SECOND click = K (cathode, the striped end).', WIRE: 'Wire: click two holes to join them.', SELECT: 'Select: click a part to edit its value or move an end. To remove a part, use Erase.', ERASE: 'Eraser: click, or drag across, a part to remove the whole part.' };
const valIn = document.createElement('input'); // part value box (replaces prompt(), which browsers can block)
valIn.style.cssText = 'width:80px;padding:5px;border-radius:4px;border:0'; valIn.title = 'Value: 4700, 4.7k, 100n, 1e-6 ...';
const num = (t: string) => { const m = t.trim().match(/^([\d.]+(?:e[+-]?\d+)?)\s*([pnuµmkM]?)/i); if (!m) return NaN; return +m[1] * ({ p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, M: 1e6 } as Record<string, number>)[m[2]] || +m[1]; };
tools.forEach(t => { const b = btn(t === 'SELECT' ? 'Select' : t === 'ERASE' ? 'Erase' : t, () => { tool = t; first = null; sel = null; selEnd = null; redraw(); valIn.value = defaults[t] ? String(defaults[t]) : ''; valIn.disabled = !defaults[t]; out.textContent = hint[t]; bar.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); });
bar.append(valIn); valIn.value = String(defaults.R);
const eraserBtn = bar.querySelectorAll('button')[tools.indexOf('ERASE')];
eraserBtn.title = 'Eraser'; eraserBtn.setAttribute('aria-label', 'Eraser');
eraserBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>';
btn('Undo', () => undo());
btn('Run DC', () => run()).classList.add('run');
btn('Clear', () => { parts.length = 0; redraw(); out.textContent = 'Cleared.'; });
btn('−', () => applyZoom(zi - 1)).title = 'Zoom out';
btn('+', () => applyZoom(zi + 1)).title = 'Zoom in';
function erasePart(p: Part) { // the eraser removes the WHOLE part, like the eraser in Paint removes what it touches
  const i = parts.indexOf(p); if (i < 0) return;
  parts.splice(i, 1); if (p === sel) { sel = null; selEnd = null; }
  redraw(); out.textContent = `Erased the ${p.kind}.`;
}
function select(p: Part) {
  sel = p; selEnd = null;
  const ed = p.kind !== 'WIRE' && p.value > 0;
  valIn.disabled = !ed; valIn.value = ed ? String(p.value) : ''; redraw();
  out.textContent = `Selected ${p.kind}.` + (ed ? ' Edit the value above (press Enter),' : '') + ' click an end ring then a new hole to move it. To remove a part, use Erase.';
}
valIn.addEventListener('change', () => { // edit the selected part's value
  if (tool !== 'SELECT' || !sel || sel.kind === 'WIRE' || !sel.value) return;
  const n = num(valIn.value);
  if (!(n > 0)) { out.textContent = '⚠ Enter a valid value (e.g. 330, 4.7k, 100n).'; valIn.value = String(sel.value); return; }
  (sel as { value: number }).value = n; redraw(); out.textContent = `Changed ${sel.kind} to ${n}.`;
});
svg.addEventListener('click', e => { // click empty board to deselect
  const t = (e.target as Element).tagName;
  if (tool === 'SELECT' && sel && (t === 'rect' || t === 'svg')) { sel = null; selEnd = null; valIn.value = ''; valIn.disabled = true; redraw(); }
});
function undo() { // Esc / Ctrl+Z: cancel a half-made placement first, otherwise remove the last part
  if (first) { first = null; redraw(); out.textContent = 'Cancelled the pending click.'; return; }
  const p = parts.pop(); if (p === sel) { sel = null; selEnd = null; } redraw(); out.textContent = p ? `Removed the last ${p.kind}.` : 'Nothing to undo.';
}
document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // let the value box keep its own undo
  if (e.key === 'Escape' && sel) { sel = null; selEnd = null; redraw(); return; }
  if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) { e.preventDefault(); undo(); }
});
function describe(id: string) { // plain-language hole name, so you can confirm a tap landed where you meant
  const [k, a, b] = id.split(':');
  return k === 'm' ? `column ${+a + 1}, row ${+b + 1}` : `${+a < 2 ? 'top' : 'bottom'} ${+a % 2 ? '−' : '+'} rail, column ${+b + 1}`;
}
function click(id: string) {
  if (tool === 'ERASE') return; // erasing is done by clicking / dragging over a part, not by its holes
  if (tool === 'SELECT') { // move the chosen end of the selected part to this hole
    if (sel && selEnd !== null) {
      if (sel.pins[1 - selEnd] === id) { out.textContent = '⚠ Both ends cannot be in the same hole.'; return; }
      sel.pins[selEnd] = id; selEnd = null; redraw(); out.textContent = `Moved the ${sel.kind}.`;
    }
    return;
  }
  if (!first) { first = id; redraw(); out.textContent = `Start: ${describe(id)}. Now tap the second hole (Undo cancels).`; return; }
  if (first !== id) {
    let value = defaults[tool];
    if (tool === 'R' || tool === 'C' || tool === 'V') { const n = num(valIn.value); if (!(n > 0)) { out.textContent = '⚠ Enter a valid value (e.g. 330, 4.7k, 100n).'; first = null; redraw(); return; } value = n; }
    parts.push({ kind: tool, pins: [first, id], value } as Part);
    out.textContent = `Placed ${tool === 'WIRE' ? 'wire' : tool} from ${describe(first)} to ${describe(id)}.`;
  }
  first = null; redraw();
}
const colors: Record<string, string> = { R: '#c9a227', LED: '#e5383b', D: '#555', C: '#2f81f7', V: '#2a9d4b', WIRE: '#111' };
function redraw(glow = new Map<Part, number>()) {
  save();
  layer.replaceChildren();
  parts.forEach(p => {
    const [x1, y1] = pos.get(p.pins[0])!, [x2, y2] = pos.get(p.pins[1])!;
    if (tool === 'ERASE') { // fat invisible hit area so thin wires are easy to catch; click or drag over a part erases it
      const hit = add('line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': 16, 'stroke-linecap': 'round', 'pointer-events': 'stroke', style: 'cursor:pointer' }, layer);
      hit.addEventListener('pointerdown', ev => { ev.preventDefault(); erasePart(p); });
      hit.addEventListener('click', () => erasePart(p));
      hit.addEventListener('pointerenter', ev => { if (ev.buttons & 1) erasePart(p); else hit.setAttribute('stroke', 'rgba(255,107,107,.45)'); }); // drag-erase / hover preview
      hit.addEventListener('pointerleave', () => hit.setAttribute('stroke', 'transparent'));
    }
    const pick = tool === 'SELECT' && selEnd === null;
    if (p === sel) add('line', { x1, y1, x2, y2, stroke: '#2f81f7', 'stroke-width': 16, 'stroke-linecap': 'round', opacity: 0.35 }, layer);
    const ln = add('line', { x1, y1, x2, y2, stroke: colors[p.kind], 'stroke-width': p.kind === 'WIRE' ? 3 : 8, 'stroke-linecap': 'round', opacity: p.kind === 'LED' ? 0.35 + (glow.get(p) ?? 0) * 0.65 : 1, 'pointer-events': pick ? 'stroke' : 'none', style: pick ? 'cursor:pointer' : '' }, layer);
    if (pick) ln.addEventListener('click', ev => { ev.stopPropagation(); select(p); });
    const pol = p.kind === 'V' ? ['+', '−'] : p.kind === 'LED' || p.kind === 'D' ? ['A', 'K'] : null; // A = anode, K = cathode
    pol?.forEach((t, i) => add('text', { x: i ? x2 : x1, y: (i ? y2 : y1) - 11, 'font-size': 11, 'font-weight': 'bold', 'text-anchor': 'middle', fill: t === '+' ? '#c1121f' : t === '−' ? '#1d4ed8' : '#222', stroke: '#f3efe2', 'stroke-width': 3, 'paint-order': 'stroke' }, layer).textContent = t);
    if (p.kind !== 'WIRE') add('text', { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2, 'font-size': 11, fill: '#000' }, layer).textContent = p.kind + (p.value ? ' ' + p.value : '');
  });
  if (first) { const [x, y] = pos.get(first)!; add('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#2f81f7', 'stroke-width': 3 }, layer); } // ring on the pending first click
  if (sel && tool === 'SELECT') sel.pins.forEach((h, i) => { // end handles: click one, then click the new hole
    const [x, y] = pos.get(h)!;
    const c = add('circle', { cx: x, cy: y, r: 9, fill: 'rgba(47,129,247,.25)', stroke: '#2f81f7', 'stroke-width': selEnd === i ? 4 : 2, 'pointer-events': 'all', style: 'cursor:pointer' }, layer);
    c.addEventListener('click', ev => { ev.stopPropagation(); selEnd = i; redraw(); out.textContent = 'Now click the new hole for this end (Esc to cancel).'; });
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

// Persistence: the circuit is kept in this browser (localStorage) so code updates / page reloads don't wipe it.
const KEY = 'vb.circuit.v1';
function save() { try { localStorage.setItem(KEY, JSON.stringify(parts)); } catch { /* storage unavailable: ignore */ } }
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return;
    raw.forEach(p => { // keep only parts whose holes still exist on the current board layout
      const ok = p && Array.isArray(p.pins) && p.pins.length === 2 && p.pins.every((h: unknown) => typeof h === 'string' && pos.has(h)) && p.pins[0] !== p.pins[1]
        && ['R', 'LED', 'D', 'C', 'V', 'WIRE'].includes(p.kind) && typeof p.value === 'number';
      if (ok) parts.push({ kind: p.kind, pins: [p.pins[0], p.pins[1]], value: p.value } as Part);
    });
  } catch { /* corrupt data: start empty */ }
}
load(); redraw();