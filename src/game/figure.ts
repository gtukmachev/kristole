import Phaser from 'phaser';
import { INK, INK_SOFT } from './constants';
import type { Headgear, WeaponId } from './storage';

/**
 * Procedural stick-figure animation.
 *
 * Every figure is a tiny skeleton described by joint angles (a Pose). Angles are in
 * radians, 0 = bone pointing straight down, positive = rotated towards the side the
 * figure faces, PI = straight up. Poses are blended over time, and the figure is
 * redrawn every frame with Phaser Graphics, so animation is smooth at any size and
 * zombies of different sizes are just the same skeleton with a different scale.
 */
export interface Pose {
  lean: number;
  head: number;
  fThigh: number;
  fShin: number;
  bThigh: number;
  bShin: number;
  fUpper: number;
  fFore: number;
  bUpper: number;
  bFore: number;
  weapon: number;
  /** Whole-body rotation around the feet; positive = falls forward. */
  rot: number;
  /** Lifts the body (px at scale 1). */
  lift: number;
}

export const BONES = {
  thigh: 27,
  shin: 27,
  torso: 34,
  neck: 4,
  headR: 10,
  upper: 21,
  fore: 20,
};

export const POSE_ZERO: Pose = {
  lean: 0, head: 0,
  fThigh: 0, fShin: 0, bThigh: 0, bShin: 0,
  fUpper: 0, fFore: 0, bUpper: 0, bFore: 0,
  weapon: 0, rot: 0, lift: 0,
};

export function pose(p: Partial<Pose>): Pose {
  return { ...POSE_ZERO, ...p };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const k = Phaser.Math.Clamp(t, 0, 1);
  const out = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) {
    out[key] = a[key] + (b[key] - a[key]) * k;
  }
  return out;
}

export const ease = {
  out: (t: number) => 1 - (1 - t) * (1 - t),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in: (t: number) => t * t,
};

export type ZombieVariant = 'plain' | 'bandage' | 'tophat' | 'helmet'
  // v5 chapters
  | 'football' | 'basket' | 'badminton' | 'soldier' | 'farmer' | 'farmerHat' | 'pirate' | 'cashier' | 'cook' | 'pilot';

export interface FigureStyle {
  kind: 'player' | 'zombie';
  weapon?: WeaponId | null;
  headgear?: Headgear;
  /** Seconds, for little idle wiggles (headband tails, etc.). */
  time?: number;
  /** Horizontal velocity, to make cloth trail. */
  vx?: number;
  /** 0..1 – how much of the figure is drawn faded (used for dying zombies). */
  alpha?: number;
  /** Draw thicker/darker outline when flashing after a hit. */
  flash?: boolean;
  /** Each zombie gets a little personality from its seed. */
  seed?: number;
  /** Head already knocked off. */
  headless?: boolean;
  /** Zombie look: accessories differ per chapter. */
  variant?: ZombieVariant;
  /** 0..1 – the weapon folds telescopically (used when the shield comes out). */
  weaponScale?: number;
  /** Colour overrides (default: black ink on paper). */
  ink?: number;
  fill?: number;
}

// Active colours for the figure being drawn (set per drawFigure call).
let C_INK = INK;
let C_BACK = INK_SOFT;
let C_FILL = 0xf7f7f2;

export interface FigurePoints {
  hip: Phaser.Types.Math.Vector2Like;
  shoulder: Phaser.Types.Math.Vector2Like;
  head: Phaser.Types.Math.Vector2Like;
  hand: Phaser.Types.Math.Vector2Like;
  tip: Phaser.Types.Math.Vector2Like;
  headR: number;
}

type V = { x: number; y: number };
const P = (pts: V[]) => pts as unknown as Phaser.Math.Vector2[];

const dir = (a: number, len: number): V => ({ x: Math.sin(a) * len, y: Math.cos(a) * len });
const add = (p: V, q: V): V => ({ x: p.x + q.x, y: p.y + q.y });

export const WEAPON_LEN: Record<WeaponId, number> = { sword: 66, axe: 58 };

