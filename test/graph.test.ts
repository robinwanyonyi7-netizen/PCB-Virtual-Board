// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { counterParts } from '../src/demo';

describe('graph panel: logic view (jsdom)', () => {
  it('plots the pins of a clocked counter as logic lanes, with a time base set by the clock', async () => {
    localStorage.setItem('vb.circuit.v1', JSON.stringify(counterParts));
    document.body.innerHTML = '<div id="app"></div><div id="bar"></div><pre id="out"></pre><section id="graph"></section>';
    await import('../src/main');
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    $('graph').querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); // refreshes the probe list
    const probe = $<HTMLSelectElement>('g-probe'), idx = [...probe.options].findIndex(o => o.textContent!.includes('74HC161'));
    expect(idx).toBeGreaterThanOrEqual(0);
    probe.value = String(idx); $<HTMLSelectElement>('g-qty').value = 'logic';
    $('g-plot').click();
    expect($('g-msg').textContent).toBe('');
    const html = $('g-out').innerHTML;
    expect(html).toContain('74HC161 logic view');
    expect((html.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(10);       // clock, control pins and Q0..Q3, TC
    expect(html).toContain('>CP<'); expect(html).toContain('>Q3<'); expect(html).toContain('>TC<');
    // ~MR is tied high on a steady supply, so its lane is a single flat line (a step supply would make it start low)
    const first = html.match(/<polyline points="([^"]+)"/)![1];
    expect(new Set(first.trim().split(' ').map(pt => pt.split(',')[1])).size).toBe(1);
    // the 1 kHz clock sets a 20 ms window, so the axis reaches 20 ms
    expect(html).toMatch(/20ms/);
    // asking for the logic view of a non-chip says so instead of failing silently
    probe.value = '0'; $('g-plot').click();
    expect($('g-msg').textContent).toContain('Logic view needs');
  });
});