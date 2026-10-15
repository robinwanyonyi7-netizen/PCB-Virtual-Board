// Chip picker: a gallery of image tiles (picture, name, what it is, where it is used) that replaces the plain <select>.
// The pictures are drawn as SVG in the same style as the chips on the board (dark body, notch, silver pins).
import { COMPONENTS, isSimulable, type ComponentDef } from './components';
import { IC_INFO } from './icinfo';

const W = 160, H = 84, PIN = '#b8b8b8';
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const short = (d: ComponentDef) => d.name.replace(/\s*\(.*$/, ''); // "2N2222 (PN2222A, TO-92)" -> "2N2222"
const text = (x: number, y: number, s: string, size: number, fill: string) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" font-family="Arial,sans-serif">${esc(s)}</text>`;
const fit = (s: string, width: number, max: number) => Math.max(5, Math.min(max, width / (Math.max(1, s.length) * 0.6)));
// vertical legs under a body, centred on the picture; optional pin names underneath
const legs = (names: string[], top: number, bottom: number, pitch: number, labels = true) => names.map((nm, i) => {
  const x = W / 2 + (i - (names.length - 1) / 2) * pitch;
  return `<rect x="${x - 1.5}" y="${top}" width="3" height="${bottom - top}" fill="${PIN}"/>` + (labels ? text(x, bottom + 9, nm, 7, '#6b6455') : '');
}).join('');

function dip(n: number, label: string, o: { bh?: number; fill?: string; extra?: string } = {}) { // pin 1 end (notch) on the left, like on the board
  const half = Math.max(2, Math.ceil(n / 2)), pitch = 10, bw = Math.max(56, half * pitch + 8), bh = o.bh ?? 34;
  const x0 = (W - bw) / 2, y0 = (H - bh) / 2, cy = H / 2, off = (bw - half * pitch) / 2;
  let s = '';
  for (let i = 0; i < half; i++) {
    const x = x0 + off + i * pitch + pitch / 2 - 2.5;
    s += `<rect x="${x}" y="${y0 - 7}" width="5" height="8" fill="${PIN}"/><rect x="${x}" y="${y0 + bh - 1}" width="5" height="8" fill="${PIN}"/>`;
  }
  s += `<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="3" fill="${o.fill ?? '#222'}" stroke="#000" stroke-width="1.5"/>`;
  s += `<path d="M${x0} ${cy - 5} a5 5 0 0 1 0 10" fill="#555"/><circle cx="${x0 + 8}" cy="${y0 + bh - 6}" r="1.8" fill="#888"/>`;
  if (label) s += text(W / 2, cy + fit(label, bw - 16, 11) * 0.35, label, fit(label, bw - 16, 11), '#eee');
  return s + (o.extra ?? '');
}

function digit(cx: number, cy: number) { // an "8" with every segment lit, like the display on the board
  const w = 7, h = 12, S = [[-w, -h, w, -h], [w + 2, -h + 2, w + 2, -1], [w + 2, 1, w + 2, h - 2], [-w, h, w, h], [-w - 2, 1, -w - 2, h - 2], [-w - 2, -h + 2, -w - 2, -1], [-w, 0, w, 0]];
  return `<g transform="translate(${cx} ${cy}) scale(1.25)">${S.map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#ff4d4d" stroke-width="4" stroke-linecap="round"/>`).join('')}<circle cx="${w + 8}" cy="${h}" r="2.2" fill="#ff4d4d"/></g>`;
}

function to92(label: string, names: string[]) { // flat face toward you, three legs
  return legs(names, 50, 70, 14) + `<path d="M58 50 A22 22 0 0 1 102 50 Z" fill="#1b1b1b" stroke="#000" stroke-width="1.5"/>` + text(80, 44, label, fit(label, 36, 9), '#ddd');
}
function to220(label: string, names: string[]) { // metal tab with a mounting hole above a black body
  return legs(names, 58, 70, 20) + `<rect x="58" y="8" width="44" height="22" fill="${PIN}" stroke="#8a8a8a"/><circle cx="80" cy="17" r="4" fill="#f3efe2" stroke="#8a8a8a"/><rect x="58" y="30" width="44" height="28" rx="2" fill="#222" stroke="#000" stroke-width="1.5"/>` + text(80, 48, label, fit(label, 40, 10), '#eee');
}
function pot(names: string[]) { // blue trimmer with a slotted knob
  return legs(names, 54, 70, 16) + `<rect x="56" y="10" width="48" height="44" rx="5" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.5"/><circle cx="80" cy="32" r="14" fill="#d1d5db" stroke="#6b7280" stroke-width="1.5"/><line x1="70" y1="32" x2="90" y2="32" stroke="#374151" stroke-width="3" stroke-linecap="round" transform="rotate(-35 80 32)"/>`;
}
function relay(label: string) { // blue cube
  return legs(['1', '2', '3', '4', '5'], 54, 70, 18, false) + `<rect x="40" y="8" width="80" height="46" rx="3" fill="#1e5bb8" stroke="#123a7a" stroke-width="1.5"/>` + text(80, 35, label, fit(label, 64, 10), '#fff');
}
function transformer(names: string[]) { // two coils either side of an iron core
  const coil = (x: number, sweep: number) => `<path d="M${x} 20 a5 5 0 0 ${sweep} 0 10 a5 5 0 0 ${sweep} 0 10 a5 5 0 0 ${sweep} 0 10" fill="none" stroke="#e6e9ee" stroke-width="2"/>`;
  return legs(names, 56, 70, 16) + `<rect x="44" y="8" width="72" height="48" rx="4" fill="#3a3f47" stroke="#1f2328" stroke-width="1.5"/>${coil(62, 1)}${coil(98, 0)}<line x1="78" y1="16" x2="78" y2="50" stroke="#aaa" stroke-width="2"/><line x1="82" y1="16" x2="82" y2="50" stroke="#aaa" stroke-width="2"/>`;
}