/** Height of the hip above the feet for a pose (scale 1). */
export function hipHeight(p: Pose) {
  const f = Math.cos(p.fThigh) * BONES.thigh + Math.cos(p.fShin) * BONES.shin;
  const b = Math.cos(p.bThigh) * BONES.thigh + Math.cos(p.bShin) * BONES.shin;
  return Math.max(f, b, 8) + p.lift;
}

/**
 * Draws the figure standing on (x, y) – y is the ground line under its feet.
 * Returns key points in world space (useful for blood, weapon trails, flying heads).
 */
export function drawFigure(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  facing: number,
  scale: number,
  p: Pose,
  style: FigureStyle,
): FigurePoints {
  C_INK = style.ink ?? INK;
  C_FILL = style.fill ?? 0xf7f7f2;
  C_BACK = style.ink !== undefined ? style.ink : INK_SOFT;
  const hipH = hipHeight(p);
  const hip: V = { x: 0, y: -hipH };
  const fKnee = add(hip, dir(p.fThigh, BONES.thigh));
  const fFoot = add(fKnee, dir(p.fShin, BONES.shin));
  const bKnee = add(hip, dir(p.bThigh, BONES.thigh));
  const bFoot = add(bKnee, dir(p.bShin, BONES.shin));
  const shoulder: V = add(hip, { x: Math.sin(p.lean) * BONES.torso, y: -Math.cos(p.lean) * BONES.torso });
  const ha = p.lean + p.head;
  const neckTop = add(shoulder, { x: Math.sin(ha) * BONES.neck, y: -Math.cos(ha) * BONES.neck });
  const head = add(neckTop, { x: Math.sin(ha) * BONES.headR, y: -Math.cos(ha) * BONES.headR });
  const fElbow = add(shoulder, dir(p.fUpper, BONES.upper));
  const fHand = add(fElbow, dir(p.fFore, BONES.fore));
  const bElbow = add(shoulder, dir(p.bUpper, BONES.upper));
  const bHand = add(bElbow, dir(p.bFore, BONES.fore));
  const wLen = style.weapon ? WEAPON_LEN[style.weapon] * (style.weaponScale ?? 1) : 0;

  const cr = Math.cos(p.rot);
  const sr = Math.sin(p.rot);
  const T = (v: V): V => {
    const rx = v.x * cr - v.y * sr;
    const ry = v.x * sr + v.y * cr;
    return { x: x + facing * rx * scale, y: y + ry * scale };
  };
  /** Rotates a local angle into world space as a direction vector. */
  const worldDir = (a: number, len: number): V => {
    const d = dir(a, len);
    const rx = d.x * cr - d.y * sr;
    const ry = d.x * sr + d.y * cr;
    return { x: facing * rx * scale, y: ry * scale };
  };

  const alpha = style.alpha ?? 1;
  const isZombie = style.kind === 'zombie';
  const base = (isZombie ? 3.6 : 5) * scale * (style.flash ? 1.5 : 1);
  const line = (w: number, c: number, a: V, b: V) => {
    g.lineStyle(w, c, alpha);
    g.lineBetween(a.x, a.y, b.x, b.y);
  };
  const limb = (w: number, c: number, a: V, b: V, d: V) => {
    g.lineStyle(w, c, alpha);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(d.x, d.y);
    g.strokePath();
  };

  const H = T(hip), S = T(shoulder), HD = T(head);
  const back = isZombie ? C_BACK : 0x333333;

  // Back limbs (slightly lighter so the figure reads with depth).
  limb(base, back, S, T(bElbow), T(bHand));
  limb(base, back, H, T(bKnee), T(bFoot));

  // Torso.
  if (isZombie) {
    drawZombieTorso(g, H, S, scale, alpha, style.seed ?? 0);
  } else {
    line(base * 1.45, C_INK, H, S);
  }

  // Front leg.
  limb(base, C_INK, H, T(fKnee), T(fFoot));
  if (!isZombie) {
    // little boots
    const ff = T(fFoot), bf = T(bFoot);
    g.fillStyle(C_INK, alpha);
    g.fillEllipse(ff.x + facing * 3 * scale, ff.y - 1 * scale, 11 * scale, 6 * scale);
    g.fillStyle(back, alpha);
    g.fillEllipse(bf.x + facing * 3 * scale, bf.y - 1 * scale, 11 * scale, 6 * scale);
  }

  // Neck + head.
  const headR = BONES.headR * scale;
  if (!style.headless) {
    line(base, C_INK, S, T(neckTop));
    if (isZombie) {
      drawZombieHead(g, HD, headR, facing, alpha, style.seed ?? 0, base);
      drawZombieVariant(g, HD, headR, facing, alpha, style.variant ?? 'plain', base);
    } else {
      g.fillStyle(C_INK, alpha);
      g.fillCircle(HD.x, HD.y, headR);
      drawHeadgear(g, HD, headR, facing, alpha, style);
    }
  } else {
    // stump
    line(base * 1.2, C_INK, S, T(neckTop));
  }

  // Front arm + weapon.
  const FH = T(fHand);
  limb(base, C_INK, S, T(fElbow), FH);
  let tipW = FH;
  if (style.weapon) {
    const d = worldDir(p.weapon, 1);
    tipW = { x: FH.x + d.x * wLen, y: FH.y + d.y * wLen };
    const ws = style.weaponScale ?? 1;
    if (ws > 0.06) drawWeapon(g, style.weapon, FH, d, scale, alpha * Math.min(1, ws * 2), INK, 0xffffff, ws);
  }
  if (isZombie) {
    // claw fingers
    const fd = worldDir(p.fFore, 1);
    const bd = worldDir(p.bFore, 1);
    for (const [h, d, c] of [[FH, fd, C_INK], [T(bHand), bd, back]] as [V, V, number][]) {
      for (const off of [-0.5, 0, 0.5]) {
        const ang = Math.atan2(d.y, d.x) + off;
        const l = 6 * scale;
        line(base * 0.6, c, h, { x: h.x + Math.cos(ang) * l, y: h.y + Math.sin(ang) * l });
      }
    }
  }

  if (isZombie) drawZombieExtras(g, { H, S, HD, FH, ff: T(fFoot), bf: T(bFoot) }, scale, facing, alpha, style.variant ?? 'plain', base);
  return { hip: H, shoulder: S, head: HD, hand: FH, tip: tipW, headR };
}

