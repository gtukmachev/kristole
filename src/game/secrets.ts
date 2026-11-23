import Phaser from 'phaser';
import { ACC, GROUND_Y, INK, INK_SOFT } from './constants';
import type { PlaceId } from './places';
import type { Rect } from './Player';

/**
 * Hidden perks (v4): things in a level that wobble or stand out. Break them, put the candles out
 * or scare the birds away, and a perk drops out.
 */
export type SecretKind = 'pot' | 'skull' | 'crate' | 'candles' | 'birds';

export interface SecretDef {
  kind: SecretKind;
  x: number;
  /** Surface the thing stands on (ground or a ledge top). */
  y: number;
  /** Second candle of a pair. */
  x2?: number;
}

const G = GROUND_Y;

export const SECRETS: Partial<Record<PlaceId, SecretDef[]>> = {
  cliffFoot: [{ kind: 'birds', x: 1040, y: G }, { kind: 'skull', x: 284, y: G - 175 }],
  caveDoor: [{ kind: 'pot', x: 676, y: G - 190 }, { kind: 'crate', x: 140, y: G }],
  caveInside: [{ kind: 'candles', x: 985, y: G - 175, x2: 1075 }, { kind: 'skull', x: 210, y: G - 175 }],
  cliffPath: [{ kind: 'birds', x: 990, y: G - 180 }, { kind: 'pot', x: 160, y: G }],
  summit: [{ kind: 'crate', x: 330, y: G }, { kind: 'birds', x: 670, y: G - 200 }],
  graveGates: [{ kind: 'birds', x: 470, y: G }, { kind: 'candles', x: 860, y: G, x2: 940 }],
  crypts: [{ kind: 'candles', x: 440, y: G - 200, x2: 500 }, { kind: 'pot', x: 810, y: G }],
  chapel: [{ kind: 'candles', x: 540, y: G, x2: 740 }, { kind: 'skull', x: 680, y: G - 190 }],
  openGraves: [{ kind: 'birds', x: 675, y: G - 185 }, { kind: 'skull', x: 1150, y: G }],
  mausoleum: [{ kind: 'candles', x: 540, y: G, x2: 740 }, { kind: 'pot', x: 220, y: G - 190 }],
  moat: [{ kind: 'birds', x: 260, y: G - 185 }, { kind: 'crate', x: 1120, y: G }],
  courtyard: [{ kind: 'crate', x: 700, y: G - 190 }, { kind: 'pot', x: 130, y: G }],
  armory: [{ kind: 'candles', x: 140, y: G, x2: 1140 }, { kind: 'pot', x: 670, y: G - 200 }],
  ramparts: [{ kind: 'birds', x: 300, y: G - 185 }, { kind: 'pot', x: 640, y: G }],
  throne: [{ kind: 'candles', x: 540, y: G, x2: 740 }, { kind: 'skull', x: 1050, y: G - 195 }],
};

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
}

export class Secret {
  done = false;
  private g: Phaser.GameObjects.Graphics;
  private parts: Part[];
  private t = Math.random() * 3;
  private wobbleAt = 1.5 + Math.random() * 3;
  private wobble = 0;
  private birds: { x: number; y: number; vx: number; vy: number; flap: number }[] = [];
  private flying = false;

  constructor(private scene: Phaser.Scene, readonly def: SecretDef, private onOpen: (x: number, y: number) => void) {
    this.g = scene.add.graphics().setDepth(def.kind === 'birds' ? 21 : 8);
    const { x, y, kind } = def;
    if (kind === 'candles') this.parts = [x, def.x2 ?? x + 60].map((cx) => ({ x: cx, y, w: 26, h: 70, hp: 1 }));
    else if (kind === 'birds') {
      this.parts = [{ x, y, w: 90, h: 40, hp: 1 }];
      this.birds = [-26, 2, 28].map((dx) => ({ x: x + dx, y, vx: 0, vy: 0, flap: Math.random() * 6 }));
    } else this.parts = [{ x, y, w: kind === 'crate' ? 52 : 40, h: kind === 'skull' ? 30 : 46, hp: kind === 'crate' ? 2 : 1 }];
  }

