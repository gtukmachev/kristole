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

/**
 * Is the thumb in the upper part of the outer ring? `wasIn` = it was there last frame.
 * `outerK` = outer ring size (× travel): a bigger ring starts a little further out.
 */
export function inOuterUp(dx: number, dy: number, travel: number, wasIn: boolean, outerK = OUTER_MAX): boolean {
  if (wasIn) return dy < -travel * OUTER_OUT;
  const start = 1 + (OUTER_IN - 1) * ((outerK - 1) / (OUTER_MAX - 1));
  return dy < -travel * start && -dy > Math.abs(dx) * 0.8;
}

// ---- Simple scheme: taps, holds and swipes anywhere (sizes in centimetres of the real screen)

/** CSS pixels per centimetre on phones and tablets (about; browsers don't tell the real size). */
export const CSS_PX_PER_CM = 56;
/** A finger that moves less than this is still a tap / a hold. */
export const TAP_MOVE_CM = 0.35;
/** A quick move this long is a swipe… */
export const SWIPE_CM = 0.7;
/** …if it happens this soon after touching. */
export const SWIPE_MS = 320;
/** Held this long without a swipe: walking. Released sooner: a tap. */
export const HOLD_MS = 170;
/** Height of the control strip at the bottom; above it is the block zone. */
export const CONTROL_STRIP_CM = 4.5;

export type SwipeDir = 'up' | 'upLeft' | 'upRight' | 'down';

/** Direction of a swipe (screen coordinates: y grows down), or null for a sideways one. */
export function swipeDir(dx: number, dy: number): SwipeDir | null {
  if (dy < 0 && -dy > Math.abs(dx) * 0.45) {
    // up: straight (within ~25° of vertical) or up-and-sideways
    if (Math.abs(dx) < -dy * 0.47) return 'up';
    return dx < 0 ? 'upLeft' : 'upRight';
  }
  if (dy > 0 && dy > Math.abs(dx)) return 'down';
  return null;
}

/** What one finger is, so far. `moved` and `swipe` in centimetres, `ms` since it touched. */
export type FingerKind = 'pending' | 'hold' | 'swipe';

export function fingerKind(movedCm: number, ms: number): FingerKind {
  if (movedCm >= SWIPE_CM && ms <= SWIPE_MS) return 'swipe';
  if (ms >= HOLD_MS && movedCm < SWIPE_CM) return 'hold';
  return 'pending';
}

/** A finger let go while still pending: was it a tap? */
export function isTap(movedCm: number): boolean {
  return movedCm < TAP_MOVE_CM;
}

/**
 * Where the block zone ends (game y; above = block), from the canvas height in CSS pixels.
 * Phone: a thin band under the top bar; iPad: everything above the thumbs.
 */
export function blockLineY(canvasCssH: number, gameH = 720, topBar = 135): number {
  const strip = (CONTROL_STRIP_CM * CSS_PX_PER_CM * gameH) / canvasCssH;
  return Math.max(topBar + 90, Math.min(gameH * 0.62, gameH - strip));
}
