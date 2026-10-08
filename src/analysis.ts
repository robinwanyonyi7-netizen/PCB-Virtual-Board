// Graph measurements (rows of [label, value]) and worked theory for simple series circuits, plus plain-language meanings.
import { si } from './plot';
import type { El } from './solver';
export type Rows = [string, string][];
const num = (x: number) => { if (x === 0) return '0'; const a = Math.abs(x); return a < 1e-3 || a >= 1e6 ? x.toExponential(3).replace(/\.?0+e/, 'e').replace('e+', 'e') : String(+x.toPrecision(4)); };
const hz = (x: number) => (x >= 1e5 ? `${si(x)} Hz` : `${x.toFixed(1)} Hz`);
const order = (slope: number) => { const k = Math.round(Math.abs(slope) / 20); return k >= 1 ? `${['1st', '2nd', '3rd'][k - 1] ?? k + 'th'} order` : 'shallow'; };

function cross(t: number[], y: number[], level: number): number | null { // first time y crosses `level`
  for (let i = 1; i < y.length; i++) if ((y[i - 1] - level) * (y[i] - level) <= 0 && y[i] !== y[i - 1]) return t[i - 1] + ((level - y[i - 1]) / (y[i] - y[i - 1])) * (t[i] - t[i - 1]);
  return null;
}

export function timeParams(t: number[], y: number[], kind: string, amp: number, freq: number, unit: string, final?: number): Rows {
  const N = y.length, rows: Rows = [];
  if (kind === 'sine' || kind === 'square') {
    const tail = y.slice(Math.floor(N * 0.75)), pp = Math.max(...tail) - Math.min(...tail);
    rows.push(['Output swing (last part)', `${si(pp)}${unit} peak-to-peak`]);
    if (unit === 'V' && amp > 0) { const gn = pp / (2 * amp); rows.push(['Gain (output ÷ input)', `${gn.toFixed(3)} = ${(20 * Math.log10(Math.max(gn, 1e-9))).toFixed(1)} dB`]); }
    if (freq > 0) rows.push(['Signal period', `T = 1 / f = 1 / ${num(freq)} = ${si(1 / freq)}s`]);
    return rows;
  }
  const y0 = y[0], yf = final ?? y[N - 1], d = yf - y0;
  rows.push(['Final value (steady state)', `${si(yf)}${unit}`]);
  if (Math.abs(d) < 1e-9 * Math.max(1, Math.abs(yf))) return rows;
  const ext = d >= 0 ? Math.max(...y) : Math.min(...y), os = (ext - yf) / d;
  rows.push(['Peak', `${si(ext)}${unit} at ${si(t[y.indexOf(ext)])}s`]);
  rows.push(['Overshoot', `${(Math.max(os, 0) * 100).toFixed(1)} %`]);
  if (os > 0.005) { const l = Math.log(os); rows.push(['Damping ratio ζ (from overshoot)', `ζ = −ln(${os.toFixed(4)}) / √(π² + ln²(${os.toFixed(4)})) = ${(-l / Math.sqrt(Math.PI ** 2 + l * l)).toFixed(4)}`]); }
  const a = cross(t, y, y0 + 0.1 * d), b = cross(t, y, y0 + 0.9 * d), t63 = cross(t, y, y0 + 0.632 * d);
  if (a !== null && b !== null) rows.push(['Rise time (10 → 90%)', `${si(b - a)}s`]);
  if (t63 !== null) rows.push(['Time constant τ (63.2% point)', `${si(t63)}s`]);
  const tail = y.slice(Math.floor(N * 0.95)), settled = tail.every(v => Math.abs(v - yf) <= 0.02 * Math.abs(d));
  if (settled) { let k = N - 1; while (k > 0 && Math.abs(y[k] - yf) <= 0.02 * Math.abs(d)) k--; rows.push(['Settling time (2%)', `${si(t[Math.min(k + 1, N - 1)])}s`]); }
  else rows.push(['Settling time (2%)', 'not settled yet: raise the stop time']);
  return rows;
}

