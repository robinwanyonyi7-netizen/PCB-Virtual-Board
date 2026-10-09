// A showcase board used by the tests and for visual checks: BCD digit "5" -> 74HC4511 -> 330 ohm -> 7-segment display,
// a 2N2222 LED driver, a pot, an open switch, and a 555 / 7805 placed (unpowered) to see how chips are drawn.
import { placeHoles } from '../src/components';
import type { Part } from '../src/breadboard';
const w = (a: string, b: string): Part => ({ kind: 'WIRE', pins: [a, b], value: 0 });
const r = (a: string, b: string, v = 330): Part => ({ kind: 'R', pins: [a, b], value: v });
const chip = (ref: string, at: string, value = 0): Part => ({ kind: 'IC', ref, pins: placeHoles(ref, at)!, value });
export const demoParts: Part[] = [
  { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 },
  chip('74HC4511', 'm:0:5'), chip('DISP7', 'm:12:5'), chip('NE555', 'm:8:5'),
  w('m:0:3', 'r:0:1'), w('m:7:6', 'r:1:1'),                                                    // 4511 power
  w('m:6:6', 'r:0:2'), w('m:0:6', 'r:1:2'), w('m:1:6', 'r:0:3'), w('m:5:6', 'r:1:3'),           // A=1 B=0 C=1 D=0  (BCD 0101 = 5)
  w('m:2:6', 'r:0:4'), w('m:3:6', 'r:0:5'), w('m:4:6', 'r:1:4'),                                // ~LT, ~BI high; LE low
  w('m:14:6', 'r:1:5'),                                                                         // display COM to ground
  r('m:3:1', 'm:15:1'), r('m:4:2', 'm:16:2'), r('m:5:3', 'm:15:7'), r('m:6:0', 'm:13:8'),       // segments a, b, c, d
  r('m:7:3', 'm:12:9'), r('m:1:2', 'm:13:2'), r('m:2:3', 'm:12:3'),                              // segments e, f, g
  chip('2N2222', 'm:19:6'), w('m:19:7', 'r:1:6'), r('m:20:7', 'r:0:6', 10e3), r('r:0:7', 'm:22:8'),
  { kind: 'LED', pins: ['m:22:9', 'm:21:9'], value: 0 },                                       // LED driver: collector low side
  chip('POT10K', 'm:24:2', 30), w('m:24:1', 'r:0:8'), w('m:26:1', 'r:1:7'),
  { kind: 'SW', pins: ['m:27:4', 'm:29:4'], value: 0 },
  chip('LM7805', 'm:17:3'),
];

/** A 74HC161 counted by a 1 kHz CLK part (control pins tied high), Q0 loaded so it can be probed. */
export const counterParts: Part[] = [
  { kind: 'V', pins: ['r:0:0', 'r:1:0'], value: 5 }, chip('74HC161', 'm:0:5'),
  w('m:0:3', 'r:0:1'), w('m:7:6', 'r:1:1'), w('m:0:6', 'r:0:2'), w('m:7:3', 'r:0:3'), w('m:6:6', 'r:0:4'), w('m:6:3', 'r:0:5'),
  { kind: 'CLK', pins: ['m:1:6', 'r:1:2'], value: 1000 }, r('m:2:3', 'r:1:3', 10e3),
];