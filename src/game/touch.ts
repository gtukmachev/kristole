/**
 * Touch devices (phones, tablets): is this one, which hand holds what, and the right words for hints.
 * `?touch=1` / `?touch=0` force it on or off (for tests and for trying it on a computer).
 */

const forced = new URLSearchParams(window.location.search).get('touch');
let touchSeen = false;

if (forced !== '0') {
  // A real finger on the screen switches the touch controls on, whatever the media query said.
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') touchSeen = true;
  }, { capture: true, passive: true });
}

export function isTouch(): boolean {
  if (forced === '1') return true;
  if (forced === '0') return false;
  return touchSeen || window.matchMedia?.('(pointer: coarse)').matches === true;
}

/** Desktop text or touch text. */
export function hint(keys: string, touch: string): string {
  return isTouch() ? touch : keys;
}

const SWAP_KEY = 'kristole.touchSwap';

/** Swapped hands: the stick on the right, the fight buttons on the left. Kept per device. */
export function handsSwapped(): boolean {
  try {
    return window.localStorage.getItem(SWAP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHandsSwapped(on: boolean) {
  try {
    window.localStorage.setItem(SWAP_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
