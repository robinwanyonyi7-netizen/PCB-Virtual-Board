# Virtual Breadboard
Browser-based breadboard simulator: place parts on a realistic 830-style board, wire them, and run the circuit before building it.

## Architecture
- `src/solver.ts` – Modified Nodal Analysis. DC operating point with Newton–Raphson (diodes/LEDs, voltage-step limiting), backward-Euler transient for capacitors, gmin for floating nets.
- `src/breadboard.ts` – hole→strip connectivity (a–e / f–j per column, 4 power rails), union-find nets, netlist + warnings (no source, shorted parts). Battery negative = ground.
- `src/main.ts` – SVG board, click-two-holes placement, DC run, LED brightness from current.
- `src/components.json` + `src/components.ts` – component database (pins, package, params, model). Every entry is simulated: **logic** 7400/02/04/08/10/20/32/86, 74HC138 decoder, 74HC151 and 74HC157 multiplexers, 74HC283 adder (`"gates"`); **transistors** 2N2222, 2N3904, BC547 (NPN), BC557 (PNP) (`"bjt"`, Ebers–Moll) and 2N7000, BS170 (`"mosfet"`, level-1 square law); **analog** LM358, LM324, LM741 op-amps (`"opamp"`, single-pole, rail clamping) and NE555, LMC555 timers (`"timer"`, latch kept across time steps). BJTs, MOSFETs and op-amps also work in the frequency sweep; logic ICs and the 555 do not. Add a part by adding a JSON entry, no code changes.
- `test/` – solver (divider, LED, RC), ICs (truth tables for every gate chip, DIP footprint, breadboard NAND), UI smoke test.

## Run
`npm install && npm run dev` · `npm test`

## Roadmap
1. Transient run loop + scope panel (node voltage vs time); AC sources, potentiometer, switch
2. Sequential chips (74HC74 flip-flop, 74HC161 counter), 7-segment decoder, regulators (LM7805), real supplies (dual rails)
3. DRC: LED without resistor, reversed polarity, power ratings, floating inputs
4. Save/load JSON, SPICE netlist export, shareable links
5. DIP ICs straddling the centre gap, drag/move/delete parts, undo/redo