/** Body things of the v5 zombies: jerseys, aprons, ties, boots, rackets. */
function drawZombieExtras(
  g: Phaser.GameObjects.Graphics, p: { H: V; S: V; HD: V; FH: V; ff: V; bf: V }, scale: number, facing: number, alpha: number, v: ZombieVariant, base: number,
) {
  const { H, S } = p;
  const lw = Math.max(1.5, base * 0.6);
  const along = (k: number): V => ({ x: S.x + (H.x - S.x) * k, y: S.y + (H.y - S.y) * k });
  switch (v) {
    case 'football': {
      // white number patch on the chest: a big "9"
      const c = along(0.38);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(c.x, c.y, 7 * scale);
      g.lineStyle(lw, C_INK, alpha);
      g.strokeCircle(c.x, c.y - 1.5 * scale, 2.4 * scale);
      g.lineBetween(c.x + 2.4 * scale, c.y - 1.5 * scale, c.x + 1 * scale, c.y + 4.5 * scale);
      break;
    }
    case 'badminton': {
      // racket in the front hand
      const h = p.FH;
      const tipX = h.x + facing * 6 * scale, tipY = h.y - 22 * scale;
      g.lineStyle(lw, C_INK, alpha);
      g.lineBetween(h.x, h.y, tipX, tipY);
      g.fillStyle(0xffffff, alpha * 0.9);
      g.fillEllipse(tipX + facing * 2 * scale, tipY - 8 * scale, 12 * scale, 17 * scale);
      g.strokeEllipse(tipX + facing * 2 * scale, tipY - 8 * scale, 12 * scale, 17 * scale);
      g.lineStyle(Math.max(0.8, lw * 0.4), C_INK, alpha * 0.7);
      for (const k of [-0.25, 0, 0.25]) {
        g.lineBetween(tipX + facing * 2 * scale + k * 12 * scale, tipY - 15 * scale, tipX + facing * 2 * scale + k * 12 * scale, tipY - 1 * scale);
        g.lineBetween(tipX + facing * 2 * scale - 5 * scale, tipY - 8 * scale + k * 17 * scale, tipX + facing * 2 * scale + 5 * scale, tipY - 8 * scale + k * 17 * scale);
      }
      break;
    }
    case 'farmer':
    case 'farmerHat': {
      // rubber boots
      g.fillStyle(C_INK, alpha);
      for (const f of [p.ff, p.bf]) {
        g.fillRect(f.x - 4 * scale, f.y - 12 * scale, 8 * scale, 12 * scale);
        g.fillEllipse(f.x + facing * 3 * scale, f.y - 1.5 * scale, 13 * scale, 6 * scale);
      }
      break;
    }
    case 'cashier': {
      // name badge
      const c = along(0.3);
      g.fillStyle(0xffffff, alpha);
      g.fillRect(c.x + facing * 2 * scale - 4 * scale, c.y - 3 * scale, 8 * scale, 5 * scale);
      g.lineStyle(lw * 0.7, C_INK, alpha);
      g.strokeRect(c.x + facing * 2 * scale - 4 * scale, c.y - 3 * scale, 8 * scale, 5 * scale);
      break;
    }
    case 'cook': {
      // apron from the chest down over the hips
      const a = along(0.25), b = along(1.0);
      const w1 = 7 * scale, w2 = 11 * scale;
      const pts = [
        { x: a.x - w1, y: a.y }, { x: a.x + w1, y: a.y }, { x: b.x + w2, y: b.y + 14 * scale }, { x: b.x - w2, y: b.y + 14 * scale },
      ];
      g.fillStyle(0xffffff, alpha);
      g.fillPoints(P(pts), true);
      g.lineStyle(lw, C_INK, alpha);
      g.strokePoints(P(pts), true);
      g.lineBetween(a.x - w1, a.y, S.x - 3 * scale, S.y - 2 * scale);
      break;
    }
    case 'pilot': {
      // tie
      const a = along(0.05), b = along(0.55);
      g.fillStyle(C_INK, alpha);
      g.fillTriangle(a.x - 2.5 * scale, a.y, a.x + 2.5 * scale, a.y, b.x, b.y);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(a.x, a.y + 1, 1.6 * scale);
      break;
    }
    default:
      break;
  }
}

