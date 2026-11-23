import Phaser from 'phaser';
import { ACC, INK } from './constants';
import { drawFigure, ease, lerpPose, pose, type Pose } from './figure';
import type { PerkId } from './perks';

/**
 * Tiny looping scenes for the perks screen: the hero fights a zombie under the perk.
 * Pure function of time, drawn into a box of DEMO_W × DEMO_H at (ox, oy).
 */
export const DEMO_W = 340;
export const DEMO_H = 140;
const GY = 126; // ground line inside the box
const SC = 0.6; // figure scale
const LOOP = 2.4;

const P_IDLE = pose({ lean: 0.06, fThigh: 0.16, fShin: 0.04, bThigh: -0.18, bShin: -0.06, fUpper: 0.55, fFore: 1.45, bUpper: -0.25, bFore: 0.35, weapon: 2.55 });
const SW_A = pose({ lean: -0.15, fThigh: 0.3, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.9, fFore: 3.2, bUpper: -0.6, bFore: -0.2, weapon: 3.5 });
const SW_B = pose({ lean: 0.55, head: -0.2, fThigh: 0.75, fShin: -0.1, bThigh: -0.45, bShin: -0.35, fUpper: 1.1, fFore: 1.05, bUpper: -0.7, bFore: -0.2, weapon: 0.75 });
const THROW = pose({ lean: 0.5, fThigh: 0.7, fShin: -0.1, bThigh: -0.5, bShin: -0.3, fUpper: 1.6, fFore: 1.5, bUpper: -0.8, bFore: -0.4, weapon: 1.5 });
const Z_BASE = pose({ lean: 0.28, head: 0.15, fUpper: 1.45, fFore: 1.6, bUpper: 1.3, bFore: 1.5 });
const Z_WIND = pose({ lean: -0.12, head: -0.2, fThigh: 0.25, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.75, fFore: 3.0, bUpper: 2.5, bFore: 2.8 });
const Z_STRIKE = pose({ lean: 0.5, head: 0.25, fThigh: 0.55, fShin: -0.05, bThigh: -0.4, bShin: -0.25, fUpper: 1.65, fFore: 1.55, bUpper: 1.45, bFore: 1.45 });
const Z_HURT = pose({ lean: -0.4, head: -0.5, fThigh: 0.2, fShin: 0.1, bThigh: -0.35, bShin: -0.2, fUpper: 0.6, fFore: 0.9, bUpper: -0.3, bFore: 0.3 });
const Z_DEAD = pose({ lean: 0, head: 0.5, fThigh: 0.35, fShin: 0.6, bThigh: -0.1, bShin: 0.2, fUpper: 2.4, fFore: 2.0, bUpper: -1.8, bFore: -1.2, rot: -1.52 });

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

function zWalk(t: number): Pose {
  const s = Math.sin(t * 7), c = Math.cos(t * 7);
  return { ...Z_BASE, fThigh: 0.4 * s, fShin: 0.4 * s - 0.3 * Math.max(0, c), bThigh: -0.4 * s, bShin: -0.4 * s - 0.3 * Math.max(0, -c) };
}

/** Hero swing pose at time t for a swing starting at t0 (0.3 s long). */
function swing(t: number, t0: number): Pose {
  const u = (t - t0) / 0.3;
  if (u < 0 || u > 1.6) return P_IDLE;
  if (u < 0.35) return lerpPose(P_IDLE, SW_A, ease.out(u / 0.35));
  if (u < 1) return lerpPose(SW_A, SW_B, ease.out((u - 0.35) / 0.65));
  return lerpPose(SW_B, P_IDLE, (u - 1) / 0.6);
}

