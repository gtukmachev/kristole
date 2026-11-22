import type { WeaponId } from './storage';

export type BackgroundId = 'cliff' | 'graveyard' | 'castle';

export interface ChapterDef {
  title: string;
  name: string;
  bg: BackgroundId;
  levels: number;
}

export const CHAPTERS: ChapterDef[] = [
  { title: 'CHAPTER ONE', name: 'The Cliff', bg: 'cliff', levels: 5 },
  { title: 'CHAPTER TWO', name: 'The Graveyard', bg: 'graveyard', levels: 5 },
  { title: 'CHAPTER THREE', name: 'The Castle', bg: 'castle', levels: 5 },
];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Reach of the hit zone in front of the player's body centre, px. */
  range: number;
  damage: number;
  /** Total swing duration, ms. */
  swingMs: number;
  /** Fraction of the swing during which it can hit. */
  activeFrom: number;
  activeTo: number;
  knockback: number;
  blurb: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'SWORD',
    range: 118,
    damage: 20,
    swingMs: 300,
    activeFrom: 0.3,
    activeTo: 0.75,
    knockback: 160,
    blurb: 'Big attack range,\ndoes less damage',
  },
  axe: {
    id: 'axe',
    name: 'AXE',
    range: 80,
    damage: 40,
    swingMs: 420,
    activeFrom: 0.4,
    activeTo: 0.8,
    knockback: 260,
    blurb: 'Smaller attack range,\nmore damage',
  },
};

export type ZombieSize = 'small' | 'medium' | 'big' | 'giant';

export interface ZombieDef {
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  points: number;
  /** Distance (from body centre to player body centre) at which it starts an attack. */
  reach: number;
  windupMs: number;
  /** Attack band relative to ground, px above the ground (top, bottom). */
  attackBand: [number, number];
  /** Doesn't flinch from low hits. */
  heavy: boolean;
}

/**
 * Attack bands are what makes the controls matter:
 *  - small zombies bite low  -> jump over the bite
 *  - medium / big / giant zombies swing high -> duck under it (hold ↓)
 * Player hurtbox: standing 110px tall, crouching 62px.
 */
export const ZOMBIES: Record<ZombieSize, ZombieDef> = {
  small: { scale: 0.62, hp: 30, speed: 115, damage: 8, points: 50, reach: 62, windupMs: 420, attackBand: [42, 0], heavy: false },
  medium: { scale: 1.0, hp: 60, speed: 72, damage: 12, points: 100, reach: 78, windupMs: 560, attackBand: [104, 72], heavy: false },
  big: { scale: 1.4, hp: 140, speed: 48, damage: 22, points: 250, reach: 96, windupMs: 720, attackBand: [150, 74], heavy: true },
  giant: { scale: 1.95, hp: 420, speed: 40, damage: 30, points: 1000, reach: 120, windupMs: 800, attackBand: [190, 76], heavy: true },
};

export interface WaveDef {
  zombies: ZombieSize[];
  maxAlive: number;
  spawnGapMs: number;
}

export interface LevelDef {
  waves: WaveDef[];
  /** Multiplier for zombie HP / damage / speed. */
  strength: number;
}

/** Deterministic pseudo-random so a level is the same every time it is played. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function buildLevel(chapter: number, level: number): LevelDef {
  const ch = CHAPTERS[chapter];
  const n = chapter * 5 + level; // overall difficulty step 0..14
  const rand = rng(1000 + n * 97);
  const waveCount = 2 + Math.floor(level / 2);
  const waves: WaveDef[] = [];
  for (let w = 0; w < waveCount; w++) {
    const count = 3 + n + w;
    const pBig = Math.min(0.35, 0.02 + n * 0.025 + w * 0.02);
    const pSmall = 0.3;
    const zombies: ZombieSize[] = [];
    for (let i = 0; i < count; i++) {
      const r = rand();
      zombies.push(r < pBig ? 'big' : r < pBig + pSmall ? 'small' : 'medium');
    }
    // The very first wave of the game stays gentle.
    if (n === 0 && w === 0) zombies.fill('medium').splice(1, 1, 'small');
    const isFinal = level === ch.levels - 1 && w === waveCount - 1;
    if (isFinal) zombies.push('giant');
    waves.push({
      zombies,
      maxAlive: Math.min(3 + Math.floor(n / 2), 9),
      spawnGapMs: Math.max(1500 - n * 60, 650),
    });
  }
  return { waves, strength: 1 + n * 0.12 };
}