function drawZombieTorso(g: Phaser.GameObjects.Graphics, H: V, S: V, scale: number, alpha: number, seed: number) {
  // Striped prison-like shirt, as in Leo's sketch.
  const dx = S.x - H.x, dy = S.y - H.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const wTop = 9 * scale, wBot = 7 * scale;
  const pts = [
    { x: S.x + nx * wTop, y: S.y + ny * wTop },
    { x: S.x - nx * wTop, y: S.y - ny * wTop },
    { x: H.x - nx * wBot, y: H.y - ny * wBot },
    { x: H.x + nx * wBot, y: H.y + ny * wBot },
  ];
  g.fillStyle(C_FILL, alpha);
  g.fillPoints(P(pts), true);
  g.lineStyle(2.4 * scale, C_INK, alpha);
  g.strokePoints(P(pts), true);
  const stripes = 4;
  for (let i = 1; i <= stripes; i++) {
    const t = i / (stripes + 1);
    const w = wTop + (wBot - wTop) * (1 - t) * 0 + (wBot - wTop) * t;
    const cx = S.x + (H.x - S.x) * t, cy = S.y + (H.y - S.y) * t;
    const wobble = ((seed * (i + 3)) % 5) * 0.4 - 0.8;
    g.lineBetween(cx + nx * w, cy + ny * w + wobble, cx - nx * w, cy - ny * w - wobble);
  }
  // torn hem
  g.lineStyle(1.6 * scale, C_INK, alpha);
  const a = pts[2], b = pts[3];
  g.beginPath();
  g.moveTo(a.x, a.y);
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t + (i % 2 ? 4 : 0) * scale;
    g.lineTo(px, py);
  }
  g.strokePath();
}

