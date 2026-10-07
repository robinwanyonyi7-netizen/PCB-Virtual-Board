// Tiny dependency-free SVG line chart (dark theme), linear or log-x.
export interface Series { name: string; x: number[]; y: number[]; color: string; dash?: string }
export interface ChartOpts { title: string; xlabel: string; ylabel: string; logx?: boolean; xunit?: string; yunit?: string; h?: number }
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export function si(v: number, digits = 3): string {
  if (v === 0) return '0';
  const a = Math.abs(v), U: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [s, u] of U) if (a >= s * 0.9999) return `${+(v / s).toPrecision(digits)}${u}`;
  return v.toExponential(1);
}
function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
export function chart(series: Series[], o: ChartOpts): string {
  const W = 640, H = o.h ?? 280, L = 62, R = 14, T = 30, B = 44, pw = W - L - R, ph = H - T - B;
  const xs = series.flatMap(s => s.x).filter(Number.isFinite), ys = series.flatMap(s => s.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return '';
  const fx = (x: number) => (o.logx ? Math.log10(x) : x);
  let x0 = Math.min(...xs.map(fx)), x1 = Math.max(...xs.map(fx)), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; } const pad = (y1 - y0) * 0.07; y0 -= pad; y1 += pad;
  if (x0 === x1) x1 = x0 + 1;
  const X = (x: number) => L + ((fx(x) - x0) / (x1 - x0)) * pw, Y = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * ph;
  let g = '';
  const xt = o.logx ? Array.from({ length: Math.floor(x1) - Math.ceil(x0) + 1 }, (_, i) => 10 ** (Math.ceil(x0) + i)) : niceTicks(x0, x1);
  for (const t of xt) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T + ph}" stroke="#2c3541"/><text x="${X(t)}" y="${T + ph + 16}" text-anchor="middle">${si(t)}${o.xunit ?? ''}</text>`;
  for (const t of niceTicks(y0, y1)) g += `<line x1="${L}" x2="${L + pw}" y1="${Y(t)}" y2="${Y(t)}" stroke="#2c3541"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${si(t)}</text>`;
  let lines = '', lg = '', lx = L + 6;
  for (const s of series) {
    const pts = s.x.map((x, i) => (Number.isFinite(s.y[i]) ? `${X(x).toFixed(1)},${Y(s.y[i]).toFixed(1)}` : '')).filter(Boolean).join(' ');
    lines += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`;
    lg += `<line x1="${lx}" x2="${lx + 16}" y1="${T - 12}" y2="${T - 12}" stroke="${s.color}" stroke-width="3" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/><text x="${lx + 20}" y="${T - 8}">${esc(s.name)}</text>`;
    lx += 30 + s.name.length * 6.4;
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(o.title)}" font-family="system-ui,sans-serif" font-size="11" fill="#c9d1d9">`
    + `<rect width="${W}" height="${H}" rx="8" fill="#10141a"/>${g}<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="#42505f"/>${lines}${lg}`
    + `<text x="${L + pw / 2}" y="${H - 6}" text-anchor="middle" fill="#8b95a3">${esc(o.xlabel)}</text>`
    + `<text transform="translate(12 ${T + ph / 2}) rotate(-90)" text-anchor="middle" fill="#8b95a3">${esc(o.ylabel)}</text></svg>`;
}
