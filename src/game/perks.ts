import Phaser from 'phaser';
import { INK } from './constants';

/**
 * Perks (v4): 10 kinds, each with its own slot and key, ordered by power: 1 = weakest … 0 = strongest.
 * A perk is single-use: pressing its key spends one and it works for `durationMs`.
 * See plan/v4.md.
 */
export type PerkId = 'sword' | 'freeze' | 'long' | 'spear' | 'invis' | 'berserk' | 'invinc' | 'ghost' | 'angel' | 'dawn';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** Key shown under the slot ('1'..'9', '0'). */
  key: string;
  durationMs: number;
  blurb: string;
  /** Longer description for the perks screen. */
  info: string;
  /** Weight when a perk drops from a zombie or a secret (weaker ones are more common). */
  weight: number;
}

export const PERK_DEFAULT_DURATION = 10_000;
export const PERK_MAX_STACK = 9;

export const PERKS: PerkDef[] = [
  { id: 'sword', name: 'SHARP BLADE', key: '1', durationMs: PERK_DEFAULT_DURATION, weight: 3, blurb: 'Your weapon hits harder', info: "Your weapon hits 1.6× harder. The swing leaves a coloured trail." },
  { id: 'freeze', name: 'FREEZE', key: '2', durationMs: PERK_DEFAULT_DURATION, weight: 3, blurb: 'Zombies you hit freeze', info: "Every zombie you hit freezes to the ground for 1.5 s and can't attack." },
  { id: 'long', name: 'LONG SWORD', key: '3', durationMs: PERK_DEFAULT_DURATION, weight: 3, blurb: 'Longer weapon, bigger knockback', info: "Weapon 1.5× longer: reaches further, hits harder, throws zombies far back." },
  { id: 'spear', name: 'SPEAR', key: '4', durationMs: PERK_DEFAULT_DURATION, weight: 3, blurb: 'W / S throw spears that pierce', info: "W / S throw spears instead of swinging. A spear flies through every zombie in a row." },
  { id: 'invis', name: 'INVISIBLE', key: '5', durationMs: PERK_DEFAULT_DURATION, weight: 3, blurb: 'Zombies can\'t see you', info: "Zombies stop looking for you and wander. One you hit swings back the way the hit came." },
  { id: 'berserk', name: 'BERSERK', key: '6', durationMs: PERK_DEFAULT_DURATION, weight: 2, blurb: 'Wild whirl, 5x faster hits', info: "You whirl your weapon both ways, 5× faster. Hits still hurt, but nothing stops the whirl." },
  { id: 'invinc', name: 'COCOON', key: '7', durationMs: PERK_DEFAULT_DURATION, weight: 2, blurb: 'Nothing can hurt you', info: "An unbreakable cocoon around you: nothing can hurt you." },
  { id: 'ghost', name: 'GHOST', key: '8', durationMs: PERK_DEFAULT_DURATION, weight: 2, blurb: 'Fly through walls and zombies', info: "Smaller and flying (↑ / ↓) through ledges and zombies. Your hits do double damage." },
  { id: 'angel', name: 'ANGEL', key: '9', durationMs: 12_000, weight: 2, blurb: 'An angel fights for you', info: "An angel flies down and strikes the zombies nearest to you." },
  { id: 'dawn', name: 'DAWN', key: '0', durationMs: 8_000, weight: 1, blurb: 'All zombies turn to dust', info: "The sun rises: every zombie turns to dust, and new ones too." },
];

export const PERK_INDEX: Record<PerkId, number> = Object.fromEntries(PERKS.map((p, i) => [p.id, i])) as Record<PerkId, number>;

/** Random perk by weight. `freeOnly` = only the first five (the free pick at the start of a chapter). */
export function randomPerk(freeOnly = false, rand: () => number = Math.random): PerkId {
  const pool = freeOnly ? PERKS.slice(0, 5) : PERKS;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rand() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.id;
  }
  return pool[pool.length - 1].id;
}

/** Three different random perks out of the first five. */
export function freeChoice(): PerkId[] {
  return Phaser.Utils.Array.Shuffle(PERKS.slice(0, 5).map((p) => p.id)).slice(0, 3);
}

type G = Phaser.GameObjects.Graphics;

