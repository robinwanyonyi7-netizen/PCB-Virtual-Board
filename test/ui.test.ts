// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('IC tool (jsdom smoke test)', () => {
  it('places a 7400 from the picker, draws it, saves it and reports it on Run DC', async () => {
    document.body.innerHTML = '<div id="app"></div><div id="bar"></div><pre id="out"></pre>';
    await import('../src/main');
    const btn = (t: string) => [...document.querySelectorAll('#bar button')].find(b => b.textContent === t) as HTMLButtonElement;
    const sel = document.querySelector('#bar select') as HTMLSelectElement;
    expect([...sel.options].map(o => o.value)).toContain('7400');
    sel.value = '7400'; btn('Chip').click();
    const hole = [...document.querySelectorAll('svg circle')].find(c => c.getAttribute('fill') === 'transparent')!; // first hole = column 1
    hole.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('out')!.textContent).toContain('Placed 7400');
    expect([...document.querySelectorAll('svg text')].some(t => t.textContent === '7400')).toBe(true);
    expect(JSON.parse(localStorage.getItem('vb.circuit.v1')!)[0]).toMatchObject({ kind: 'IC', ref: '7400' });
    sel.value = '2N2222'; hole.dispatchEvent(new MouseEvent('click', { bubbles: true })); // TO-92 in row 1, columns 1-3
    expect(document.getElementById('out')!.textContent).toContain('Placed 2N2222');
    expect(['E', 'B', 'C'].every(l => [...document.querySelectorAll('svg text')].some(t => t.textContent === l))).toBe(true);
    btn('V').click(); btn('Run DC').click(); // no battery yet: warns instead of throwing
    expect(document.getElementById('out')!.textContent).toContain('No battery');
  });

  it('new tools: switch toggles, pot slider sets the wiper, chips can be moved, display draws, Zener places', async () => {
    const btn = (t: string) => [...document.querySelectorAll('#bar button')].find(b => b.textContent === t) as HTMLButtonElement;
    const picker = document.querySelector('#bar select') as HTMLSelectElement, out = () => document.getElementById('out')!.textContent!;
    const holes = () => [...document.querySelectorAll('svg circle')].filter(c => c.getAttribute('fill') === 'transparent');
    const hole = (c: number, r: number) => holes()[c * 10 + r];                    // main-board hole, column c, row r (0-based)
    const press = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const saved = () => JSON.parse(localStorage.getItem('vb.circuit.v1')!) as { kind: string; ref?: string; value: number; pins: string[] }[];
    // switch: two clicks place it, clicking the lever flips it
    btn('Switch').click(); press(hole(10, 2)); press(hole(14, 2));
    expect(saved().at(-1)).toMatchObject({ kind: 'SW', value: 1 });
    const lever = () => [...document.querySelectorAll('svg line')].find(l => l.getAttribute('stroke') === 'transparent' && l.getAttribute('stroke-width') === '18')!;
    press(lever()); expect(saved().at(-1)!.value).toBe(0); expect(out()).toContain('No battery'); // Run DC was used earlier, so the switch re-ran the circuit and the result replaced the message
    press(lever()); expect(saved().at(-1)!.value).toBe(1);
    // zener: value box holds the breakdown voltage
    btn('Zener').click(); press(hole(16, 2)); press(hole(16, 3 + 2));
    expect(saved().at(-1)).toMatchObject({ kind: 'ZD', value: 5.1 });
    // potentiometer: starts at 50 %, select it, slider appears and edits the value; clicking a hole moves it
    picker.value = 'POT10K'; btn('Chip').click(); press(hole(18, 6));
    expect(saved().at(-1)).toMatchObject({ kind: 'IC', ref: 'POT10K', value: 50 });
    btn('Select').click();
    const bodies = [...document.querySelectorAll('svg rect')].filter(r => r.getAttribute('fill') === '#1b1b1b'); press(bodies.at(-1)!);
    const slider = document.querySelector('#bar input[type=range]') as HTMLInputElement;
    expect(slider.style.display).toBe(''); expect(out()).toContain('Selected POT10K');
    slider.value = '30'; slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(saved().at(-1)!.value).toBe(30);
    press(hole(24, 6)); expect(saved().at(-1)!.pins).toEqual(['m:24:6', 'm:25:6', 'm:26:6']);
    // 7-segment display draws a dim digit (7 segments)
    picker.value = 'DISP7'; btn('Chip').click(); press(hole(8, 5));
    expect(document.querySelectorAll('svg line[stroke="#3a1b1b"]').length).toBeGreaterThanOrEqual(7);
    // clock tool exists and takes a frequency
    btn('Clock').click(); expect((document.querySelector('#bar input:not([type=range])') as HTMLInputElement).value).toBe('1000');
  });
});