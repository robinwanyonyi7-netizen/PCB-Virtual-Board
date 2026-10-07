# Virtual Breadboard
Browser-based breadboard simulator: place parts on a realistic 830-style board, wire them, and run the circuit before building it.

## Architecture
- `src/solver.ts` – Modified Nodal Analysis. DC operating point with Newton–Raphson (diodes/LEDs, voltage-step limiting), backward-Euler transient for capacitors, gmin for floating nets.
- `src/breadboard.ts` – hole→strip connectivity (a–e / f–j per column, 4 power rails), union-find nets, netlist + warnings (no source, shorted parts). Battery negative = ground.
- `src/main.ts` – SVG board, click-two-holes placement, DC run, LED brightness from current.
- `test/solver.test.ts` – divider, LED, RC checks.

## Run
`npm install && npm run dev` · `npm test`

## Roadmap
1. Transient run loop + scope panel (node voltage vs time); AC sources, potentiometer, switch
2. Inductor, BJT (Ebers–Moll), MOSFET, op-amp, 555 and logic-gate macros
3. DRC: LED without resistor, reversed polarity, power ratings, floating inputs
4. Save/load JSON, SPICE netlist export, shareable links
5. DIP ICs straddling the centre gap, drag/move/delete parts, undo/redo
