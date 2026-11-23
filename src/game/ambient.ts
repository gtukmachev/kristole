import Phaser from 'phaser';
import { GROUND_Y, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH, ACC } from './constants';
import { sfx } from './sfx';

export type AmbientMode = 'sky' | 'night' | 'torches' | 'none';

/** Living background layer per place: clouds & birds, bats & lightning, torch flames & embers. */
export class Ambient {
  private g: Phaser.GameObjects.Graphics;
  private bolt: Phaser.GameObjects.Graphics;
  private t = 0;
  private clouds: { x: number; y: number; s: number; v: number }[] = [];
  private fliers: { x: number; y: number; v: number; phase: number; s: number; bob: number }[] = [];
  private embers: { x: number; y: number; vy: number; life: number }[] = [];
  private nextLightning = 6 + Math.random() * 6;

  constructor(private scene: Phaser.Scene, private id: AmbientMode) {
    this.g = scene.add.graphics().setDepth(5);
    this.bolt = scene.add.graphics().setDepth(6);
    const r = Math.random;
    if (id === 'sky') {
      for (let i = 0; i < 4; i++) this.clouds.push({ x: 200 + r() * 920, y: 70 + r() * 150, s: 0.7 + r() * 0.8, v: 6 + r() * 10 });
      for (let i = 0; i < 3; i++) this.fliers.push(this.newFlier(r() * WIDTH));
    } else if (id === 'night') {
      for (let i = 0; i < 4; i++) this.fliers.push(this.newFlier(r() * WIDTH));
    }
  }