function drawZombieVariant(g: Phaser.GameObjects.Graphics, c: V, r: number, facing: number, alpha: number, v: ZombieVariant, base: number) {
  switch (v) {
    case 'bandage': {
      g.lineStyle(r * 0.32, C_INK, alpha);
      g.lineBetween(c.x - r * 0.9, c.y - r * 0.55, c.x + r * 0.95, c.y + r * 0.05);
      g.lineStyle(r * 0.18, C_FILL, alpha);
      g.lineBetween(c.x - r * 0.8, c.y - r * 0.5, c.x + r * 0.85, c.y + r * 0.03);
      break;
    }
    case 'tophat': {
      const tilt = facing * 0.15;
      g.fillStyle(C_INK, alpha);
      g.fillRect(c.x - r * 0.75 + tilt * r, c.y - r * 2.1, r * 1.5, r * 1.3);
      g.lineStyle(Math.max(2, base * 0.8), C_INK, alpha);
      g.lineBetween(c.x - r * 1.3, c.y - r * 0.8, c.x + r * 1.3, c.y - r * 0.8);
      break;
    }
    case 'helmet': {
      // dome over the top half of the head + brim, eye slit left open
      const dome: V[] = [];
      const R = r * 1.2;
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI + (Math.PI * k) / 12;
        dome.push({ x: c.x + Math.cos(a) * R, y: c.y - r * 0.15 + Math.sin(a) * R });
      }
      g.fillStyle(C_INK, alpha);
      g.fillPoints(P(dome), true);
      g.fillRect(c.x - R, c.y - r * 0.2, R * 2, r * 0.32);
      // plume
      g.lineStyle(Math.max(2, base * 0.8), C_INK, alpha);
      g.lineBetween(c.x, c.y - r * 1.3, c.x - facing * r * 1.1, c.y - r * 2.0);
      g.lineBetween(c.x - facing * r * 0.3, c.y - r * 1.3, c.x - facing * r * 1.3, c.y - r * 1.7);
      break;
    }
    case 'basket': {
      // sweatband
      g.lineStyle(r * 0.4, C_INK, alpha);
      g.lineBetween(c.x - r * 0.98, c.y - r * 0.45, c.x + r * 0.98, c.y - r * 0.45);
      g.lineStyle(r * 0.12, 0xffffff, alpha);
      g.lineBetween(c.x - r * 0.9, c.y - r * 0.45, c.x + r * 0.9, c.y - r * 0.45);
      break;
    }
    case 'football': {
      // spiky hair
      g.lineStyle(Math.max(1.5, base * 0.6), C_INK, alpha);
      for (let k = -2; k <= 2; k++) g.lineBetween(c.x + k * r * 0.35, c.y - r * 0.9, c.x + k * r * 0.45 - facing * r * 0.2, c.y - r * 1.45);
      break;
    }
    case 'badminton': {
      // visor
      g.lineStyle(r * 0.3, C_INK, alpha);
      g.lineBetween(c.x - facing * r * 0.95, c.y - r * 0.55, c.x + facing * r * 0.8, c.y - r * 0.55);
      g.fillStyle(C_INK, alpha);
      g.fillTriangle(c.x + facing * r * 0.6, c.y - r * 0.7, c.x + facing * r * 1.7, c.y - r * 0.45, c.x + facing * r * 0.6, c.y - r * 0.35);
      break;
    }
    case 'soldier': {
      // army helmet: dome with a rim and a chin strap, a few camo spots
      const dome: V[] = [];
      const R = r * 1.25;
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI + (Math.PI * k) / 12;
        dome.push({ x: c.x + Math.cos(a) * R, y: c.y - r * 0.2 + Math.sin(a) * R * 0.95 });
      }
      g.fillStyle(C_INK, alpha);
      g.fillPoints(P(dome), true);
      g.fillRect(c.x - R * 1.12, c.y - r * 0.3, R * 2.24, r * 0.26);
      g.fillStyle(C_FILL, alpha * 0.8);
      g.fillCircle(c.x - r * 0.4, c.y - r * 0.9, r * 0.2);
      g.fillCircle(c.x + r * 0.35, c.y - r * 1.1, r * 0.15);
      g.lineStyle(Math.max(1, base * 0.3), C_INK, alpha);
      g.lineBetween(c.x - facing * r * 0.7, c.y - r * 0.1, c.x + facing * r * 0.1, c.y + r * 0.95);
      break;
    }
    case 'farmer':
    case 'farmerHat': {
      // scruffy beard round the chin
      const beard: V[] = [];
      for (let k = 0; k <= 10; k++) {
        const a = 0.15 + (Math.PI - 0.3) * (k / 10);
        const rr = r * (k % 2 ? 1.25 : 1.45);
        beard.push({ x: c.x + facing * Math.cos(a) * r * 0.2 + Math.cos(a) * rr * 0.9, y: c.y + r * 0.1 + Math.sin(a) * rr * 0.75 });
      }
      g.fillStyle(C_INK, alpha);
      g.fillPoints(P(beard), true);
      if (v === 'farmerHat') {
        // straw hat
        g.fillStyle(0xf2e6c4, alpha);
        g.fillEllipse(c.x, c.y - r * 0.75, r * 3.2, r * 0.8);
        g.lineStyle(Math.max(1.5, base * 0.6), C_INK, alpha);
        g.strokeEllipse(c.x, c.y - r * 0.75, r * 3.2, r * 0.8);
        g.fillStyle(0xf2e6c4, alpha);
        g.fillRect(c.x - r * 0.75, c.y - r * 1.65, r * 1.5, r * 0.9);
        g.strokeRect(c.x - r * 0.75, c.y - r * 1.65, r * 1.5, r * 0.9);
      }
      break;
    }
    case 'pirate': {
      // bandana with a knot behind, eye patch with a strap
      const cap: V[] = [];
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI + (Math.PI * k) / 10;
        cap.push({ x: c.x + Math.cos(a) * r * 1.08, y: c.y - r * 0.2 + Math.sin(a) * r * 1.0 });
      }
      g.fillStyle(C_INK, alpha);
      g.fillPoints(P(cap), true);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(c.x - r * 0.3, c.y - r * 0.75, r * 0.13);
      g.fillCircle(c.x + r * 0.35, c.y - r * 0.6, r * 0.13);
      g.fillStyle(C_INK, alpha);
      g.fillTriangle(c.x - facing * r * 0.9, c.y - r * 0.4, c.x - facing * r * 1.9, c.y - r * 0.1, c.x - facing * r * 1.5, c.y + r * 0.4);
      g.fillCircle(c.x + facing * r * 0.45, c.y - r * 0.1, r * 0.32);
      g.lineStyle(Math.max(1, base * 0.35), C_INK, alpha);
      g.lineBetween(c.x + facing * r * 0.45, c.y - r * 0.1, c.x - facing * r * 0.9, c.y - r * 0.55);
      break;
    }
    case 'cashier': {
      // cashier's cap with a flap over the back of the head
      const R = r * 1.1;
      const cap: V[] = [];
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI + (Math.PI * k) / 10;
        cap.push({ x: c.x + Math.cos(a) * R, y: c.y - r * 0.25 + Math.sin(a) * R * 0.85 });
      }
      cap.push({ x: c.x - facing * R, y: c.y + r * 0.6 }, { x: c.x - facing * R * 0.55, y: c.y + r * 0.6 });
      g.fillStyle(0xffffff, alpha);
      g.fillPoints(P(cap), true);
      g.lineStyle(Math.max(1.5, base * 0.6), C_INK, alpha);
      g.strokePoints(P(cap), true);
      g.lineBetween(c.x - R, c.y - r * 0.3, c.x + R, c.y - r * 0.3);
      break;
    }
    case 'cook': {
      // tall paper hat
      g.fillStyle(0xffffff, alpha);
      g.fillRect(c.x - r * 0.8, c.y - r * 2.1, r * 1.6, r * 1.3);
      g.fillCircle(c.x - r * 0.4, c.y - r * 2.1, r * 0.5);
      g.fillCircle(c.x + r * 0.4, c.y - r * 2.1, r * 0.5);
      g.lineStyle(Math.max(1.5, base * 0.6), C_INK, alpha);
      g.strokeRect(c.x - r * 0.8, c.y - r * 2.0, r * 1.6, r * 1.2);
      g.lineBetween(c.x - r * 0.85, c.y - r * 1.05, c.x + r * 0.85, c.y - r * 1.05);
      break;
    }
    case 'pilot': {
      // pilot's cap: flat top, black peak, white badge
      g.fillStyle(C_INK, alpha);
      g.fillEllipse(c.x - facing * r * 0.1, c.y - r * 1.15, r * 2.5, r * 0.7);
      g.fillRect(c.x - r * 0.95, c.y - r * 1.15, r * 1.9, r * 0.6);
      g.fillTriangle(c.x + facing * r * 0.2, c.y - r * 0.6, c.x + facing * r * 1.6, c.y - r * 0.45, c.x + facing * r * 0.2, c.y - r * 0.35);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(c.x + facing * r * 0.25, c.y - r * 0.9, r * 0.2);
      break;
    }
    default:
      break;
  }
}

