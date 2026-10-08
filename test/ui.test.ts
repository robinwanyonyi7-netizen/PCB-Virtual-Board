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
});