  private newFlier(x: number) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      x,
      y: 90 + Math.random() * 220,
      v: dir * (40 + Math.random() * 50),
      phase: Math.random() * 10,
      s: this.id === 'night' ? 0.9 + Math.random() * 0.5 : 0.7 + Math.random() * 0.4,
      bob: Math.random() * 10,
    };
  }

  update(dt: number) {
    this.t += dt;
    const g = this.g;
    g.clear();
    if (this.id === 'sky') {
      for (const c of this.clouds) {
        // clouds live between the cliffs and fade in / out at their edges
        c.x += c.v * dt;
        if (c.x > 1120) c.x = 200;
        const a = Phaser.Math.Clamp(Math.min(c.x - 200, 1120 - c.x) / 120, 0, 1);
        this.cloud(g, c.x, c.y, c.s, a);
      }
      for (const f of this.fliers) this.bird(g, f, dt);
    } else if (this.id === 'night') {
      for (const f of this.fliers) this.bat(g, f, dt);
      this.fog(g);
      this.lightning(dt);
    } else if (this.id === 'torches') {
      this.torches(g, dt);
    }
  }

  private cloud(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number, a: number) {
    if (a <= 0) return;
    g.fillStyle(PAPER, a);
    g.lineStyle(2, INK_FAINT, a);
    const puffs = [[0, 0, 26], [28, -10, 30], [60, 0, 24], [30, 8, 26]];
    for (const [dx, dy, r] of puffs) g.fillCircle(x + dx * s, y + dy * s, r * s);
    for (const [dx, dy, r] of puffs) g.strokeCircle(x + dx * s, y + dy * s, r * s);
    for (const [dx, dy, r] of puffs) g.fillCircle(x + dx * s, y + dy * s, r * s - 1.5);
  }


  private wrap(f: { x: number; v: number }) {
    if (f.x > WIDTH + 60) f.x = -60;
    if (f.x < -60) f.x = WIDTH + 60;
  }

  private bird(g: Phaser.GameObjects.Graphics, f: Ambient['fliers'][number], dt: number) {
    f.x += f.v * dt;
    f.phase += dt * 9;
    this.wrap(f);
    const y = f.y + Math.sin(this.t * 0.8 + f.bob) * 8;
    const flap = Math.sin(f.phase) * 7 * f.s;
    const w = 12 * f.s;
    g.lineStyle(2.2, INK_SOFT, 0.9);
    g.beginPath();
    g.moveTo(f.x - w, y - flap);
    g.lineTo(f.x, y);
    g.lineTo(f.x + w, y - flap);
    g.strokePath();
  }

  private bat(g: Phaser.GameObjects.Graphics, f: Ambient['fliers'][number], dt: number) {
    f.x += f.v * dt * 1.3;
    f.phase += dt * 16;
    this.wrap(f);
    const y = f.y + Math.sin(this.t * 3 + f.bob) * 14;
    const flap = Math.sin(f.phase);
    const s = f.s;
    g.fillStyle(INK, 0.85);
    g.fillEllipse(f.x, y, 7 * s, 9 * s);
    for (const side of [-1, 1]) {
      const tipY = y - flap * 10 * s;
      g.fillTriangle(f.x, y - 2 * s, f.x + side * 18 * s, tipY, f.x + side * 6 * s, y + 4 * s);
      g.fillTriangle(f.x + side * 6 * s, y + 2 * s, f.x + side * 18 * s, tipY, f.x + side * 13 * s, y + 4 * s + flap * 2 * s);
    }
  }

  private fog(g: Phaser.GameObjects.Graphics) {
    for (let i = 0; i < 5; i++) {
      const x = ((this.t * (12 + i * 4) + i * 300) % (WIDTH + 400)) - 200;
      g.fillStyle(0xffffff, 0.22);
      g.fillEllipse(x, GROUND_Y - 14 - (i % 2) * 10, 260, 26);
    }
  }

  private lightning(dt: number) {
    this.nextLightning -= dt;
    if (this.nextLightning > 0) return;
    this.nextLightning = 9 + Math.random() * 10;
    const b = this.bolt;
    b.clear();
    let x = 200 + Math.random() * (WIDTH - 400);
    let y = 0;
    b.lineStyle(4, INK, 1);
    b.beginPath();
    b.moveTo(x, y);
    while (y < 330) {
      x += (Math.random() - 0.5) * 70;
      y += 30 + Math.random() * 30;
      b.lineTo(x, y);
    }
    b.strokePath();
    b.setAlpha(1);
    this.scene.cameras.main.flash(140, 255, 255, 255, false);
    this.scene.tweens.add({ targets: b, alpha: 0, duration: 350, delay: 120 });
    this.scene.time.delayedCall(400 + Math.random() * 500, () => sfx.thunder());
  }

  private torches(g: Phaser.GameObjects.Graphics, dt: number) {
    for (const x0 of [334, 644, 954]) {
      const fx = x0, fy = 444;
      const f = (k: number) => Math.sin(this.t * (11 + k) + x0) * 0.5 + Math.sin(this.t * (23 + k * 2) + x0 * 0.3) * 0.5;
      const h = 30 + f(0) * 6;
      const sway = f(1) * 4;
      // outer flame (ink) + inner flame (paper)
      g.fillStyle(INK, 1);
      g.fillTriangle(fx - 9, fy, fx + 9, fy, fx + sway, fy - h);
      g.fillEllipse(fx, fy - 4, 18, 14);
      g.fillStyle(ACC.main, 1);
      g.fillTriangle(fx - 4, fy - 2, fx + 4, fy - 2, fx + sway * 0.6, fy - h * 0.55);
      if (Math.random() < dt * 6) this.embers.push({ x: fx + (Math.random() - 0.5) * 8, y: fy - h, vy: -30 - Math.random() * 40, life: 1 });
    }
    for (const e of this.embers) {
      e.y += e.vy * dt;
      e.x += Math.sin(this.t * 4 + e.y * 0.05) * 12 * dt;
      e.life -= dt * 0.8;
      g.fillStyle(INK, Math.max(0, e.life));
      g.fillRect(e.x, e.y, 2.5, 2.5);
    }
    this.embers = this.embers.filter((e) => e.life > 0);
  }
}
