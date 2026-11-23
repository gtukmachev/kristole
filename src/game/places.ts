import { GROUND_Y } from './constants';

/**
 * Every level is its own place: a different picture and a different way zombies arrive.
 * Places are grouped into chapters (5 each). See plan/v3.md for the design table.
 */
export type PlaceId = string;

/** How zombies enter: rise from the earth, come out of a spot (door, coffin, barrel…), drop from above, or parachute in. */
export type Entrance = 'rise' | 'spot' | 'drop' | 'parachute' | 'heli' | 'none';

/** What a spawn spot looks like when it opens. */
export type SpotKind = 'cave' | 'door' | 'crypt' | 'coffin' | 'barrel' | 'cabinet' | 'armor' | 'throne' | 'mausoleum' | 'edge' | 'ledge' | 'window';

export interface Spot {
  x: number;
  /** Ground y for doors etc., or a height for ledges / windows (zombie falls from there). */
  y: number;
  kind: SpotKind;
}

export interface Platform {
  x: number; // centre
  y: number; // top surface
  w: number;
}

export interface PlaceDef {
  id: PlaceId;
  name: string;
  entrance: Entrance;
  spots: Spot[];
  platforms: Platform[];
  /** Where the bonus heart waits (usually on a ledge you have to jump to). */
  heart?: { x: number; y: number };
  /** Exit shown after the level is cleared. */
  exit: 'door' | 'cave' | 'path' | 'gate' | 'stairs';
}

const G = GROUND_Y;
const doorRow = (xs: number[], kind: SpotKind): Spot[] => xs.map((x) => ({ x, y: G, kind }));

