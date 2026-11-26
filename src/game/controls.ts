/**
 * Control schemes (v9, the Controls screen): which one is chosen and its settings. Kept per device.
 * The keyboard always works, whatever is chosen; the others are for touch screens.
 */
import { isTouch } from './touch';

export type SchemeId = 'keyboard' | 'joy1' | 'simple' | 'joy2';

export interface SchemeDef {
  id: SchemeId;
  title: string;
  /** Touch scheme: has a hands (left / right) setting. */
  hands?: boolean;
}

/** In the order of the Controls screen. */
export const SCHEMES: SchemeDef[] = [
  { id: 'keyboard', title: 'Keyboard' },
  { id: 'joy1', title: 'Joystick 1', hands: true },
  { id: 'joy2', title: 'Joystick 2', hands: true },
];

const KEY = 'kristole.controls';

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

function set(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

/** Computers start on the keyboard, phones and tablets on Joystick 1. */
export function defaultScheme(): SchemeId {
  return isTouch() ? 'joy1' : 'keyboard';
}

export function currentScheme(): SchemeId {
  const v = get(KEY) as SchemeId | null;
  if (v && SCHEMES.some((s) => s.id === v)) {
    // a phone can't play with the keyboard
    if (v === 'keyboard' && isTouch()) return defaultScheme();
    return v;
  }
  return defaultScheme();
}

export function setScheme(id: SchemeId) {
  set(KEY, id);
}

/** Can this scheme be chosen here? (The keyboard is for computers.) */
export function schemeAvailable(id: SchemeId): boolean {
  return id !== 'keyboard' || !isTouch();
}