export function freqParams(fs: number[], g: number[], ph: number[], gLow?: number, gHigh?: number): Rows {
  const N = fs.length, pk = g.indexOf(Math.max(...g)), peak = g[pk], lowG = gLow ?? g[0], highG = gHigh ?? g[N - 1], top = Math.max(peak, lowG, highG);
  const rows: Rows = [], bothEnds = Math.abs(lowG - highG) <= 20; // ends far apart: a pass-band at one end; similar ends: band-pass / flat / notch
  const type = !bothEnds ? (lowG > highG ? (peak > lowG + 3.0103 ? 'low-pass (with resonant peak)' : 'low-pass') : (peak > highG + 3.0103 ? 'high-pass (with resonant peak)' : 'high-pass'))
    : Math.max(lowG, highG) <= top - 3.0103 ? 'band-pass' : Math.min(...g) < top - 3.0103 ? 'band-stop (notch)' : 'flat (no cutoff in this range)';
  rows.push(['Response type', type], ['Peak gain', `${peak.toFixed(2)} dB at ${hz(fs[pk])}`]);
  const phaseAt = (f: number) => { let k = 0; while (k < N - 2 && fs[k + 1] < f) k++; return ph[k] + (Math.log(f / fs[k]) / Math.log(fs[k + 1] / fs[k])) * (ph[k + 1] - ph[k]); };
  const hit = (from: number, dir: 1 | -1, tgt: number) => { // first crossing below tgt, scanning from index `from`
    for (let k = from; dir === 1 ? k < N - 1 : k > 0; k += dir) if (g[k] >= tgt && g[k + dir] < tgt) return fs[k] * (fs[k + dir] / fs[k]) ** ((tgt - g[k]) / (g[k + dir] - g[k]));
    return null;
  };
  if (type.startsWith('low-pass')) {
    const tgt = lowG - 3.0103, fc = hit(pk, 1, tgt);
    if (fc) {
      rows.push(['Cutoff frequency fc (−3 dB)', hz(fc)], ['Gain at cutoff', `${tgt.toFixed(2)} dB`], ['Phase at cutoff', `${phaseAt(fc).toFixed(1)}°`]);
      if (fs[N - 1] >= 4 * fc) { const m = Math.min(10, N - 1), s = (g[N - 1] - g[N - 1 - m]) / Math.log10(fs[N - 1] / fs[N - 1 - m]); rows.push(['Roll-off above fc', `${s.toFixed(1)} dB/decade (≈ ${order(s)})`]); }
    }
  } else if (type.startsWith('high-pass')) {
    const tgt = highG - 3.0103, fc = hit(pk, -1, tgt);
    if (fc) {
      rows.push(['Cutoff frequency fc (−3 dB)', hz(fc)], ['Gain at cutoff', `${tgt.toFixed(2)} dB`], ['Phase at cutoff', `${phaseAt(fc).toFixed(1)}°`]);
      if (fs[0] <= fc / 4) { const m = Math.min(10, N - 1), s = (g[m] - g[0]) / Math.log10(fs[m] / fs[0]); rows.push(['Roll-off below fc', `+${s.toFixed(1)} dB/decade (≈ ${order(s)})`]); }
    }
  } else if (type === 'band-pass') {
    const tgt = peak - 3.0103, hi = hit(pk, 1, tgt), lo = hit(pk, -1, tgt);
    if (lo) rows.push(['Lower cutoff fL (−3 dB)', hz(lo)]);
    if (hi) rows.push(['Upper cutoff fH (−3 dB)', hz(hi)]);
    if (lo && hi) {
      const bw = hi - lo, f0 = Math.sqrt(lo * hi);
      rows.push(['Centre frequency f0', `f0 = √(fL × fH) = √(${lo.toFixed(1)} × ${hi.toFixed(1)}) = ${f0.toFixed(1)} Hz`], ['Bandwidth BW', `BW = fH − fL = ${hi.toFixed(1)} − ${lo.toFixed(1)} = ${bw.toFixed(1)} Hz`], ['Quality factor Q', `Q = f0 / BW = ${f0.toFixed(1)} / ${bw.toFixed(1)} = ${(f0 / bw).toFixed(1)}`]);
      rows.push(['Phase at centre', `${phaseAt(f0).toFixed(1)}°`]);
    }
  }
  return rows;
}

