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
  { id: 'simple', title: 'Simple' },
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

/** Simple scheme: what a tap swings — alternately up and down, or by the height of the tap. */
export type SimpleSwing = 'alternate' | 'height';
const SWING_KEY = 'kristole.simpleSwing';

export function simpleSwing(): SimpleSwing {
  return get(SWING_KEY) === 'height' ? 'height' : 'alternate';
}

export function setSimpleSwing(v: SimpleSwing) {
  set(SWING_KEY, v);
}

/**
 * Joystick layout (v9): stick size, the outer ring (Joystick 2), "under the finger" or a fixed place,
 * and where the fight buttons are and how big. Kept per scheme, for the right hand
 * (the stick on the left); swapped hands mirror it.
 */
export interface Spot {
  x: number;
  y: number;
}
export interface ButtonSpot extends Spot {
  r: number;
}
export type FightButton = 'high' | 'low' | 'block';
export interface JoyLayout {
  /** How far the knob travels (the inner ring). */
  stickR: number;
  /** Outer ring radius, × stickR (Joystick 2). */
  outerK: number;
  /** The stick stays in one place (else it appears under the finger). */
  fixed: boolean;
  /** Where the stick is drawn at rest / stays when fixed. */
  stick: Spot;
  buttons: Record<FightButton, ButtonSpot>;
}

export const LAYOUT_LIMITS = {
  stickR: [36, 110, 6],
  outerK: [1.5, 2.6, 0.1],
  buttonR: [40, 110, 6],
} as const;

export function defaultLayout(): JoyLayout {
  return {
    stickR: 60,
    outerK: 1.9,
    fixed: false,
    stick: { x: 190, y: 585 },
    buttons: {
      high: { x: 1188, y: 450, r: 64 },
      low: { x: 1188, y: 615, r: 64 },
      block: { x: 1010, y: 615, r: 64 },
    },
  };
}

const layoutKey = (id: SchemeId) => `kristole.layout.${id}`;

export function joyLayout(id: SchemeId): JoyLayout {
  const d = defaultLayout();
  try {
    const raw = get(layoutKey(id));
    if (!raw) return d;
    const v = JSON.parse(raw) as Partial<JoyLayout>;
    return {
      ...d,
      ...v,
      stick: { ...d.stick, ...v.stick },
      buttons: {
        high: { ...d.buttons.high, ...v.buttons?.high },
        low: { ...d.buttons.low, ...v.buttons?.low },
        block: { ...d.buttons.block, ...v.buttons?.block },
      },
    };
  } catch {
    return d;
  }
}

export function setJoyLayout(id: SchemeId, l: JoyLayout | null) {
  if (l) set(layoutKey(id), JSON.stringify(l));
  else {
    try {
      window.localStorage.removeItem(layoutKey(id));
    } catch {
      /* ignore */
    }
  }
}
