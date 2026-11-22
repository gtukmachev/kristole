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
}

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
  const wLen = style.weapon ? WEAPON_LEN[style.weapon] : 0;

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
  const back = isZombie ? INK_SOFT : 0x333333;

  // Back limbs (slightly lighter so the figure reads with depth).
  limb(base, back, S, T(bElbow), T(bHand));
  limb(base, back, H, T(bKnee), T(bFoot));

  // Torso.
  if (isZombie) {
    drawZombieTorso(g, H, S, scale, alpha, style.seed ?? 0);
  } else {
    line(base * 1.45, INK, H, S);
  }

  // Front leg.
  limb(base, INK, H, T(fKnee), T(fFoot));
  if (!isZombie) {
    // little boots
    const ff = T(fFoot), bf = T(bFoot);
    g.fillStyle(INK, alpha);
    g.fillEllipse(ff.x + facing * 3 * scale, ff.y - 1 * scale, 11 * scale, 6 * scale);
    g.fillStyle(back, alpha);
    g.fillEllipse(bf.x + facing * 3 * scale, bf.y - 1 * scale, 11 * scale, 6 * scale);
  }

  // Neck + head.
  const headR = BONES.headR * scale;
  if (!style.headless) {
    line(base, INK, S, T(neckTop));
    if (isZombie) {
      drawZombieHead(g, HD, headR, facing, alpha, style.seed ?? 0, base);
    } else {
      g.fillStyle(INK, alpha);
      g.fillCircle(HD.x, HD.y, headR);
      drawHeadgear(g, HD, headR, facing, alpha, style);
    }
  } else {
    // stump
    line(base * 1.2, INK, S, T(neckTop));
  }

  // Front arm + weapon.
  const FH = T(fHand);
  limb(base, INK, S, T(fElbow), FH);
  let tipW = FH;
  if (style.weapon) {
    const d = worldDir(p.weapon, 1);
    tipW = { x: FH.x + d.x * wLen, y: FH.y + d.y * wLen };
    drawWeapon(g, style.weapon, FH, d, scale, alpha);
  }
  if (isZombie) {
    // claw fingers
    const fd = worldDir(p.fFore, 1);
    const bd = worldDir(p.bFore, 1);
    for (const [h, d, c] of [[FH, fd, INK], [T(bHand), bd, back]] as [V, V, number][]) {
      for (const off of [-0.5, 0, 0.5]) {
        const ang = Math.atan2(d.y, d.x) + off;
        const l = 6 * scale;
        line(base * 0.6, c, h, { x: h.x + Math.cos(ang) * l, y: h.y + Math.sin(ang) * l });
      }
    }
  }

  return { hip: H, shoulder: S, head: HD, hand: FH, tip: tipW, headR };
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
  g.fillStyle(0xf7f7f2, alpha);
  g.fillPoints(P(pts), true);
  g.lineStyle(2.4 * scale, INK, alpha);
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
  g.lineStyle(1.6 * scale, INK, alpha);
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

function drawZombieHead(g: Phaser.GameObjects.Graphics, c: V, r: number, facing: number, alpha: number, seed: number, base: number) {
  g.fillStyle(0xf7f7f2, alpha);
  g.fillCircle(c.x, c.y, r);
  g.lineStyle(Math.max(2, base * 0.7), INK, alpha);
  g.strokeCircle(c.x, c.y, r);
  // hollow eyes
  g.fillStyle(INK, alpha);
  g.fillCircle(c.x + facing * r * 0.25, c.y - r * 0.15, r * 0.2);
  g.fillCircle(c.x + facing * r * 0.7, c.y - r * 0.1, r * 0.16);
  // jagged mouth
  g.lineStyle(Math.max(1.2, base * 0.35), INK, alpha);
  g.beginPath();
  g.moveTo(c.x + facing * r * 0.15, c.y + r * 0.45);
  g.lineTo(c.x + facing * r * 0.35, c.y + r * 0.3);
  g.lineTo(c.x + facing * r * 0.55, c.y + r * 0.5);
  g.lineTo(c.x + facing * r * 0.78, c.y + r * 0.32);
  g.strokePath();
  // a few hair strands
  const n = 2 + (seed % 3);
  g.lineStyle(Math.max(1.2, base * 0.4), INK, alpha);
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
      g.lineStyle(r * 0.28, INK, alpha);
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
      g.fillStyle(INK, alpha);
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
      g.lineStyle(r * 0.3, INK, alpha);
      g.lineBetween(c.x - r * 1.6, c.y - r * 0.7, c.x + r * 1.6, c.y - r * 0.7);
      g.fillStyle(INK, alpha);
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
export function drawWeapon(g: Phaser.GameObjects.Graphics, weapon: WeaponId, hand: V, d: V, scale: number, alpha = 1, ink = INK, shine = 0xffffff) {
  const n = { x: -d.y, y: d.x };
  if (weapon === 'sword') {
    const len = WEAPON_LEN.sword * scale;
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
    const len = WEAPON_LEN.axe * scale;
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
