// v9: touch gesture logic, without a browser (Node runs the .ts directly). Fast and stable: no timing.
import { blockLineY, fingerKind, inOuterUp, isTap, swipeDir } from '../src/game/gestures.ts';

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

// ---- Simple: swipes
check(swipeDir(0, -100) === 'up', 'swipe straight up = up');
check(swipeDir(30, -100) === 'up', 'swipe up, a little off = up');
check(swipeDir(80, -100) === 'upRight', 'swipe up-right = upRight');
check(swipeDir(-80, -80) === 'upLeft', 'swipe up-left (45°) = upLeft');
check(swipeDir(0, 100) === 'down', 'swipe down = down');
check(swipeDir(100, -20) === null, 'swipe sideways = nothing');
// ---- Simple: tap / hold / swipe
check(fingerKind(0.1, 100) === 'pending', 'just touched: not decided yet');
check(fingerKind(0.1, 200) === 'hold', 'held still: hold (walk)');
check(fingerKind(1.0, 150) === 'swipe', 'quick move: swipe');
check(fingerKind(1.0, 600) === 'pending', 'slow drag is not a swipe');
check(isTap(0.1) && !isTap(0.6), 'tap = barely moved');
// ---- Simple: block zone
const phone = blockLineY(390), ipad = blockLineY(576);
check(phone > 135 && phone < 300, `phone: thin block band under the top bar (line at ${Math.round(phone)})`);
check(ipad > phone && ipad <= 720 * 0.62, `iPad: block zone bigger (line at ${Math.round(ipad)})`);

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