export function drawPerkDemo(g: Phaser.GameObjects.Graphics, id: PerkId, time: number, ox: number, oy: number) {
  const t = time % LOOP;
  const X = (x: number) => ox + x, Y = (y: number) => oy + y;
  const hero = (x: number, p: Pose, o: { scale?: number; y?: number; ws?: number; ink?: number; fill?: number; alpha?: number; facing?: number } = {}) =>
    drawFigure(g, X(x), Y(o.y ?? GY), o.facing ?? 1, SC * (o.scale ?? 1), p, {
      kind: 'player', weapon: 'sword', headgear: 'headband', time, weaponScale: o.ws ?? 1, ink: o.ink, fill: o.fill, alpha: o.alpha ?? 1,
    });
  const zombie = (x: number, p: Pose, o: { flash?: boolean; alpha?: number; ink?: number; facing?: number; seed?: number } = {}) =>
    drawFigure(g, X(x), Y(GY), o.facing ?? -1, SC, p, { kind: 'zombie', seed: o.seed ?? 3, flash: o.flash, alpha: o.alpha ?? 1, ink: o.ink });
  const blood = (x: number, y: number, k: number) => {
    if (k <= 0 || k >= 1) return;
    g.fillStyle(ACC.main, 1 - k);
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + i * 0.3;
      g.fillCircle(X(x + Math.cos(a) * 40 * k), Y(y + Math.sin(a) * 30 * k + 40 * k * k), 2.5);
    }
  };
  const trail = (pts: { x: number; y: number }, from: number, to: number) => {
    g.lineStyle(5, ACC.main, 0.55);
    g.beginPath();
    g.arc(pts.x - 8, pts.y + 24, 34, from, to, false);
    g.strokePath();
  };

  // ground
  g.lineStyle(2.5, INK, 1);
  g.lineBetween(X(0), Y(GY + 1), X(DEMO_W), Y(GY + 1));
  g.lineStyle(1.5, ACC.main, 0.7);
  g.lineBetween(X(0), Y(GY + 5), X(DEMO_W), Y(GY + 5));

  // the usual script: a zombie walks in, the hero swings at 1.2 s, the zombie is hit at 1.35 s
  const walkIn = (stop = 165) => 320 - (320 - stop) * seg(t, 0, 1.2);
  const hitK = seg(t, 1.35, 1.8);

  switch (id) {
    case 'sword':
    case 'long': {
      const long = id === 'long';
      const back = long ? 120 : 50;
      const zx = t < 1.35 ? walkIn(long ? 205 : 165) : (long ? 205 : 165) + back * ease.out(hitK);
      const dead = seg(t, 1.8, 2.3);
      zombie(zx, dead > 0 ? lerpPose(Z_HURT, Z_DEAD, dead) : t > 1.35 ? Z_HURT : zWalk(t), { flash: t > 1.35 && t < 1.5, alpha: 1 - seg(t, 2.1, 2.4) });
      const pts = hero(80, swing(t, 1.2), { ws: long ? 1.5 : 1 });
      if (t > 1.25 && t < 1.55) trail(pts.shoulder, -1.6, 0.6);
      if (long) {
        g.lineStyle(2, ACC.main, 0.9);
        g.lineBetween(pts.hand.x + (pts.tip.x - pts.hand.x) * 0.3, pts.hand.y + (pts.tip.y - pts.hand.y) * 0.3, pts.tip.x, pts.tip.y);
      }
      blood(zx - 10, 70, hitK);
      break;
    }
    case 'freeze': {
      const zx = walkIn();
      const frozen = t > 1.35;
      zombie(zx, frozen ? Z_WIND : zWalk(t), { flash: t > 1.35 && t < 1.45 });
      hero(80, swing(t, 1.2));
      if (frozen) {
        const w = 22;
        g.fillStyle(ACC.main, 0.12);
        g.fillRoundedRect(X(zx - w), Y(GY - 70), w * 2, 70, 8);
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= 8; i++) pts.push({ x: X(zx - w + (2 * w * i) / 8), y: Y(GY - (i % 2 ? 16 : 6)) });
        pts.push({ x: X(zx + w), y: Y(GY) }, { x: X(zx - w), y: Y(GY) });
        g.fillStyle(ACC.soft, 1);
        g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
        g.lineStyle(2, ACC.main, 1);
        g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
      }
      break;
    }
    case 'spear': {
      const sx = 110 + 300 * seg(t, 0.5, 1.0);
      for (const [zx, at] of [[200, 0.62], [270, 0.78]] as const) {
        const hit = t > at;
        const d = seg(t, at + 0.3, at + 0.8);
        zombie(zx, d > 0 ? lerpPose(Z_HURT, Z_DEAD, d) : hit ? Z_HURT : zWalk(t + zx), { flash: hit && t < at + 0.12, alpha: 1 - seg(t, 2.0, 2.4), seed: zx });
        blood(zx - 8, 82, seg(t, at, at + 0.45));
      }
      hero(80, t > 0.35 && t < 0.9 ? THROW : P_IDLE);
      if (t > 0.5 && t < 1.0) {
        const y = Y(84);
        for (let i = 1; i < 6; i++) {
          g.lineStyle(1 + i * 0.6, ACC.main, i / 8);
          g.lineBetween(X(sx - 60 + i * 8), y, X(sx - 52 + i * 8), y);
        }
        g.lineStyle(3, INK, 1);
        g.lineBetween(X(sx - 36), y, X(sx + 10), y);
        g.fillStyle(INK, 1);
        g.fillTriangle(X(sx + 20), y, X(sx + 8), y - 5, X(sx + 8), y + 5);
      }
      break;
    }
    case 'invis': {
      // the zombie just wanders, the see-through hero strolls up and hits it; it swings back blindly
      const zx = 230 + Math.sin(t * 2.6) * 40;
      const zFacing = Math.cos(t * 2.6) > 0 ? 1 : -1;
      const hx = 60 + 70 * seg(t, 0, 1.0);
      const back = t > 1.5 && t < 2.0;
      zombie(zx, back ? (t < 1.7 ? Z_WIND : Z_STRIKE) : t > 1.35 && t < 1.5 ? Z_HURT : zWalk(t), { flash: t > 1.35 && t < 1.45, facing: back ? -1 : zFacing });
      hero(hx, swing(t, 1.2), { ink: ACC.main, fill: ACC.soft, alpha: 0.5 });
      break;
    }
    case 'berserk': {
      const spin = time * 26;
      for (const [zx, f] of [[95, 1], [250, -1]] as const) {
        const hit = Math.floor(time * 15 + zx) % 3 === 0;
        zombie(zx, hit ? Z_HURT : zWalk(time + zx), { facing: f, flash: hit, seed: zx });
        blood(zx, 70, (time * 3 + zx * 0.01) % 1);
      }
      const p = { ...P_IDLE, lean: 0.05 + Math.sin(time * 9) * 0.1, fUpper: 2.4 + Math.sin(spin) * 0.6, fFore: 2.6 + Math.sin(spin) * 0.6, bUpper: -1.6, bFore: -1.2, weapon: spin };
      hero(170, p);
      for (let i = 0; i < 3; i++) {
        const a0 = time * 20 + i * 2.1;
        g.lineStyle(5 - i, ACC.main, 0.55 - i * 0.12);
        g.beginPath();
        g.arc(X(170), Y(GY - 45), 52 - i * 7, a0, a0 + 1.8, false);
        g.strokePath();
      }
      break;
    }
    case 'invinc': {
      // the zombie swings, the blow bounces off the cocoon
      const zx = 150;
      const strike = t > 0.9 && t < 1.25;
      const bounce = t > 1.0 ? Math.max(0, 1 - (t - 1.0) * 2.5) : 0;
      zombie(zx + bounce * 20, t < 0.5 ? zWalk(t) : t < 0.95 ? Z_WIND : strike ? Z_STRIKE : Z_BASE, { flash: t > 1.0 && t < 1.1 });
      hero(80, swing(t, 1.6));
      const pulse = 1 + Math.sin(time * 6) * 0.04 + (t > 1.0 && t < 1.2 ? 0.1 : 0);
      g.fillStyle(ACC.main, 0.12);
      g.fillEllipse(X(80), Y(GY - 40), 66 * pulse, 104 * pulse);
      g.lineStyle(3.5, ACC.main, 0.9);
      g.strokeEllipse(X(80), Y(GY - 40), 66 * pulse, 104 * pulse);
      if (t > 1.6) blood(zx - 6, 60, seg(t, 1.75, 2.2));
      break;
    }
    case 'ghost': {
      // the small ghost floats through the zombie and hits it from behind
      const hx = 50 + 240 * seg(t, 0, 2.0);
      const hy = GY - 30 - Math.sin(seg(t, 0, 2.0) * Math.PI) * 40;
      const behind = hx > 210;
      zombie(200, t > 1.55 && t < 1.8 ? Z_HURT : zWalk(t), { flash: t > 1.55 && t < 1.65 });
      for (let i = 0; i < 4; i++) {
        g.fillStyle(ACC.main, 0.12);
        g.fillCircle(X(hx + Math.cos(time * 2 + i) * 8), Y(hy - 24 + Math.sin(time * 2.6 + i) * 12), 16 + i * 2);
      }
      hero(hx, behind ? swing(t, 1.4) : P_IDLE, { scale: 0.67, y: hy, alpha: 0.75, facing: behind ? -1 : 1 });
      blood(200, 70, seg(t, 1.55, 2.0));
      break;
    }
    case 'angel': {
      const zx = 240;
      const strikeT = (time % 0.6) / 0.6;
      zombie(zx, strikeT < 0.3 ? Z_HURT : zWalk(time), { flash: strikeT < 0.15 });
      hero(60, P_IDLE);
      const ax = zx - 46 + Math.sin(time * 3) * 6, ay = GY - 70 + Math.sin(time * 5) * 6;
      // wings, little figure, halo
      const flap = Math.sin(time * 16) * 0.3;
      for (const k of [1, 0.75]) {
        const WING = [[0, 0], [-22, -30], [-50, -46], [-72, -40], [-64, -26], [-70, -16], [-56, -10], [-58, 0], [-42, -2], [-40, 10], [-24, 4], [-14, 14]];
        const wing = WING.map(([wx, wy]) => ({ x: X(ax - 2 + wx * 0.6 * k), y: Y(ay + 8 + (wy + wx * flap * 0.4) * 0.6 * k) }));
        g.fillStyle(0xffffff, 0.95);
        g.fillPoints(wing as unknown as Phaser.Math.Vector2[], true);
        g.lineStyle(2, ACC.main, 1);
        g.strokePoints(wing as unknown as Phaser.Math.Vector2[], true);
      }
      const sw = strikeT < 0.3 ? strikeT / 0.3 : 1;
      const p = pose({ lean: 0.35, fThigh: 0.35, fShin: 0.35, bThigh: 0.15, bShin: 0.55, fUpper: 2.6 - sw * 1.5, fFore: 1.8, bUpper: -0.7, bFore: -0.3, weapon: 3.6 - sw * 3 });
      const pts = drawFigure(g, X(ax), Y(ay + 32), 1, SC * 0.8, p, { kind: 'player', weapon: 'sword', time, ink: ACC.dark, fill: 0xffffff });
      g.lineStyle(2.5, ACC.main, 1);
      g.strokeEllipse(pts.head.x, pts.head.y - 13, 18, 6);
      blood(zx - 6, 66, strikeT);
      break;
    }
    case 'dawn': {
      // the sun comes up over the horizon (a half disc growing out of the ground)
      const rise = ease.out(seg(t, 0.2, 1.0));
      const cx = X(DEMO_W / 2), cy = Y(GY);
      if (rise > 0) {
        g.fillStyle(ACC.soft, 0.55);
        g.slice(cx, cy, 62 * rise, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(ACC.main, 0.6);
        g.slice(cx, cy, 46 * rise, Math.PI, 0, false);
        g.fillPath();
        for (let i = 1; i < 8; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          g.lineStyle(4, ACC.main, 0.35 * rise);
          g.lineBetween(cx + Math.cos(a) * 70 * rise, cy + Math.sin(a) * 70 * rise, cx + Math.cos(a) * 112 * rise, cy + Math.sin(a) * 112 * rise);
        }
      }
      const dust = seg(t, 1.0, 1.9);
      for (const zx of [200, 280]) {
        if (dust < 1) zombie(zx, zWalk(t + zx), { alpha: 1 - dust, ink: dust > 0 ? ACC.main : undefined, seed: zx });
        if (dust > 0) {
          for (let i = 0; i < 12; i++) {
            g.fillStyle(i % 2 ? ACC.main : 0x777777, Math.max(0, 1 - dust));
            g.fillCircle(X(zx - 12 + (i % 4) * 8 + dust * 40), Y(GY - 10 - i * 5 - dust * 50), 2.2);
          }
        }
      }
      hero(80, P_IDLE);
      break;
    }
  }
}
