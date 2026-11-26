/**
 * Pure touch-gesture logic (no Phaser): easy to check with a fast test without a browser
 * (tests/gestures.mjs runs this file directly in Node).
 */

/** Joystick 2: the thumb goes this far up (× stick travel) to enter the outer ring… */
export const OUTER_IN = 1.25;
/** …and must come back below this to leave it (a little gap, so a shaky thumb doesn't flicker). */
export const OUTER_OUT = 1.0;
/** How far the knob may go into the outer ring (× stick travel). */
export const OUTER_MAX = 1.9;

/** Is the thumb in the upper part of the outer ring? `wasIn` = it was there last frame. */
export function inOuterUp(dx: number, dy: number, travel: number, wasIn: boolean): boolean {
  if (wasIn) return dy < -travel * OUTER_OUT;
  return dy < -travel * OUTER_IN && -dy > Math.abs(dx) * 0.8;
}