function drawZombieHead(g: Phaser.GameObjects.Graphics, c: V, r: number, facing: number, alpha: number, seed: number, base: number) {
  g.fillStyle(C_FILL, alpha);
  g.fillCircle(c.x, c.y, r);
  g.lineStyle(Math.max(2, base * 0.7), C_INK, alpha);
  g.strokeCircle(c.x, c.y, r);
  // hollow eyes
  g.fillStyle(C_INK, alpha);
  g.fillCircle(c.x + facing * r * 0.25, c.y - r * 0.15, r * 0.2);
  g.fillCircle(c.x + facing * r * 0.7, c.y - r * 0.1, r * 0.16);
  // jagged mouth
  g.lineStyle(Math.max(1.2, base * 0.35), C_INK, alpha);
  g.beginPath();
  g.moveTo(c.x + facing * r * 0.15, c.y + r * 0.45);
  g.lineTo(c.x + facing * r * 0.35, c.y + r * 0.3);
  g.lineTo(c.x + facing * r * 0.55, c.y + r * 0.5);
  g.lineTo(c.x + facing * r * 0.78, c.y + r * 0.32);
  g.strokePath();
  // a few hair strands
  const n = 2 + (seed % 3);
  g.lineStyle(Math.max(1.2, base * 0.4), C_INK, alpha);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 - facing * (0.3 + i * 0.35);
    const sx = c.x + Math.cos(a) * r, sy = c.y + Math.sin(a) * r;
    g.lineBetween(sx, sy, sx - facing * r * 0.35, sy - r * 0.45);
  }
}

