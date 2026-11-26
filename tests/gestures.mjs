// v9: touch gesture logic, without a browser (Node runs the .ts directly). Fast and stable: no timing.
import { inOuterUp } from '../src/game/gestures.ts';

let fails = 0;
const check = (ok, name) => {
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
};

// ---- Joystick 2: outer ring
const R = 60;
check(!inOuterUp(0, -R, R, false), 'thumb up inside the inner ring: not outer');
check(inOuterUp(0, -R * 1.4, R, false), 'thumb up past the inner ring: outer');
check(inOuterUp(R * 0.8, -R * 1.4, R, false), 'up and a bit sideways: outer');
check(!inOuterUp(R * 2, -R * 1.4, R, false), 'mostly sideways: not outer');
check(!inOuterUp(0, R * 1.5, R, false), 'down: not outer');
check(inOuterUp(0, -R * 1.1, R, true), 'eased back a little: still outer (no flicker)');
check(!inOuterUp(0, -R * 0.9, R, true), 'back in the inner ring: left the outer');

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