/** Worked theory when the circuit is ONE series loop of a battery with R, L, C (any other topology returns null). */
export function seriesTheory(els: El[], n: number): string[] | null {
  if (els.some(e => !['V', 'R', 'L', 'C'].includes(e.t)) || els.filter(e => e.t === 'V').length !== 1) return null;
  const deg = new Array(n).fill(0); els.forEach(e => { deg[e.a]++; deg[e.b]++; });
  if (deg.some(d => d !== 2)) return null; // every node must join exactly two parts
  const Rs = els.reduce((s, e) => s + (e.t === 'R' ? e.v : 0), 0), Ls = els.reduce((s, e) => s + (e.t === 'L' ? e.v : 0), 0);
  const ic = els.reduce((s, e) => s + (e.t === 'C' ? 1 / e.v : 0), 0), Cs = ic ? 1 / ic : 0, P = 2 * Math.PI;
  if (!Rs || (!Ls && !Cs)) return null;
  const tag = els.filter(e => e.t === 'R').length > 1 || els.filter(e => e.t === 'L').length > 1 || els.filter(e => e.t === 'C').length > 1 ? ' (series parts combined)' : '';
  if (Cs && !Ls) { const fc = 1 / (P * Rs * Cs), tau = Rs * Cs; return [`fc = 1 / (2π R C) = 1 / (2π × ${num(Rs)} × ${num(Cs)}) = ${fc.toFixed(2)} Hz${tag}`, `τ = R C = ${num(Rs)} × ${num(Cs)} = ${si(tau)}s`, `Rise time ≈ 2.2 τ = 2.2 × ${si(tau)}s = ${si(2.2 * tau)}s`, `Settling (2%) ≈ 3.9 τ = 3.9 × ${si(tau)}s = ${si(3.9 * tau)}s`]; }
  if (Ls && !Cs) { const fc = Rs / (P * Ls), tau = Ls / Rs; return [`fc = R / (2π L) = ${num(Rs)} / (2π × ${num(Ls)}) = ${fc.toFixed(2)} Hz${tag}`, `τ = L / R = ${num(Ls)} / ${num(Rs)} = ${si(tau)}s`, `Rise time ≈ 2.2 τ = 2.2 × ${si(tau)}s = ${si(2.2 * tau)}s`, `Settling (2%) ≈ 3.9 τ = 3.9 × ${si(tau)}s = ${si(3.9 * tau)}s`]; }
  const w0 = 1 / Math.sqrt(Ls * Cs), f0 = w0 / P, Q = Math.sqrt(Ls / Cs) / Rs, zeta = (Rs / 2) * Math.sqrt(Cs / Ls), al = Rs / (2 * Ls);
  const out = [`f0 = 1 / (2π √(L C)) = 1 / (2π × √(${num(Ls)} × ${num(Cs)})) = ${f0.toFixed(2)} Hz${tag}`, `Q = (1/R) √(L/C) = (1/${num(Rs)}) × √(${num(Ls)} / ${num(Cs)}) = ${Q.toFixed(2)}`, `BW = f0 / Q = ${f0.toFixed(2)} / ${Q.toFixed(2)} = ${(f0 / Q).toFixed(2)} Hz`,
    `ζ = (R/2) √(C/L) = (${num(Rs)}/2) × √(${num(Cs)} / ${num(Ls)}) = ${zeta.toFixed(4)}`, `α = R / 2L = ${num(Rs)} / (2 × ${num(Ls)}) = ${num(al)} s⁻¹ ;  ω0 = 1 / √(L C) = ${num(w0)} rad/s`];
  if (zeta < 1) { const wd = Math.sqrt(w0 * w0 - al * al), os = Math.exp((-Math.PI * al) / wd); out.push(`ωd = √(ω0² − α²) = ${num(wd)} rad/s → ringing period 2π / ωd = ${si(P / wd)}s`, `Peak time = π / ωd = ${si(Math.PI / wd)}s ;  overshoot = e^(−π α / ωd) = ${(os * 100).toFixed(1)} %`); }
  else out.push('ζ ≥ 1: no ringing (critically damped or overdamped)');
  return out;
}

/** One-line plain-language meaning for a row label (shown under the value; can be hidden with "Explain terms"). */
const MEAN: [string, string][] = [
  ['Response type', 'Low-pass lets low frequencies through and blocks high ones; high-pass does the opposite; band-pass favours one band; a "resonant peak" means it also boosts one frequency.'],
  ['Peak gain', 'The most signal that gets through. 0 dB = full size, negative = reduced, positive = boosted by resonance.'],
  ['Cutoff frequency', 'The edge between "passes" and "blocks": the output voltage falls to 70.7% (power halves). Memory hook: cutoff = −3 dB.'],
  ['Lower cutoff', 'Lower edge of the band that gets through (−3 dB point).'],
  ['Upper cutoff', 'Upper edge of the band that gets through (−3 dB point).'],
  ['Gain at cutoff', 'Reference level minus 3 dB. This is the definition of "cutoff".'],
  ['Phase at', 'How far the output is shifted in time relative to the input. First-order low-pass: −45° at fc (output lags); high-pass: +45° (output leads).'],
  ['Centre frequency', 'The frequency in the middle of the band (where it responds most strongly).'],
  ['Bandwidth', 'Width of the band that gets through: upper cutoff minus lower cutoff.'],
  ['Quality factor', 'How sharp the peak is: centre frequency ÷ bandwidth. High Q = narrow and strongly resonant, rings for longer.'],
  ['Roll-off', 'How steeply it blocks beyond cutoff. 20 dB/decade = first order (10× the frequency → ÷10 the voltage); 40 = second order.'],
  ['Final value', 'Where it ends up once everything has settled (the steady state).'],
  ['Peak', 'The most extreme value reached, and when.'],
  ['Overshoot', 'How far it goes past the final value, as a % of the total change. Overshoot and ringing mean it is underdamped (L and C together).'],
  ['Damping ratio', 'How quickly ringing dies out. Below 1 it rings (smaller = longer), at 1 or above it does not ring.'],
  ['Rise time', 'How quickly it responds: time to go from 10% to 90% of the change. For an RC circuit it is about 2.2 × τ.'],
  ['Time constant', 'Time to cover 63.2% of the change: the circuit\'s "speed" in one number. RC: τ = R×C. RL: τ = L÷R.'],
  ['Settling time', 'When it stays within 2% of the final value for good: "basically done". About 3.9 × τ for an RC circuit.'],
  ['Output swing', 'How big the output wiggle is once the start-up has died away.'],
  ['Gain (output', 'How much of the input survives: 1 = all of it, 0.707 = −3 dB. The Frequency tab shows this across many frequencies.'],
  ['Signal period', 'Time for one full cycle: T = 1 / f.'],
];
export const meaning = (label: string): string => MEAN.find(([k]) => label.startsWith(k))?.[1] ?? '';