function drawHeadgear(g: Phaser.GameObjects.Graphics, c: V, r: number, facing: number, alpha: number, style: FigureStyle) {
  const t = style.time ?? 0;
  const vx = style.vx ?? 0;
  switch (style.headgear) {
    case 'headband': {
      g.lineStyle(r * 0.35, 0xffffff, alpha);
      g.lineBetween(c.x - r * 0.95, c.y - r * 0.25, c.x + r * 0.95, c.y - r * 0.25);
      // two tails flutter behind
      const flutter = Math.sin(t * 14) * 3 + Math.min(Math.abs(vx) / 60, 4);
      const bx = c.x - facing * r;
      const by = c.y - r * 0.25;
      g.lineStyle(r * 0.28, C_INK, alpha);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx - facing * r * 1.1, by + r * 0.3 + flutter);
      g.lineTo(bx - facing * r * 1.9, by + r * 0.1 + flutter * 1.6);
      g.strokePath();
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx - facing * r * 0.9, by + r * 0.8 - flutter * 0.5);
      g.lineTo(bx - facing * r * 1.5, by + r * 1.0 - flutter);
      g.strokePath();
      break;
    }
    case 'hood': {
      g.fillStyle(C_INK, alpha);
      g.fillCircle(c.x - facing * r * 0.15, c.y - r * 0.1, r * 1.3);
      g.fillTriangle(
        c.x - facing * r * 0.9, c.y - r * 0.6,
        c.x - facing * r * 2.2, c.y + r * 0.2 + Math.sin(t * 6) * 1.5,
        c.x - facing * r * 0.7, c.y + r * 0.8,
      );
      g.fillStyle(0xffffff, alpha);
      g.fillEllipse(c.x + facing * r * 0.45, c.y - r * 0.05, r * 0.5, r * 0.18);
      break;
    }
    case 'hat': {
      g.lineStyle(r * 0.3, C_INK, alpha);
      g.lineBetween(c.x - r * 1.6, c.y - r * 0.7, c.x + r * 1.6, c.y - r * 0.7);
      g.fillStyle(C_INK, alpha);
      g.fillRect(c.x - r * 0.85, c.y - r * 1.8, r * 1.7, r * 1.15);
      g.lineStyle(r * 0.2, 0xffffff, alpha);
      g.lineBetween(c.x - r * 0.85, c.y - r * 0.95, c.x + r * 0.85, c.y - r * 0.95);
      break;
    }
    default:
      break;
  }
}