/** Ink icon of a perk, centred at (x, y), fitting a circle of radius r. `accent` colours a small detail. */
export function drawPerkIcon(g: G, id: PerkId, x: number, y: number, r: number, accent: number, ink = INK, alpha = 1) {
  const s = r / 20;
  const L = (x1: number, y1: number, x2: number, y2: number, w = 3, c = ink) => {
    g.lineStyle(w * s, c, alpha);
    g.lineBetween(x + x1 * s, y + y1 * s, x + x2 * s, y + y2 * s);
  };
  switch (id) {
    case 'sword': {
      L(-9, 9, 9, -9, 3.5);
      L(-11, 3, -3, 11, 3);
      L(-13, 13, -8, 8, 4);
      // accent sparkle at the tip
      L(8, -14, 8, -6, 2, accent);
      L(4, -10, 12, -10, 2, accent);
      break;
    }
    case 'freeze': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        const dx = Math.cos(a) * 13, dy = Math.sin(a) * 13;
        L(-dx, -dy, dx, dy, 3);
        for (const k of [-1, 1]) {
          const ex = dx * k, ey = dy * k;
          const px = -Math.sin(a) * 4, py = Math.cos(a) * 4;
          L(ex * 0.65 + px, ey * 0.65 + py, ex, ey, 2);
          L(ex * 0.65 - px, ey * 0.65 - py, ex, ey, 2);
        }
      }
      g.fillStyle(accent, alpha);
      g.fillCircle(x, y, 3.2 * s);
      break;
    }
    case 'long': {
      L(-14, 6, 14, 6, 3.5);
      L(-14, 1, -14, 11, 3);
      L(-17, 6, -14, 6, 4);
      // stretch arrows
      L(-12, -6, 12, -6, 2, accent);
      L(12, -6, 8, -10, 2, accent);
      L(12, -6, 8, -2, 2, accent);
      L(-12, -6, -8, -10, 2, accent);
      L(-12, -6, -8, -2, 2, accent);
      break;
    }
    case 'spear': {
      L(-14, 12, 10, -8, 3);
      g.fillStyle(ink, alpha);
      g.fillTriangle(x + 15 * s, y - 13 * s, x + 6 * s, y - 9 * s, x + 11 * s, y - 4 * s);
      L(-16, 4, -6, 4, 2, accent);
      L(-12, 14, -4, 14, 2, accent);
      break;
    }
    case 'invis': {
      // dashed eye
      g.lineStyle(2.5 * s, ink, alpha);
      for (let i = 0; i < 10; i++) {
        if (i % 2) continue;
        const a0 = Math.PI + (i / 10) * Math.PI, a1 = Math.PI + ((i + 1) / 10) * Math.PI;
        g.beginPath();
        g.arc(x, y + 8 * s, 15 * s, a0, a1, false);
        g.strokePath();
        g.beginPath();
        g.arc(x, y - 8 * s, 15 * s, a0 - Math.PI, a1 - Math.PI, false);
        g.strokePath();
      }
      g.fillStyle(accent, alpha);
      g.fillCircle(x, y, 4.5 * s);
      break;
    }
    case 'berserk': {
      L(-12, -12, 12, 12, 3);
      L(12, -12, -12, 12, 3);
      g.lineStyle(2 * s, accent, alpha);
      g.beginPath();
      g.arc(x, y, 16 * s, -0.4, 1.6, false);
      g.strokePath();
      g.beginPath();
      g.arc(x, y, 16 * s, 2.7, 4.7, false);
      g.strokePath();
      break;
    }
    case 'invinc': {
      g.lineStyle(3 * s, ink, alpha);
      g.strokeEllipse(x, y, 22 * s, 32 * s);
      g.lineStyle(2 * s, accent, alpha);
      g.strokeEllipse(x, y, 14 * s, 24 * s);
      g.fillStyle(ink, alpha);
      g.fillCircle(x, y - 5 * s, 3 * s);
      L(0, -2, 0, 7, 2.5);
      break;
    }
    case 'ghost': {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        pts.push({ x: x + Math.cos(a) * 11 * s, y: y - 2 * s + Math.sin(a) * 11 * s });
      }
      pts.push({ x: x + 11 * s, y: y + 13 * s }, { x: x + 6 * s, y: y + 9 * s }, { x: x + 2 * s, y: y + 14 * s }, { x: x - 3 * s, y: y + 9 * s }, { x: x - 7 * s, y: y + 14 * s }, { x: x - 11 * s, y: y + 10 * s });
      g.fillStyle(accent, alpha * 0.35);
      g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
      g.lineStyle(2.5 * s, ink, alpha);
      g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
      g.fillStyle(ink, alpha);
      g.fillCircle(x - 4 * s, y - 3 * s, 2 * s);
      g.fillCircle(x + 4 * s, y - 3 * s, 2 * s);
      break;
    }
    case 'angel': {
      g.lineStyle(2.5 * s, accent, alpha);
      g.strokeEllipse(x, y - 13 * s, 14 * s, 5 * s);
      g.fillStyle(ink, alpha);
      g.fillCircle(x, y - 4 * s, 4 * s);
      L(0, 0, 0, 13, 3);
      // wings
      g.lineStyle(2.5 * s, ink, alpha);
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(x + k * 2 * s, y + 2 * s);
        g.lineTo(x + k * 16 * s, y - 8 * s);
        g.lineTo(x + k * 13 * s, y + 2 * s);
        g.lineTo(x + k * 15 * s, y + 6 * s);
        g.lineTo(x + k * 3 * s, y + 7 * s);
        g.strokePath();
      }
      break;
    }
    case 'dawn': {
      g.fillStyle(accent, alpha);
      g.slice(x, y + 6 * s, 9 * s, Math.PI, 0, false);
      g.fillPath();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        L(Math.cos(a) * 12, 6 + Math.sin(a) * 12, Math.cos(a) * 17, 6 + Math.sin(a) * 17, 2.5);
      }
      L(-16, 8, 16, 8, 3);
      L(-10, 13, 10, 13, 2);
      break;
    }
  }
}