export const PLACES: PlaceDef[][] = [
  [
    {
      id: 'cliffFoot', name: 'Foot of the Cliff', entrance: 'rise', spots: [],
      platforms: [{ x: 230, y: G - 175, w: 150 }], heart: { x: 230, y: G - 205 }, exit: 'door',
    },
    {
      id: 'caveDoor', name: 'Cave Entrance', entrance: 'spot', spots: doorRow([330, 950], 'cave'),
      platforms: [{ x: 640, y: G - 190, w: 170 }], heart: { x: 640, y: G - 220 }, exit: 'cave',
    },
    {
      id: 'caveInside', name: 'Inside the Cave', entrance: 'drop',
      spots: [{ x: 250, y: G - 175, kind: 'ledge' }, { x: 1030, y: G - 175, kind: 'ledge' }, { x: 640, y: G - 300, kind: 'ledge' }],
      platforms: [{ x: 250, y: G - 175, w: 170 }, { x: 1030, y: G - 175, w: 170 }, { x: 640, y: G - 300, w: 150 }],
      heart: { x: 640, y: G - 330 }, exit: 'stairs',
    },
    {
      id: 'cliffPath', name: 'The Cliff Path', entrance: 'parachute', spots: [],
      platforms: [{ x: 960, y: G - 180, w: 140 }], heart: { x: 960, y: G - 210 }, exit: 'path',
    },
    {
      id: 'summit', name: 'The Summit', entrance: 'spot', spots: [{ x: 1150, y: G, kind: 'edge' }, { x: 130, y: G, kind: 'edge' }],
      platforms: [{ x: 640, y: G - 200, w: 150 }], heart: { x: 640, y: G - 230 }, exit: 'path',
    },
  ],
  [
    {
      id: 'graveGates', name: 'Graveyard Gates', entrance: 'rise', spots: [],
      platforms: [{ x: 1080, y: G - 185, w: 140 }], heart: { x: 1080, y: G - 215 }, exit: 'gate',
    },
    {
      id: 'crypts', name: 'Row of Crypts', entrance: 'spot', spots: doorRow([300, 640, 980], 'crypt'),
      platforms: [{ x: 470, y: G - 200, w: 120 }], heart: { x: 470, y: G - 230 }, exit: 'path',
    },
    {
      id: 'chapel', name: 'The Old Chapel', entrance: 'drop',
      spots: [{ x: 330, y: G - 330, kind: 'window' }, { x: 640, y: G - 380, kind: 'window' }, { x: 950, y: G - 330, kind: 'window' }],
      platforms: [{ x: 640, y: G - 190, w: 160 }], heart: { x: 640, y: G - 220 }, exit: 'stairs',
    },
    {
      id: 'openGraves', name: 'Open Graves', entrance: 'spot', spots: doorRow([250, 520, 790, 1060], 'coffin'),
      platforms: [{ x: 655, y: G - 185, w: 130 }], heart: { x: 655, y: G - 215 }, exit: 'path',
    },
    {
      id: 'mausoleum', name: 'The Mausoleum', entrance: 'spot', spots: doorRow([640], 'mausoleum'),
      platforms: [{ x: 250, y: G - 190, w: 140 }, { x: 1030, y: G - 190, w: 140 }], heart: { x: 1030, y: G - 220 }, exit: 'gate',
    },
  ],
  [
    {
      id: 'moat', name: 'The Drawbridge', entrance: 'rise', spots: [],
      platforms: [{ x: 250, y: G - 185, w: 150 }], heart: { x: 250, y: G - 215 }, exit: 'gate',
    },
    {
      id: 'courtyard', name: 'Castle Courtyard', entrance: 'spot', spots: doorRow([230, 470, 830, 1070], 'barrel'),
      platforms: [{ x: 650, y: G - 190, w: 160 }], heart: { x: 650, y: G - 220 }, exit: 'door',
    },
    {
      id: 'armory', name: 'The Armory', entrance: 'spot',
      spots: [...doorRow([220, 1060], 'cabinet'), ...doorRow([480, 800], 'armor')],
      platforms: [{ x: 640, y: G - 200, w: 150 }], heart: { x: 640, y: G - 230 }, exit: 'stairs',
    },
    {
      id: 'ramparts', name: 'The Ramparts', entrance: 'parachute', spots: [],
      platforms: [{ x: 300, y: G - 185, w: 130 }, { x: 980, y: G - 185, w: 130 }], heart: { x: 980, y: G - 215 }, exit: 'door',
    },
    {
      id: 'throne', name: 'The Throne Room', entrance: 'spot', spots: doorRow([640], 'throne'),
      platforms: [{ x: 260, y: G - 195, w: 140 }, { x: 1020, y: G - 195, w: 140 }], heart: { x: 260, y: G - 225 }, exit: 'door',
    },
  ],
  // ---- v5 chapters (see plan/v5.md) ----
  [
    { id: 'stadiumGate', name: 'Stadium Gates', entrance: 'spot', spots: doorRow([330, 950], 'door'),
      platforms: [{ x: 640, y: G - 185, w: 160 }], heart: { x: 640, y: G - 215 }, exit: 'gate' },
    { id: 'pitch', name: 'The Football Pitch', entrance: 'rise', spots: [],
      platforms: [{ x: 250, y: G - 180, w: 140 }, { x: 1030, y: G - 180, w: 140 }], heart: { x: 1030, y: G - 210 }, exit: 'path' },
    { id: 'court', name: 'Basketball Court', entrance: 'drop',
      spots: [{ x: 250, y: G - 300, kind: 'ledge' }, { x: 640, y: G - 330, kind: 'ledge' }, { x: 1030, y: G - 300, kind: 'ledge' }],
      platforms: [{ x: 640, y: G - 185, w: 150 }], heart: { x: 640, y: G - 215 }, exit: 'door' },
    { id: 'shuttleHall', name: 'Badminton Hall', entrance: 'spot', spots: doorRow([220, 640, 1060], 'door'),
      platforms: [{ x: 430, y: G - 190, w: 130 }, { x: 850, y: G - 190, w: 130 }], heart: { x: 850, y: G - 220 }, exit: 'stairs' },
    { id: 'grandstand', name: 'The Grandstand', entrance: 'drop',
      spots: [{ x: 300, y: G - 340, kind: 'window' }, { x: 640, y: G - 360, kind: 'window' }, { x: 980, y: G - 340, kind: 'window' }],
      platforms: [{ x: 640, y: G - 200, w: 160 }], heart: { x: 640, y: G - 230 }, exit: 'gate' },
  ],
  [
    { id: 'checkpoint', name: 'The Checkpoint', entrance: 'spot', spots: doorRow([300, 980], 'door'),
      platforms: [{ x: 640, y: G - 180, w: 150 }], heart: { x: 640, y: G - 210 }, exit: 'gate' },
    { id: 'barracks', name: 'The Barracks', entrance: 'spot', spots: doorRow([230, 520, 810, 1090], 'door'),
      platforms: [{ x: 665, y: G - 195, w: 130 }], heart: { x: 665, y: G - 225 }, exit: 'path' },
    { id: 'helipad', name: 'The Helipad', entrance: 'heli', spots: [],
      platforms: [{ x: 260, y: G - 185, w: 140 }, { x: 1020, y: G - 185, w: 140 }], heart: { x: 260, y: G - 215 }, exit: 'path' },
    { id: 'trenches', name: 'Training Ground', entrance: 'rise', spots: [],
      platforms: [{ x: 640, y: G - 190, w: 170 }], heart: { x: 640, y: G - 220 }, exit: 'path' },
    { id: 'hangar', name: 'The Hangar', entrance: 'heli', spots: [],
      platforms: [{ x: 300, y: G - 200, w: 140 }, { x: 980, y: G - 200, w: 140 }], heart: { x: 980, y: G - 230 }, exit: 'door' },
  ],
  [
    { id: 'fields', name: 'The Fields', entrance: 'rise', spots: [],
      platforms: [{ x: 900, y: G - 180, w: 150 }], heart: { x: 900, y: G - 210 }, exit: 'path' },
    { id: 'farmyard', name: 'The Farmyard', entrance: 'spot', spots: doorRow([260, 1000], 'door'),
      platforms: [{ x: 630, y: G - 185, w: 150 }], heart: { x: 630, y: G - 215 }, exit: 'gate' },
    { id: 'barn', name: 'Inside the Barn', entrance: 'drop',
      spots: [{ x: 240, y: G - 190, kind: 'ledge' }, { x: 1040, y: G - 190, kind: 'ledge' }, { x: 640, y: G - 320, kind: 'ledge' }],
      platforms: [{ x: 240, y: G - 190, w: 170 }, { x: 1040, y: G - 190, w: 170 }, { x: 640, y: G - 320, w: 160 }], heart: { x: 640, y: G - 350 }, exit: 'door' },
    { id: 'square', name: 'Village Square', entrance: 'spot', spots: doorRow([200, 500, 800, 1100], 'door'),
      platforms: [{ x: 650, y: G - 190, w: 140 }], heart: { x: 650, y: G - 220 }, exit: 'path' },
    { id: 'mill', name: 'The Old Mill', entrance: 'rise', spots: [],
      platforms: [{ x: 300, y: G - 190, w: 150 }, { x: 980, y: G - 190, w: 150 }], heart: { x: 300, y: G - 220 }, exit: 'path' },
  ],
  [
    { id: 'pier', name: 'The Pier', entrance: 'rise', spots: [],
      platforms: [{ x: 640, y: G - 185, w: 160 }], heart: { x: 640, y: G - 215 }, exit: 'path' },
    { id: 'deck', name: 'The Main Deck', entrance: 'spot', spots: doorRow([250, 640, 1030], 'barrel'),
      platforms: [{ x: 445, y: G - 190, w: 120 }, { x: 835, y: G - 190, w: 120 }], heart: { x: 835, y: G - 220 }, exit: 'stairs' },
    { id: 'hold', name: 'Below Deck', entrance: 'drop',
      spots: [{ x: 260, y: G - 180, kind: 'ledge' }, { x: 1020, y: G - 180, kind: 'ledge' }, { x: 640, y: G - 310, kind: 'ledge' }],
      platforms: [{ x: 260, y: G - 180, w: 170 }, { x: 1020, y: G - 180, w: 170 }, { x: 640, y: G - 310, w: 150 }], heart: { x: 640, y: G - 340 }, exit: 'stairs' },
    { id: 'rigging', name: 'The Rigging', entrance: 'parachute', spots: [],
      platforms: [{ x: 330, y: G - 190, w: 130 }, { x: 950, y: G - 190, w: 130 }], heart: { x: 950, y: G - 220 }, exit: 'door' },
    { id: 'cabin', name: "The Captain's Cabin", entrance: 'spot', spots: doorRow([640], 'door'),
      platforms: [{ x: 260, y: G - 195, w: 140 }, { x: 1020, y: G - 195, w: 140 }], heart: { x: 1020, y: G - 225 }, exit: 'door' },
  ],
  [
    { id: 'mallDoors', name: 'Mall Entrance', entrance: 'spot', spots: doorRow([330, 950], 'door'),
      platforms: [{ x: 640, y: G - 190, w: 160 }], heart: { x: 640, y: G - 220 }, exit: 'door' },
    { id: 'escalators', name: 'The Escalators', entrance: 'drop',
      spots: [{ x: 280, y: G - 300, kind: 'ledge' }, { x: 1000, y: G - 300, kind: 'ledge' }],
      platforms: [{ x: 280, y: G - 300, w: 200 }, { x: 1000, y: G - 300, w: 200 }, { x: 640, y: G - 170, w: 140 }], heart: { x: 640, y: G - 200 }, exit: 'stairs' },
    { id: 'shops', name: 'The Shops', entrance: 'spot', spots: doorRow([220, 520, 820, 1100], 'door'),
      platforms: [{ x: 670, y: G - 195, w: 130 }], heart: { x: 670, y: G - 225 }, exit: 'path' },
    { id: 'checkout', name: 'The Checkout', entrance: 'spot', spots: doorRow([230, 1050], 'cabinet'),
      platforms: [{ x: 640, y: G - 200, w: 150 }], heart: { x: 640, y: G - 230 }, exit: 'door' },
    { id: 'parking', name: 'The Car Park', entrance: 'rise', spots: [],
      platforms: [{ x: 280, y: G - 185, w: 150 }, { x: 1000, y: G - 185, w: 150 }], heart: { x: 1000, y: G - 215 }, exit: 'path' },
  ],
  [
    { id: 'driveThru', name: 'The Drive-Thru', entrance: 'rise', spots: [],
      platforms: [{ x: 640, y: G - 185, w: 160 }], heart: { x: 640, y: G - 215 }, exit: 'door' },
    { id: 'counter', name: 'The Counter', entrance: 'spot', spots: doorRow([300, 980], 'door'),
      platforms: [{ x: 640, y: G - 200, w: 150 }], heart: { x: 640, y: G - 230 }, exit: 'door' },
    { id: 'kitchen', name: 'The Kitchen', entrance: 'spot', spots: doorRow([220, 1060], 'cabinet'),
      platforms: [{ x: 640, y: G - 190, w: 170 }], heart: { x: 640, y: G - 220 }, exit: 'stairs' },
    { id: 'playground', name: 'The Play Area', entrance: 'drop',
      spots: [{ x: 260, y: G - 260, kind: 'ledge' }, { x: 1020, y: G - 260, kind: 'ledge' }],
      platforms: [{ x: 260, y: G - 260, w: 160 }, { x: 1020, y: G - 260, w: 160 }, { x: 640, y: G - 170, w: 130 }], heart: { x: 640, y: G - 200 }, exit: 'path' },
    { id: 'burgerRoof', name: 'Under the Big Sign', entrance: 'parachute', spots: [],
      platforms: [{ x: 300, y: G - 190, w: 140 }, { x: 980, y: G - 190, w: 140 }], heart: { x: 300, y: G - 220 }, exit: 'path' },
  ],
  [
    { id: 'terminal', name: 'The Terminal', entrance: 'spot', spots: doorRow([330, 950], 'door'),
      platforms: [{ x: 640, y: G - 190, w: 160 }], heart: { x: 640, y: G - 220 }, exit: 'door' },
    { id: 'checkin', name: 'Check-in Desks', entrance: 'spot', spots: doorRow([230, 640, 1050], 'cabinet'),
      platforms: [{ x: 435, y: G - 200, w: 120 }, { x: 845, y: G - 200, w: 120 }], heart: { x: 845, y: G - 230 }, exit: 'path' },
    { id: 'baggage', name: 'Baggage Claim', entrance: 'spot', spots: doorRow([300, 980], 'cave'),
      platforms: [{ x: 640, y: G - 190, w: 160 }], heart: { x: 640, y: G - 220 }, exit: 'door' },
    { id: 'gates', name: 'Departure Gates', entrance: 'spot', spots: doorRow([220, 640, 1060], 'door'),
      platforms: [{ x: 430, y: G - 195, w: 130 }, { x: 850, y: G - 195, w: 130 }], heart: { x: 430, y: G - 225 }, exit: 'door' },
    { id: 'runway', name: 'The Runway', entrance: 'parachute', spots: [],
      platforms: [{ x: 300, y: G - 190, w: 140 }, { x: 980, y: G - 190, w: 140 }], heart: { x: 980, y: G - 230 }, exit: 'path' },
  ],
];


