// Plain-language blurbs shown in the chip picker. Key = the part's id in components.json.
// A part with no entry here still appears in the picker, using its subtype as the description.
export interface ICInfo { what: string; use: string }

export const IC_INFO: Record<string, ICInfo> = {
  // --- Logic gates ---
  '7400': { what: 'Four independent 2-input NAND gates in one chip.', use: 'NAND is a universal gate, so any logic can be built from it. Latches, inverters, glue logic.' },
  '7402': { what: 'Four independent 2-input NOR gates in one chip.', use: 'SR latches and "all inputs low" detection. Also a universal gate.' },
  '7404': { what: 'Six inverters (NOT gates): the output is the opposite of the input.', use: 'Flipping or buffering a signal, and simple RC oscillators.' },
  '7408': { what: 'Four 2-input AND gates. The output is high only when both inputs are high.', use: 'Enabling or gating a signal, e.g. letting a clock through only when a switch is on.' },
  '7432': { what: 'Four 2-input OR gates. The output is high when either input is high.', use: 'Combining alarm or trigger signals into one line.' },
  '7486': { what: 'Four 2-input XOR gates. The output is high when the inputs differ.', use: 'Adders, parity checkers, comparators and a switchable inverter.' },
  '7410': { what: 'Three 3-input NAND gates in one chip.', use: 'Wider decoding and enable logic where two inputs are not enough.' },
  '7420': { what: 'Two 4-input NAND gates in one chip.', use: 'Detecting a 4-bit pattern and wide address decoding.' },
  '74HC283': { what: '4-bit binary full adder with fast carry. Adds two 4-bit numbers plus a carry in.', use: 'The core of a simple ALU or calculator. Chips can be chained for wider numbers.' },
  '74HC138': { what: '3-to-8 line decoder. A 3-bit input pulls exactly one of 8 outputs low.', use: 'Address decoding and chip-select, or driving one of 8 devices at a time.' },
  '74HC151': { what: '8-to-1 multiplexer. A 3-bit select picks which of 8 inputs reaches the output.', use: 'Data selection, serialising parallel data, or building any 3-input logic function.' },
  '74HC157': { what: 'Quad 2-to-1 multiplexer: four switches that each choose between two sources.', use: 'Choosing between two 4-bit buses, e.g. selecting a data source.' },
  '74HC4511': { what: 'BCD to 7-segment decoder and driver with a latch.', use: 'Showing a 4-bit count as a digit 0 to 9 on a common-cathode display. Pair it with a counter.' },

  // --- Flip-flops, counters, registers ---
  '74HC74': { what: 'Dual D flip-flop with set and clear. Each stores one bit on a rising clock edge.', use: 'Registers, divide-by-2 stages, edge synchronisers and switch debouncing.' },
  '74HC112': { what: 'Dual JK flip-flop, falling-edge triggered, with asynchronous set and clear.', use: 'Toggle stages for frequency dividers and counters, and small state machines.' },
  '74HC161': { what: '4-bit synchronous binary counter with asynchronous clear and parallel load.', use: 'Counting pulses 0 to 15, divide-by-N circuits and address generators.' },
  '74HC163': { what: '4-bit synchronous binary counter with synchronous clear and parallel load.', use: 'Same jobs as the 74HC161, but the clear is clock-aligned so it is safer in state machines.' },
  '74HC393': { what: 'Dual 4-bit binary ripple counter.', use: 'Dividing a fast clock down, e.g. a crystal frequency by up to 256.' },
  '74HC4017': { what: 'Decade counter with 10 decoded outputs. One output is high at a time.', use: 'LED chasers, running lights and simple sequencers.' },
  '74HC595': { what: '8-bit shift register with an output latch. Serial data in, 8 parallel outputs.', use: 'Driving 8 LEDs or a display from just 3 microcontroller pins. Chips can be chained.' },
  '74HC373': { what: 'Octal transparent latch with 3-state outputs.', use: 'Holding an 8-bit value, e.g. latching a multiplexed address/data bus.' },

  // --- Transistors ---
  '2N2222': { what: 'General-purpose NPN transistor, 40 V and up to 600 mA.', use: 'Switching LEDs, relays and buzzers from a logic pin, and general amplifying.' },
  '2N3904': { what: 'General-purpose NPN transistor, 40 V and up to 200 mA.', use: 'Low-power switching, small-signal amplifiers and logic-level drivers.' },
  'BC547': { what: 'General-purpose NPN transistor, 45 V and up to 100 mA.', use: 'Audio preamps and small-signal switching. Very common in hobby circuits.' },
  'BC557': { what: 'PNP transistor, the complement of the BC547. 45 V, up to 100 mA.', use: 'High-side switching and push-pull stages paired with a BC547.' },
  '2N7000': { what: 'N-channel MOSFET, 60 V and up to 200 mA. Switched by voltage, not current.', use: 'Driving small loads from logic with almost no gate current, and level shifting.' },
  'BS170': { what: 'N-channel MOSFET, 60 V and up to 500 mA.', use: 'Switching LEDs, relays and small motors from logic, and level shifting.' },

  // --- Analog ---
  'LM358': { what: 'Dual op-amp that runs from a single supply.', use: 'Amplifiers, buffers, filters and sensor signal conditioning in 5 V circuits.' },
  'LM324': { what: 'Quad op-amp (four amplifiers) that runs from a single supply.', use: 'Multi-stage filters and amplifiers where one chip should do several jobs.' },
  'LM741': { what: 'Classic general-purpose op-amp. Needs a higher supply, about 10 V or more here.', use: 'Learning op-amp circuits: inverting and non-inverting amps, integrators, audio.' },
  'NE555': { what: 'The classic bipolar 555 timer.', use: 'Astable oscillators, one-shot pulses and delays, LED blinkers and PWM.' },
  'LMC555': { what: 'CMOS version of the 555 timer, with lower power draw.', use: 'The same timing jobs as the NE555 in battery-powered circuits.' },
  'LM393': { what: 'Dual comparator with open-collector outputs.', use: 'Threshold detection, zero-crossing, light and temperature sensing. Needs a pull-up on the output.' },

  // --- Display, pots, power, other ---
  'DISP7': { what: 'Single-digit 7-segment LED display, common cathode.', use: 'Showing digits 0 to 9. Put a resistor on each segment, or drive it from a 74HC4511.' },
  'POT1K': { what: 'Linear potentiometer, 1 kΩ: a variable resistor with a sliding wiper.', use: 'Adjustable voltage divider, brightness or volume knob, and low-resistance tuning.' },
  'POT10K': { what: 'Linear potentiometer, 10 kΩ: a variable resistor with a sliding wiper.', use: 'The usual choice for dividers, knobs and sensor inputs on logic or op-amp circuits.' },
  'POT100K': { what: 'Linear potentiometer, 100 kΩ: a variable resistor with a sliding wiper.', use: 'High-impedance dividers, tone controls and timing adjustments (e.g. a 555 frequency knob).' },
  'LM7805': { what: 'Fixed 5 V positive voltage regulator, up to about 1 A.', use: 'Turning a 7 to 12 V supply into a steady 5 V for logic and microcontrollers.' },
  'LM7809': { what: 'Fixed 9 V positive voltage regulator, up to about 1 A.', use: 'Powering 9 V circuits from a higher DC supply such as a 12 V adapter.' },
  'LM7812': { what: 'Fixed 12 V positive voltage regulator, up to about 1 A.', use: 'A steady 12 V rail for relays, fans and op-amp circuits from a higher DC input.' },
  'LM317': { what: 'Adjustable positive regulator. Two resistors set the output from a 1.25 V reference.', use: 'Variable bench supplies and constant-current LED drivers.' },
  'PC817': { what: 'Optocoupler: an LED on the input side lights a phototransistor on the output side.', use: 'Isolating a microcontroller from mains, high voltage or noisy circuits.' },
  'PC814': { what: 'AC-input optocoupler with two back-to-back LEDs, so it works with either polarity.', use: 'Safely detecting AC mains presence or zero crossings.' },
  'ULN2003A': { what: 'Seven-channel Darlington transistor array that sinks current (low-side driver). Simulated as one channel here.', use: 'Driving relays, stepper motors and solenoids from logic pins. Has built-in flyback diodes.' },
  'SRD-05VDC': { what: '5 V relay: a small coil flips a mechanical switch.', use: 'Switching mains or high-current loads with full isolation. Drive it from a transistor with a flyback diode.' },
  'TRF230-12': { what: 'Transformer that steps 230 V AC down to 12 V AC.', use: 'The first stage of a mains power supply, followed by a rectifier, filter and regulator.' },
};
