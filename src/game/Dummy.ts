import Phaser from 'phaser';
import { FIG, GROUND_Y, INK, INK_SOFT } from './constants';
import { drawFigure, pose } from './figure';
import type { Rect, SwingKind } from './Player';

/**
 * Practice dummy for the Controls screen: a zombie on a stick, a little above the ground.
 * The stick sits on a spring: a hit tips it over, then it sways back and forth and settles.
 */

const SCALE = FIG;
const BODY_H = 110 * SCALE;
const BODY_W = 30 * SCALE;
/** How high the stick holds the feet above the ground. */
const LIFT = 34;
const STIFF = 90; // spring: angular acceleration per radian
const DAMP = 4.2; // how fast the swaying dies down
const MAX_TILT = 0.75;
// arms out, a bit slumped: a scarecrow-ish zombie
const P_DUMMY = pose({ lean: 0.1, head: 0.25, fThigh: 0.06, fShin: 0, bThigh: -0.06, bShin: 0, fUpper: 1.5, fFore: 1.75, bUpper: 1.35, bFore: 1.6 });

export class Dummy {
  private g: Phaser.GameObjects.Graphics;
  /** Tilt (radians, + = away to the right) and its speed. */
  private a = 0;
  private av = 0;
  private flashUntil = 0;
  private time = 0;
  /** Faces the player. */
  facing = -1;

  constructor(scene: Phaser.Scene, readonly x: number) {
    this.g = scene.add.graphics().setDepth(18);
  }

  /** Where the hits land (upright body; the sway is small near the feet). */
  hurtbox(): Rect {
    const sx = this.x + Math.sin(this.a) * BODY_H * 0.5;
    const foot = GROUND_Y - LIFT;
    return { left: sx - BODY_W / 2, right: sx + BODY_W / 2, top: foot - BODY_H, bottom: foot };
  }

  /** Point to spill blood from. */
  hitPoint(kind: SwingKind, dir: number) {
    const hb = this.hurtbox();
    const y = kind === 'high' ? hb.top + (hb.bottom - hb.top) * 0.25 : hb.top + (hb.bottom - hb.top) * 0.6;
    return { x: dir > 0 ? hb.left + 4 : hb.right - 4, y };
  }

  hit(kind: SwingKind, dir: number) {
    this.av += dir * (kind === 'high' ? 3.4 : 2.6);
    this.flashUntil = this.time + 0.12;
  }

  update(dt: number, playerX: number) {
    this.time += dt;
    this.facing = playerX < this.x ? -1 : 1;
    // damped spring, in small steps (a big frame must not blow it up)
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      this.av += (-STIFF * this.a - DAMP * this.av) * h;
      this.a = Phaser.Math.Clamp(this.a + this.av * h, -MAX_TILT, MAX_TILT);
      left -= h;
    }
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    // the stick: from a little base in the ground up to the feet, tilted with the spring
    const tx = this.x + Math.sin(this.a) * LIFT;
    const ty = GROUND_Y - Math.cos(this.a) * LIFT;
    g.lineStyle(7, INK_SOFT, 1);
    g.lineBetween(this.x, GROUND_Y + 2, tx, ty);
    g.fillStyle(INK, 1);
    g.fillRect(this.x - 16, GROUND_Y - 4, 32, 8);
    // the spring: a few zigzags at the bottom of the stick
    g.lineStyle(3, INK, 1);
    const n = 5;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = this.x + Math.sin(this.a) * LIFT * 0.5 * t + (i % 2 ? 7 : -7) * (i > 0 && i < n ? 1 : 0);
      const py = GROUND_Y - Math.cos(this.a) * LIFT * 0.5 * t;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();
    drawFigure(g, tx, ty, this.facing, SCALE, { ...P_DUMMY, rot: this.a * this.facing }, {
      kind: 'zombie',
      seed: 7,
      flash: this.time < this.flashUntil,
    });
  }

  destroy() {
    this.g.destroy();
  }
}