/**
 * Level 0 of every chapter (v4): no zombies, three free perks to choose from – one on the ground,
 * one on a low ledge and one up high (jump from ledge to ledge). Then a portal opens.
 */
const CAMP_PLATFORMS: Platform[] = [{ x: 430, y: G - 170, w: 160 }, { x: 770, y: G - 300, w: 150 }];
export const CAMP_PERK_SPOTS = [{ x: 1000, y: G - 60 }, { x: 430, y: G - 215 }, { x: 770, y: G - 345 }];
export const CAMPS: PlaceDef[] = [
  { id: 'trailhead', name: 'The Trailhead', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'path' },
  { id: 'graveLane', name: 'Cemetery Lane', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'gate' },
  { id: 'castleRoad', name: 'The Castle Road', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'gate' },
  { id: 'stadiumCamp', name: 'Outside the Stadium', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'gate' },
  { id: 'armyCamp', name: 'The Army Road', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'gate' },
  { id: 'villageCamp', name: 'The Village Road', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'path' },
  { id: 'shipCamp', name: 'The Harbour', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'path' },
  { id: 'mallCamp', name: 'The Mall Square', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'door' },
  { id: 'burgerCamp', name: 'The Burger Road', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'door' },
  { id: 'airportCamp', name: 'The Airport Road', entrance: 'none', spots: [], platforms: CAMP_PLATFORMS, exit: 'door' },
];

/** Place of a level; level -1 is the chapter's camp (level 0 in the design). */
export function placeOf(chapter: number, level: number): PlaceDef {
  return level < 0 ? CAMPS[chapter] : PLACES[chapter][level];
}

/** Which chapter a place belongs to (for its accent colour). */
export function chapterOfPlace(id: PlaceId): number {
  for (let c = 0; c < PLACES.length; c++) if (CAMPS[c].id === id || PLACES[c].some((p) => p.id === id)) return c;
  return 0;
}
