# Virtual Breadboard
Browser-based breadboard simulator: place parts on a realistic 830-style board, wire them, and run the circuit before building it.

## Architecture
- `src/solver.ts` – Modified Nodal Analysis. DC operating point with Newton–Raphson (diodes/LEDs, voltage-step limiting), backward-Euler transient for capacitors, gmin for floating nets.
- `src/breadboard.ts` – hole→strip connectivity (a–e / f–j per column, 4 power rails), union-find nets, netlist + warnings (no source, shorted parts).
- `src/main.ts` – SVG board, click-two-holes placement, DC run, LED brightness from current.
- `test/solver.test.ts` – divider, LED, RC checks.

## Run
`npm install && npm run dev` · `npm test`

## Roadmap
1. Transient run loop + scope panel (plot node voltage vs time); AC sources (sine/square), potentiometer, switch
2. Inductor, BJT (Ebers–Moll), MOSFET, op-amp (ideal then finite gain), 555 and logic-gate macros
3. DRC: LED without resistor, reversed polarity, over-current/power rating, floating inputs
4. Save/load JSON, SPICE netlist export, shareable links
5. Real component footprints (DIP ICs straddling the gap), part drag/move/delete, undo/redo
