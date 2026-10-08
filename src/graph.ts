// Graph panel: time response (transient) and frequency response (Bode) of the circuit on the board.
import { solve, transient, acSolve, srcValue, type Wave } from './solver';
import { buildNetlist, type Part } from './breadboard';
import { chart, type Series } from './plot';
import { freqParams, timeParams, seriesTheory, meaning, type Rows } from './analysis';

export interface Host { parts: () => Part[]; label: (p: Part) => string }
interface Cfg { mode: 'time' | 'freq'; kind: Wave['kind']; freq: string; tstop: string; fmin: string; fmax: string; qty: 'v' | 'i'; explain?: boolean }
const KEY = 'vb.graph';
const DEF: Cfg = { mode: 'time', kind: 'step', freq: '1k', tstop: '', fmin: '10', fmax: '100k', qty: 'v' };
export const parseSI = (t: string) => { const m = t.trim().match(/^([\d.]+(?:e[+-]?\d+)?)\s*(Meg|[pnuµmkMG]?)/i); if (!m) return NaN; const k: Record<string, number> = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, M: 1e6, meg: 1e6, Meg: 1e6, G: 1e9 }; return +m[1] * (k[m[2]] ?? 1); };

export function initGraph(root: HTMLElement, host: Host) {
  let cfg: Cfg = { ...DEF };
  try { cfg = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* ignore */ }
  root.innerHTML = `<details><summary>Graphs: time &amp; frequency</summary><div class="gbody">
    <div class="gtabs"><button data-m="time">Time</button><button data-m="freq">Frequency</button></div>
    <div class="grid">
      <label>Source (battery)<select id="g-kind"><option value="step">Step (0 → battery value)</option><option value="sine">Sine (±battery value)</option><option value="square">Square (±battery value)</option><option value="dc">DC (constant)</option></select></label>
      <label class="g-f1">Frequency (Hz)<input id="g-freq" inputmode="decimal"></label>
      <label>Probe (voltage across)<select id="g-probe"></select></label>
      <label class="g-t">Measure<select id="g-qty"><option value="v">Voltage (V)</option><option value="i">Current (mA)</option></select></label>
      <label class="g-t">Stop time (s)<input id="g-tstop" inputmode="decimal" placeholder="auto"></label>
      <label class="g-f">From (Hz)<input id="g-fmin" inputmode="decimal"></label>
      <label class="g-f">To (Hz)<input id="g-fmax" inputmode="decimal"></label>
    </div>
    <div class="gact"><button id="g-plot" class="run">Plot</button><button id="g-csv">CSV</button><label class="gexp"><input type="checkbox" id="g-exp"> Explain terms</label></div>
    <div id="g-msg" class="gmsg"></div><div id="g-out"></div><div id="g-calc"></div></div></details>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector('#' + id) as T;
  const kind = $<HTMLSelectElement>('g-kind'), freq = $<HTMLInputElement>('g-freq'), probe = $<HTMLSelectElement>('g-probe'), qty = $<HTMLSelectElement>('g-qty');
  const tstop = $<HTMLInputElement>('g-tstop'), fmin = $<HTMLInputElement>('g-fmin'), fmax = $<HTMLInputElement>('g-fmax'), msg = $('g-msg'), out = $('g-out'), calc = $('g-calc'), exp = $<HTMLInputElement>('g-exp');
  exp.checked = cfg.explain !== false; calc.classList.toggle('noexp', !exp.checked);
  exp.addEventListener('change', () => { calc.classList.toggle('noexp', !exp.checked); save(); });
  kind.value = cfg.kind; freq.value = cfg.freq; qty.value = cfg.qty; tstop.value = cfg.tstop; fmin.value = cfg.fmin; fmax.value = cfg.fmax;
  let csv = '';
  const save = () => { cfg = { ...cfg, kind: kind.value as Wave['kind'], freq: freq.value, qty: qty.value as 'v' | 'i', tstop: tstop.value, fmin: fmin.value, fmax: fmax.value, explain: exp.checked }; try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ } };
  const showMode = () => {
    root.querySelectorAll<HTMLButtonElement>('.gtabs button').forEach(b => b.classList.toggle('on', b.dataset.m === cfg.mode));
    root.querySelectorAll<HTMLElement>('.g-t').forEach(e => (e.style.display = cfg.mode === 'time' ? '' : 'none'));
    root.querySelectorAll<HTMLElement>('.g-f').forEach(e => (e.style.display = cfg.mode === 'freq' ? '' : 'none'));
    root.querySelector<HTMLElement>('.g-f1')!.style.display = cfg.mode === 'freq' || kind.value === 'sine' || kind.value === 'square' ? '' : 'none';
    kind.parentElement!.style.display = cfg.mode === 'time' ? '' : 'none';
  };
  const listed: Part[] = [];
  const refresh = () => { // rebuild the probe list from the parts currently on the board
    const keep = listed[+probe.value] ?? null; listed.length = 0;
    host.parts().filter(p => p.kind !== 'WIRE').forEach(p => listed.push(p));
    probe.innerHTML = listed.map((p, i) => `<option value="${i}">${host.label(p).replace(/[<&]/g, '')}</option>`).join('') || '<option value="-1">(no parts yet)</option>';
    const want = keep && listed.includes(keep) ? listed.indexOf(keep) : Math.max(0, listed.findIndex(p => p.kind === 'C'));
    if (listed.length) probe.value = String(Math.max(0, want));
  };
  root.querySelectorAll<HTMLButtonElement>('.gtabs button').forEach(b => b.addEventListener('click', () => { cfg.mode = b.dataset.m as Cfg['mode']; save(); showMode(); out.innerHTML = ''; calc.innerHTML = ''; msg.textContent = ''; }));
  kind.addEventListener('change', () => { save(); showMode(); });
  [probe, root.querySelector('summary')!].forEach(e => ['pointerdown', 'focus', 'click'].forEach(ev => e.addEventListener(ev, refresh)));
  [freq, qty, tstop, fmin, fmax].forEach(e => e.addEventListener('change', save));
  showMode(); refresh();

  const fail = (m: string) => { msg.textContent = '⚠ ' + m; out.innerHTML = ''; calc.innerHTML = ''; csv = ''; };
  const show = (rows: Rows, theory: string[] | null) => { // "Calculated from the graph" table + worked textbook check
    calc.innerHTML = `<div class="gcalc"><h4>Calculated from the graph</h4><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}${meaning(k) ? `<small class="mean">${meaning(k)}</small>` : ''}</dd>`).join('')}</dl></div>`
      + (theory ? `<div class="gcalc"><h4>Theory check (one series loop)</h4><ul>${theory.map(l => `<li>${l}</li>`).join('')}</ul></div>` : '');
  };
  function plot() {
    save(); refresh(); msg.textContent = '';
    const wave: Wave = { kind: kind.value as Wave['kind'], freq: parseSI(freq.value) || 1000 };
    const nl = buildNetlist(host.parts(), wave);
    if (!nl.els.some(e => e.t === 'V')) return fail('Add a battery (V) first.');
    const part = listed[+probe.value], pk = part ? nl.parts.indexOf(part) : -1;
    if (pk < 0) return fail('Pick a part to probe (it may be shorted or missing).');
    const els = nl.els, srcK = els.findIndex(e => e.t === 'V'), pr = els[pk], vsrc = els[srcK] as { v: number; w?: Wave };
    if (cfg.mode === 'time') {
      const R = els.reduce((a, e) => a + (e.t === 'R' ? e.v : 0), 0), C = els.reduce((a, e) => a + (e.t === 'C' ? e.v : 0), 0), Lh = els.reduce((a, e) => a + (e.t === 'L' ? e.v : 0), 0);
      const periodic = wave.kind === 'sine' || wave.kind === 'square', tau = Math.max(R * C, R ? Lh / R : 0);
      const T = parseSI(tstop.value) > 0 ? parseSI(tstop.value) : periodic ? 4 / (wave.freq as number) : tau > 0 ? 5 * tau : 0.01;
      const res = transient(els, nl.nodes, T, 800);
      const isV = qty.value === 'v', y = res.t.map((_, k) => (isV ? res.v[k][pr.a] - res.v[k][pr.b] : res.i[k][pk] * 1e3));
      const series: Series[] = [];
      if (isV) series.push({ name: 'source (battery)', x: res.t, y: res.t.map(t => srcValue(vsrc, t)), color: '#8b95a3', dash: '5 4' });
      series.push({ name: isV ? 'probe voltage' : 'probe current', x: res.t, y, color: '#2f81f7' });
      out.innerHTML = chart(series, { title: 'Time response', xlabel: 'time (s)', ylabel: isV ? 'volts (V)' : 'current (mA)', xunit: 's' });
      const dc = solve(els, nl.nodes, undefined, 0, { t: 1e9 }), fin = isV ? dc.v[pr.a] - dc.v[pr.b] : dc.i[pk] * 1e3; // steady state with the step on
      show(timeParams(res.t, y, wave.kind, vsrc.v, wave.freq as number, isV ? 'V' : 'mA', wave.kind === 'step' ? fin : undefined), seriesTheory(els, nl.nodes));
      csv = 'time_s,' + (isV ? 'source_V,probe_V' : 'probe_mA') + '\n' + res.t.map((t, k) => [t, ...(isV ? [series[0].y[k], y[k]] : [y[k]])].join(',')).join('\n');
    } else {
      const f0 = parseSI(fmin.value), f1 = parseSI(fmax.value);
      if (!(f0 > 0 && f1 > f0)) return fail('Enter a valid frequency range (e.g. 10 to 100k).');
      const N = 121, fs = Array.from({ length: N }, (_, k) => f0 * (f1 / f0) ** (k / (N - 1)));
      const op = solve(els, nl.nodes, undefined, 0, { t: 0, pre: true }).v, gain: number[] = [], ph: number[] = [];
      for (const f of fs) {
        const r = acSolve(els, nl.nodes, srcK, f, op); if (!r) return fail('Could not solve the circuit (is it complete?).');
        const re = r.re[pr.a] - r.re[pr.b], im = r.im[pr.a] - r.im[pr.b];
        gain.push(20 * Math.log10(Math.max(Math.hypot(re, im), 1e-12))); ph.push((Math.atan2(im, re) * 180) / Math.PI);
      }
      out.innerHTML = chart([{ name: 'gain', x: fs, y: gain, color: '#2f81f7' }], { title: 'Gain', xlabel: 'frequency (Hz)', ylabel: 'gain (dB)', logx: true, xunit: 'Hz', h: 250 })
        + '<div style="height:8px"></div>' + chart([{ name: 'phase', x: fs, y: ph, color: '#e5383b' }], { title: 'Phase', xlabel: 'frequency (Hz)', ylabel: 'phase (deg)', logx: true, xunit: 'Hz', h: 230 });
      const gAt = (f: number) => { const r = acSolve(els, nl.nodes, srcK, f, op); return r ? 20 * Math.log10(Math.max(Math.hypot(r.re[pr.a] - r.re[pr.b], r.im[pr.a] - r.im[pr.b]), 1e-12)) : undefined; };
      show(freqParams(fs, gain, ph, gAt(1e-3), gAt(1e9)), seriesTheory(els, nl.nodes));
      csv = 'freq_Hz,gain_dB,phase_deg\n' + fs.map((f, k) => `${f},${gain[k]},${ph[k]}`).join('\n');
    }
  }
  $('g-plot').addEventListener('click', plot);
  $('g-csv').addEventListener('click', () => {
    if (!csv) { msg.textContent = '⚠ Plot something first.'; return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `breadboard-${cfg.mode}.csv`; a.click();
  });
}