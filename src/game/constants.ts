export const WIDTH = 1280;
export const HEIGHT = 720;
export const GROUND_Y = 610;
export const ARENA_LEFT = 70;
export const ARENA_RIGHT = 1210;
/** Global size of fighters (1 = 110px tall stick figure). */
export const FIG = 1.3;

// In-game palette: black & white, only blood is red.
export const PAPER = 0xefeee9;
export const INK = 0x111111;
export const INK_SOFT = 0x555555;
export const INK_FAINT = 0xb8b8b2;
export const BLOOD = 0xc4000c;
export const BLOOD_DARK = 0x7a0006;

/**
 * Accent colour: blood, hearts, perks and a few thin strokes in the scenery.
 * Every chapter has its own: red cliff, purple graveyard, green castle.
 */
export const ACCENTS = [
  { main: 0xc4000c, dark: 0x7a0006, soft: 0xf1c9c9 },
  { main: 0x7b2cbf, dark: 0x45127a, soft: 0xdcc8ef },
  { main: 0x2e9e3e, dark: 0x16602a, soft: 0xc9e8cd },
];
/** Current accent (mutable: set when a chapter starts). */
export const ACC = { ...ACCENTS[0] };
export function setAccent(chapter: number) {
  Object.assign(ACC, ACCENTS[Math.max(0, Math.min(ACCENTS.length - 1, chapter))]);
}
export const rgbOf = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;

// Menu palette (taken from Leo's menu mockup).
export const MENU_BG = 0x050505;
export const MENU_ORANGE = 0xf08a1c;
export const MENU_YELLOW = 0xf3d36b;
export const MENU_PALE = 0xf3dc9a;
export const MENU_DARKRED = 0x4a0b08;
export const MENU_TEAL = 0x8fe3d2;
export const MENU_WHITE = 0xffffff;

export const FONT_SLAB = 'Rockwell, "Rockwell Extra Bold", "Roboto Slab", Georgia, serif';
export const FONT_IMPACT = 'Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif';
export const FONT_HAND = '"Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive';

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