/** Draws a weapon from the hand along unit direction d. */
export function drawWeapon(g: Phaser.GameObjects.Graphics, weapon: WeaponId, hand: V, d: V, scale: number, alpha = 1, ink = INK, shine = 0xffffff, lenScale = 1) {
  const n = { x: -d.y, y: d.x };
  if (weapon === 'sword') {
    const len = WEAPON_LEN.sword * scale * lenScale;
    // grip behind the hand
    g.lineStyle(4 * scale, ink, alpha);
    g.lineBetween(hand.x - d.x * 8 * scale, hand.y - d.y * 8 * scale, hand.x, hand.y);
    // guard
    const gx = hand.x + d.x * 3 * scale, gy = hand.y + d.y * 3 * scale;
    g.lineStyle(3.5 * scale, ink, alpha);
    g.lineBetween(gx + n.x * 8 * scale, gy + n.y * 8 * scale, gx - n.x * 8 * scale, gy - n.y * 8 * scale);
    // wavy blade, like in the sketch
    const pts: V[] = [];
    const segs = 9;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const along = 4 * scale + t * (len - 4 * scale);
      const w = Math.sin(t * Math.PI * 4) * 2.6 * scale * (1 - t * 0.6);
      pts.push({ x: hand.x + d.x * along + n.x * w, y: hand.y + d.y * along + n.y * w });
    }
    g.lineStyle(5 * scale, ink, alpha);
    g.strokePoints(P(pts), false);
    g.lineStyle(1.6 * scale, shine, alpha * 0.9);
    g.strokePoints(P(pts.slice(1, -1)), false);
  } else {
    const len = WEAPON_LEN.axe * scale * lenScale;
    g.lineStyle(4.5 * scale, ink, alpha);
    g.lineBetween(hand.x - d.x * 10 * scale, hand.y - d.y * 10 * scale, hand.x + d.x * len, hand.y + d.y * len);
    // double-bladed head
    const hx = hand.x + d.x * (len - 8 * scale);
    const hy = hand.y + d.y * (len - 8 * scale);
    for (const side of [1, -1]) {
      const p0 = { x: hx + d.x * 9 * scale, y: hy + d.y * 9 * scale };
      const p1 = { x: hx - d.x * 9 * scale, y: hy - d.y * 9 * scale };
      const out = { x: n.x * side * 20 * scale, y: n.y * side * 20 * scale };
      const blade: V[] = [
        { x: p0.x + n.x * side * 3 * scale, y: p0.y + n.y * side * 3 * scale },
        { x: p0.x + d.x * 8 * scale + out.x, y: p0.y + d.y * 8 * scale + out.y },
        { x: hx + out.x * 0.8, y: hy + out.y * 0.8 },
        { x: p1.x - d.x * 8 * scale + out.x, y: p1.y - d.y * 8 * scale + out.y },
        { x: p1.x + n.x * side * 3 * scale, y: p1.y + n.y * side * 3 * scale },
      ];
      g.fillStyle(ink, alpha);
      g.fillPoints(P(blade), true);
    }
    g.fillStyle(shine, alpha);
    g.fillCircle(hx, hy, 2.2 * scale);
  }
}