  /** Swing (or spear) box: returns true when something was hit. */
  hit(box: Rect): boolean {
    if (this.done) return false;
    for (const p of this.parts) {
      if (p.hp <= 0) continue;
      if (box.left < p.x + p.w / 2 && box.right > p.x - p.w / 2 && box.top < p.y && box.bottom > p.y - p.h) {
        p.hp--;
        this.wobble = 1;
        if (this.def.kind === 'birds') this.scare();
        else if (p.hp <= 0) this.breakPart(p);
        this.checkDone();
        return true;
      }
    }
    return false;
  }

  /** Birds fly off when the player comes close. */
  playerNear(x: number, footY: number) {
    if (this.done || this.def.kind !== 'birds' || this.flying) return;
    if (Math.abs(x - this.def.x) < 95 && Math.abs(footY - this.def.y) < 70) {
      this.parts[0].hp = 0;
      this.scare();
      this.checkDone();
    }
  }

  private scare() {
    if (this.flying) return;
    this.flying = true;
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (const b of this.birds) {
      b.vx = dir * (120 + Math.random() * 120);
      b.vy = -(260 + Math.random() * 120);
    }
  }

  private breakPart(p: Part) {
    const kind = this.def.kind;
    if (kind === 'candles') {
      // puff of smoke where the flame was
      for (let i = 0; i < 5; i++) {
        const c = this.scene.add.circle(p.x + Phaser.Math.Between(-5, 5), p.y - 70, 5, INK_SOFT, 0.5).setDepth(9);
        this.scene.tweens.add({ targets: c, y: c.y - 40 - i * 8, alpha: 0, scale: 2.2, duration: 900 + i * 120, onComplete: () => c.destroy() });
      }
      return;
    }
    for (let i = 0; i < 7; i++) {
      const s = this.scene.add.rectangle(p.x + Phaser.Math.Between(-12, 12), p.y - p.h / 2, Phaser.Math.Between(5, 11), Phaser.Math.Between(4, 9), i % 3 ? 0xf7f7f2 : INK)
        .setStrokeStyle(2, INK).setDepth(9);
      this.scene.tweens.add({
        targets: s, x: s.x + Phaser.Math.Between(-70, 70), y: p.y - Phaser.Math.Between(0, 4), angle: Phaser.Math.Between(-300, 300),
        duration: 500, ease: 'Quad.In', onComplete: () => this.scene.tweens.add({ targets: s, alpha: 0, delay: 1500, duration: 600, onComplete: () => s.destroy() }),
      });
    }
  }

  private checkDone() {
    if (this.done || this.parts.some((p) => p.hp > 0)) return;
    this.done = true;
    const xs = this.parts.map((p) => p.x);
    const cx = this.def.kind === 'candles' ? (Math.min(...xs) + Math.max(...xs)) / 2 : this.def.x;
    // candles far apart: the perk appears in the middle of the room at a jumpable height
    const cy = this.def.kind === 'candles' && Math.abs(xs[0] - xs[1]) > 300 ? GROUND_Y - 60 : this.def.y - 40;
    this.onOpen(cx, cy);
  }

  update(dt: number) {
    this.t += dt;
    this.wobbleAt -= dt;
    if (this.wobbleAt <= 0) {
      this.wobble = 1;
      this.wobbleAt = 3 + Math.random() * 3;
    }
    this.wobble = Math.max(0, this.wobble - dt * 1.8);
    this.draw(dt);
  }