function thumb(d: ComponentDef): string {
  const label = short(d), t = d.model.type, pk = d.package, names = d.pins.map(p => p.name);
  const g = t === 'transformer' ? transformer(names)
    : t === 'relay' ? relay(label)
    : t === 'pot' ? pot(names)
    : t === 'led7' ? dip(10, '', { bh: 52, fill: '#111', extra: digit(W / 2, H / 2) })
    : pk === 'TO-220' ? to220(label, names)
    : pk === 'TO-92' ? to92(label, names)
    : dip(Number(pk.match(/DIP-(\d+)/)?.[1] ?? names.length), label);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

const CAT_TITLE: Record<string, string> = { logic: 'Logic ICs', transistor: 'Transistors', analog: 'Analog ICs', display: 'Displays', passive: 'Passive parts', power: 'Power', optocoupler: 'Optocouplers', driver: 'Drivers', switch: 'Relays' };

export interface PickerOpts {
  bar: HTMLElement;               // the toolbar; the picker panel opens just below it
  select: HTMLSelectElement;      // the existing chip <select>: stays as the source of truth for placeIC(), but hidden
  chipTool: HTMLButtonElement;    // the "Chip" tool button
  onPick?: (id: string) => void;  // called after a tile is chosen (used for the status message)
}

export function initICPicker({ bar, select, chipTool, onPick }: PickerOpts) {
  const byCat = new Map<string, string[]>();
  Object.keys(COMPONENTS).filter(isSimulable).forEach(id => { const c = COMPONENTS[id].category; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push(id); });
  const tile = (id: string) => {
    const d = COMPONENTS[id], info = IC_INFO[id];
    return `<button type="button" class="icp-tile" data-id="${esc(id)}" aria-pressed="false">`
      + `<span class="icp-img">${thumb(d)}</span><span class="icp-name">${esc(short(d))}</span><span class="icp-pkg">${esc(d.package)}</span>`
      + `<span class="icp-what">${esc(info?.what ?? d.subtype)}</span>`
      + (info ? `<span class="icp-use"><b>Used for:</b> ${esc(info.use)}</span>` : '') + `</button>`;
  };
  const sections = [...byCat.entries()].map(([cat, ids]) => {
    ids.sort((a, b) => short(COMPONENTS[a]).localeCompare(short(COMPONENTS[b]), undefined, { numeric: true }));
    return `<details open><summary>${esc(CAT_TITLE[cat] ?? cat[0].toUpperCase() + cat.slice(1))} <small>${ids.length}</small></summary><div class="icp-grid">${ids.map(tile).join('')}</div></details>`;
  }).join('');

  const panel = document.createElement('section');
  panel.id = 'icpicker'; panel.hidden = true;
  panel.innerHTML = `<div class="icp-head"><div>Choose a chip <span>Pick one, then click a hole on the board</span></div><button type="button" class="icp-x" aria-label="Close" title="Close">✕</button></div><div class="icp-body">${sections}</div>`;
  bar.after(panel);
  const body = panel.querySelector<HTMLElement>('.icp-body')!;
  const tiles = [...panel.querySelectorAll<HTMLButtonElement>('.icp-tile')];

  const icBtn = document.createElement('button'); // shows the current chip and opens the gallery
  icBtn.type = 'button'; icBtn.title = 'Choose a chip'; icBtn.setAttribute('aria-haspopup', 'true'); icBtn.setAttribute('aria-expanded', 'false');
  select.after(icBtn); select.style.display = 'none';
  let current = select.value;
  const refresh = () => { const d = COMPONENTS[current]; icBtn.textContent = (d ? short(d) : 'Chips') + ' ▾'; tiles.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.id === current))); };
  const open = () => {
    panel.hidden = false; icBtn.setAttribute('aria-expanded', 'true'); refresh();
    const t = tiles.find(x => x.dataset.id === current); if (t) body.scrollTop = Math.max(0, t.offsetTop - 60);
  };
  const close = () => { panel.hidden = true; icBtn.setAttribute('aria-expanded', 'false'); };
  const pick = (id: string) => {
    current = id; select.value = id; select.dispatchEvent(new Event('change'));
    chipTool.click(); // switch to the Chip tool (this also re-opens the panel, so close it after)
    refresh(); close(); onPick?.(id);
  };

  icBtn.addEventListener('click', () => (panel.hidden ? open() : close()));
  chipTool.addEventListener('click', open);
  panel.querySelector('.icp-x')!.addEventListener('click', close);
  body.addEventListener('click', e => { const t = (e.target as Element).closest<HTMLElement>('.icp-tile'); if (t?.dataset.id) pick(t.dataset.id); });
  bar.addEventListener('click', e => { const b = (e.target as Element).closest('button'); if (b && b !== chipTool && b !== icBtn) close(); }); // choosing any other tool tidies the gallery away
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); e.preventDefault(); e.stopImmediatePropagation(); } }); // registered before main's Esc handler, so Esc closes the gallery instead of undoing
  refresh();
}
