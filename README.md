# Virtual Breadboard
Browser-based breadboard simulator: place parts on a realistic 830-style board, wire them, and run the circuit before building it.

## Architecture
- `src/solver.ts` – Modified Nodal Analysis. DC operating point with Newton–Raphson (diodes/LEDs, voltage-step limiting), backward-Euler transient for capacitors, gmin for floating nets.
- `src/breadboard.ts` – hole→strip connectivity (a–e / f–j per column, 4 power rails), union-find nets, netlist + warnings (no source, shorted parts). Battery negative = ground.
- `src/main.ts` – SVG board, click-two-holes placement, DC run, LED brightness from current.
- `src/components.json` + `src/components.ts` – component database (pins, package, params, model). 41 parts, all simulated: **logic** 7400/02/04/08/10/20/32/86, 74HC138 decoder, 74HC151/157 multiplexers, 74HC283 adder, 74HC4511 BCD-to-7-segment (`"gates"`), 74HC74/112 flip-flops, 74HC161/163/393/4017 counters, 74HC595 shift register, 74HC373 latch (`"seq"`, edge-triggered, state kept between time steps, see `src/seq.ts`); **transistors** 2N2222, 2N3904, BC547, BC557 (`"bjt"`, Ebers–Moll) and 2N7000, BS170 (`"mosfet"`); **analog** LM358, LM324, LM741 op-amps (`"opamp"`, single-pole), LM393 comparator (`"comparator"`, open collector), NE555 and LMC555 timers (`"timer"`); **power** LM7805/09/12 and LM317 regulators (`"regulator"`); **passive/display** 1k/10k/100k potentiometers (`"pot"`) and a common-cathode 7-segment display (`"led7"`). Besides chips the toolbar has Zener and Schottky diodes, a click-to-flip Switch and a Clock source (0/5 V square wave). BJTs, MOSFETs, op-amps and pots also work in the frequency sweep; logic ICs, clocked chips, comparators and the 555 do not. Add a part by adding a JSON entry, no code changes.
- `test/` – solver (divider, LED, RC), ICs (truth tables for every gate chip, DIP footprint, breadboard NAND), UI smoke test.

## Run
`npm install && npm run dev` · `npm test`

## Roadmap
1. Transient run loop + scope panel (node voltage vs time); AC sources, potentiometer, switch
2. Shift registers (74HC595), 7-segment decoder, regulators (LM7805), real supplies (dual rails)
3. DRC: LED without resistor, reversed polarity, power ratings, floating inputs
4. Save/load JSON, SPICE netlist export, shareable links
5. DIP ICs straddling the centre gap, drag/move/delete parts, undo/redo

## Using it

- **Chip tool:** pick a part from the list (grouped by type), click a hole. DIP chips straddle the centre gap with pin 1 bottom-left; 3-pin parts (transistors, regulators, pots) sit in 3 holes of the clicked row, left to right.
- **Select** a chip to move it (click a hole: pin 1 / the left leg goes there). Select a pot to get its wiper slider.
- **Live results:** after you press *Run DC* once, flipping a switch, turning a pot or moving a chip re-runs it, so LEDs and the 7-segment display follow.
- **Clocked circuits:** add a *Clock* part (first click = output, second = ground; the value box is its frequency) and use *Graphs → Time → Measure: Logic view* with a chip as the probe to see its pins as a logic-analyser trace. A 555 works as a clock too.
- **Dual supply (±V):** add a second battery whose + goes to the first battery's − (ground) and use its − as the negative rail.
- **Known simplifications:** simple switching models for logic (no propagation delay beyond one time step); 4511 latch-enable pin not modelled; regulators cannot sink current and have no current limit; op-amps have no slew limit or input offset.