  private draw(dt: number) {
    const g = this.g;
    g.clear();
    const { kind } = this.def;
    const wob = Math.sin(this.t * 28) * 0.12 * this.wobble;
    if (kind === 'birds') return this.drawBirds(g, dt);
    for (const p of this.parts) {
      if (kind === 'candles') {
        this.drawCandle(g, p, wob);
        continue;
      }
      if (p.hp <= 0) continue;
      // rotate around the bottom centre
      const R = (dx: number, dy: number) => ({ x: p.x + dx * Math.cos(wob) - dy * Math.sin(wob), y: p.y + dx * Math.sin(wob) + dy * Math.cos(wob) });
      const poly = (pts: [number, number][], fill: number) => {
        const w = pts.map(([a, b]) => R(a, b));
        g.fillStyle(fill, 1);
        g.fillPoints(w as unknown as Phaser.Math.Vector2[], true);
        g.lineStyle(3, INK, 1);
        g.strokePoints(w as unknown as Phaser.Math.Vector2[], true);
      };
      if (kind === 'pot') {
        poly([[-10, 0], [10, 0], [18, -16], [14, -34], [8, -40], [9, -46], [-9, -46], [-8, -40], [-14, -34], [-18, -16]], 0xe8e4da);
        const a = R(-15, -24), b = R(15, -24);
        g.lineStyle(2.5, ACC.main, 0.9);
        g.lineBetween(a.x, a.y, b.x, b.y);
      } else if (kind === 'skull') {
        poly([[-12, 0], [12, 0], [13, -10], [16, -18], [12, -28], [0, -31], [-12, -28], [-16, -18], [-13, -10]], 0xf7f7f2);
        g.fillStyle(INK, 1);
        for (const ex of [-6, 6]) {
          const e = R(ex, -16);
          g.fillCircle(e.x, e.y, 4);
        }
        const n = R(0, -8);
        g.fillStyle(ACC.main, 1);
        g.fillCircle(n.x, n.y, 2);
      } else if (kind === 'crate') {
        poly([[-26, 0], [26, 0], [26, -46], [-26, -46]], p.hp > 1 ? 0xd8cfc0 : 0xc9bfae);
        const a = R(-26, 0), b = R(26, -46), c = R(26, 0), d = R(-26, -46);
        g.lineStyle(2.5, INK, 0.9);
        g.lineBetween(a.x, a.y, b.x, b.y);
        if (p.hp > 1) g.lineBetween(c.x, c.y, d.x, d.y);
        else {
          g.lineStyle(2, ACC.main, 1);
          g.lineBetween(c.x, c.y - 10, c.x - 20, c.y - 30);
        }
      }
    }
  }

  private drawCandle(g: Phaser.GameObjects.Graphics, p: Part, wob: number) {
    const lit = p.hp > 0;
    // holder + candle
    g.fillStyle(INK, 1);
    g.fillRect(p.x - 14, p.y - 6, 28, 6);
    g.lineStyle(3, INK, 1);
    g.lineBetween(p.x, p.y - 6, p.x, p.y - 24);
    g.fillRect(p.x - 10, p.y - 28, 20, 5);
    g.fillStyle(0xf7f7f2, 1);
    g.fillRect(p.x - 6, p.y - 62, 12, 34);
    g.lineStyle(2.5, INK, 1);
    g.strokeRect(p.x - 6, p.y - 62, 12, 34);
    g.lineBetween(p.x, p.y - 62, p.x, p.y - 67);
    if (!lit) return;
    const f = Math.sin(this.t * 13 + p.x) * 2 + wob * 30;
    g.fillStyle(ACC.main, 1);
    g.fillTriangle(p.x - 6, p.y - 70, p.x + 6, p.y - 70, p.x + f, p.y - 90 - Math.abs(f));
    g.fillEllipse(p.x, p.y - 72, 12, 10);
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(p.x, p.y - 73, 4, 6);
  }

  private drawBirds(g: Phaser.GameObjects.Graphics, dt: number) {
    let visible = false;
    for (const b of this.birds) {
      if (this.flying) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy -= 30 * dt;
        b.flap += dt * 22;
      } else if (Math.random() < dt * 0.6) b.flap = 0.5; // a little hop / head turn
      if (b.y < -40) continue;
      visible = true;
      g.fillStyle(INK, 1);
      if (this.flying) {
        const w = Math.sin(b.flap) * 9;
        g.lineStyle(3, INK, 1);
        g.lineBetween(b.x - 12, b.y - 10 - w, b.x, b.y - 8);
        g.lineBetween(b.x + 12, b.y - 10 - w, b.x, b.y - 8);
        g.fillCircle(b.x, b.y - 8, 3);
      } else {
        const hop = b.flap > 0 ? 3 : 0;
        b.flap = Math.max(0, b.flap - dt * 4);
        g.fillEllipse(b.x, b.y - 10 - hop, 20, 12);
        g.fillCircle(b.x + 9, b.y - 17 - hop, 5);
        g.fillStyle(ACC.main, 1);
        g.fillTriangle(b.x + 13, b.y - 18 - hop, b.x + 13, b.y - 15 - hop, b.x + 19, b.y - 16 - hop);
        g.lineStyle(2, INK, 1);
        g.lineBetween(b.x - 2, b.y - 4, b.x - 2, b.y);
        g.lineBetween(b.x + 3, b.y - 4, b.x + 3, b.y);
      }
    }
    if (!visible) g.clear();
  }

  destroy() {
    this.g.destroy();
  }
}
