import Phaser from 'phaser';
import { ACC, ARENA_LEFT, ARENA_RIGHT, FIG, FONT_IMPACT, GROUND_Y, HEIGHT, INK, INK_FAINT, INK_SOFT, WIDTH, hex } from './constants';
import { drawFigure, pose } from './figure';
import { PERKS, PERK_INDEX, drawPerkIcon, type PerkId } from './perks';
import type { Player, Rect, SwingKind } from './Player';
import type { Zombie } from './Zombie';

type G = Phaser.GameObjects.Graphics;

// ---------------------------------------------------------------- perk bar (HUD)

export const PERK_BAR_Y = 92;
const SLOT_R = 19;
const SLOT_GAP = 47;

export class PerkBar {
  private icons: G;
  private fx: G;
  private counts: Phaser.GameObjects.Text[] = [];
  private lastKey = '';

  constructor(private scene: Phaser.Scene) {
    this.icons = scene.add.graphics().setDepth(101).setScrollFactor(0);
    this.fx = scene.add.graphics().setDepth(100).setScrollFactor(0);
    PERKS.forEach((p, i) => {
      const { x, y } = this.slotPos(i);
      scene.add.text(x, y + SLOT_R + 2, p.key, { fontFamily: FONT_IMPACT, fontSize: '14px', color: hex(INK_SOFT) }).setOrigin(0.5, 0).setDepth(101).setScrollFactor(0);
      this.counts.push(
        scene.add.text(x + SLOT_R - 2, y - SLOT_R - 4, '', { fontFamily: FONT_IMPACT, fontSize: '15px', color: hex(INK), stroke: '#ffffff', strokeThickness: 3 })
          .setOrigin(0.5, 0).setDepth(102).setScrollFactor(0),
      );
    });
  }

  slotPos(i: number) {
    return { x: WIDTH / 2 + (i - 4.5) * SLOT_GAP, y: PERK_BAR_Y };
  }

  /** counts per slot; left = remaining 0..1 of an active perk (or 0). */
  draw(counts: number[], left: number[], time: number) {
    const key = counts.join(',') + '|' + left.map((l) => (l > 0 ? 1 : 0)).join('');
    if (key !== this.lastKey) {
      this.lastKey = key;
      const g = this.icons;
      g.clear();
      PERKS.forEach((p, i) => {
        const { x, y } = this.slotPos(i);
        const has = counts[i] > 0 || left[i] > 0;
        drawPerkIcon(g, p.id, x, y, SLOT_R * 0.72, has ? ACC.main : INK_FAINT, has ? INK : INK_FAINT, has ? 1 : 0.8);
        this.counts[i].setText(counts[i] > 1 ? `×${counts[i]}` : '');
      });
    }
    const f = this.fx;
    f.clear();
    PERKS.forEach((_p, i) => {
      const { x, y } = this.slotPos(i);
      const has = counts[i] > 0;
      f.fillStyle(0xffffff, has || left[i] > 0 ? 1 : 0.55);
      f.fillCircle(x, y, SLOT_R);
      if (left[i] > 0) {
        // remaining time: a pie in the accent colour that runs out
        f.fillStyle(ACC.soft, 1);
        f.slice(x, y, SLOT_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left[i], false);
        f.fillPath();
        const glow = 0.5 + Math.sin(time * 8) * 0.3;
        f.lineStyle(6, ACC.main, glow);
        f.strokeCircle(x, y, SLOT_R + 3);
        f.lineStyle(3.5, ACC.main, 1);
        f.beginPath();
        f.arc(x, y, SLOT_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left[i], false);
        f.strokePath();
      } else {
        f.lineStyle(has ? 3 : 2, has ? INK : INK_FAINT, 1);
        f.strokeCircle(x, y, SLOT_R);
        if (has) {
          f.lineStyle(1.5, ACC.main, 0.9);
          f.strokeCircle(x, y, SLOT_R - 4);
        }
      }
    });
  }

  /** Empty slot pressed: a short shake with a cross. */
  deny(i: number) {
    const { x, y } = this.slotPos(i);
    const g = this.scene.add.graphics().setDepth(103).setScrollFactor(0).setPosition(x, y);
    g.lineStyle(4, ACC.main, 1);
    g.lineBetween(-10, -10, 10, 10);
    g.lineBetween(10, -10, -10, 10);
    this.scene.tweens.add({ targets: g, x: x + 5, duration: 40, yoyo: true, repeat: 3 });
    this.scene.tweens.add({ targets: g, alpha: 0, delay: 500, duration: 300, onComplete: () => g.destroy() });
  }

  /** Slot bounces when a perk lands in it. */
  pop(i: number) {
    const { x, y } = this.slotPos(i);
    const c = this.scene.add.circle(x, y, SLOT_R, ACC.main, 0.6).setDepth(99).setScrollFactor(0);
    this.scene.tweens.add({ targets: c, scale: 2, alpha: 0, duration: 450, ease: 'Cubic.Out', onComplete: () => c.destroy() });
  }
}

// ---------------------------------------------------------------- perk pick-up texture

/** Round pick-up with the perk icon (one texture per perk and accent colour). */
export function perkTexture(scene: Phaser.Scene, id: PerkId) {
  const key = `perk-${id}-${ACC.main.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  const c = 30;
  g.fillStyle(ACC.main, 0.25);
  g.fillCircle(c, c, 29);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(c, c, 23);
  g.lineStyle(3.5, INK, 1);
  g.strokeCircle(c, c, 23);
  g.lineStyle(2.5, ACC.main, 1);
  g.strokeCircle(c, c, 27);
  drawPerkIcon(g, id, c, c, 16, ACC.main);
  g.generateTexture(key, 60, 60);
  g.destroy();
  return key;
}

// ---------------------------------------------------------------- activation effects

/** Big burst when a perk switches on: a ring, the icon floating up, its name. Plus something of its own. */
export function activationFx(scene: Phaser.Scene, id: PerkId, player: Player) {
  const hb = player.hurtbox();
  const cx = player.x, cy = (hb.top + hb.bottom) / 2;
  const power = PERK_INDEX[id] / 9;
  for (let i = 0; i < 2 + Math.round(power * 2); i++) {
    const ring = scene.add.circle(cx, cy, 30, ACC.main, 0).setStrokeStyle(8 - i * 2, ACC.main, 0.9).setDepth(45);
    scene.tweens.add({ targets: ring, scale: 4 + power * 6 + i * 1.5, alpha: 0, delay: i * 90, duration: 550 + power * 300, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }
  const top = Math.max(hb.top, 260);
  const icon = scene.add.image(cx, top - 30, perkTexture(scene, id)).setDepth(92).setScale(0.6);
  scene.tweens.add({ targets: icon, y: top - 90, scale: 1.5, duration: 450, ease: 'Back.Out' });
  scene.tweens.add({ targets: icon, alpha: 0, delay: 650, duration: 350, onComplete: () => icon.destroy() });
  const name = PERKS[PERK_INDEX[id]].name + '!';
  const t = scene.add.text(Phaser.Math.Clamp(cx, 160, WIDTH - 160), top - 140, name, { fontFamily: FONT_IMPACT, fontSize: '36px', color: hex(ACC.main), stroke: '#ffffff', strokeThickness: 6 })
    .setOrigin(0.5).setDepth(93).setAlpha(0);
  scene.tweens.add({ targets: t, alpha: 1, y: top - 160, duration: 250 });
  scene.tweens.add({ targets: t, alpha: 0, delay: 1000, duration: 400, onComplete: () => t.destroy() });
  // speed lines toward the hero
  const lines = scene.add.graphics().setDepth(44);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lines.lineStyle(i % 2 ? 3 : 5, i % 3 ? ACC.main : INK, 0.8);
    lines.lineBetween(cx + Math.cos(a) * 160, cy + Math.sin(a) * 160, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70);
  }
  lines.setAlpha(0);
  scene.tweens.add({ targets: lines, alpha: 1, duration: 100, yoyo: true, hold: 120, onComplete: () => lines.destroy() });

  switch (id) {
    case 'freeze': {
      // ice shards burst out
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const s = scene.add.triangle(cx, cy, 0, 0, 8, 0, 4, -26, ACC.soft).setStrokeStyle(2, ACC.main).setDepth(46).setRotation(a + Math.PI / 2);
        scene.tweens.add({ targets: s, x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 150, alpha: 0, duration: 600, ease: 'Cubic.Out', onComplete: () => s.destroy() });
      }
      break;
    }
    case 'berserk':
      scene.cameras.main.shake(500, 0.01);
      break;
    case 'ghost':
    case 'invis': {
      for (let i = 0; i < 10; i++) {
        const p = scene.add.circle(cx + Phaser.Math.Between(-30, 30), cy + Phaser.Math.Between(-50, 50), Phaser.Math.Between(12, 24), i % 2 ? ACC.soft : 0xffffff, 0.8).setDepth(46);
        scene.tweens.add({ targets: p, y: p.y - 60, scale: 2, alpha: 0, duration: 800 + i * 40, onComplete: () => p.destroy() });
      }
      break;
    }
    case 'invinc': {
      const c = scene.add.ellipse(cx, cy, 20, 30, ACC.main, 0.35).setStrokeStyle(5, ACC.main).setDepth(46);
      scene.tweens.add({ targets: c, scaleX: 7, scaleY: 7.5, alpha: 0, duration: 500, ease: 'Back.Out', onComplete: () => c.destroy() });
      break;
    }
    case 'angel': {
      // a beam of light from the sky
      const beam = scene.add.rectangle(cx, 0, 120, GROUND_Y * 2, ACC.main, 0.3).setOrigin(0.5, 0).setDepth(44);
      beam.setScale(0.1, 1);
      scene.tweens.add({ targets: beam, scaleX: 1, duration: 250, yoyo: true, hold: 500, onComplete: () => beam.destroy() });
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- spear

export class Spear {
  readonly hit = new Set<unknown>();
  /** Feet of the player when throwing (Infinity = in the air). */
  throwerFoot = Infinity;
  private g: G;
  private vx: number;
  private vy: number;
  private trail: { x: number; y: number }[] = [];
  dead = false;

  constructor(scene: Phaser.Scene, public x: number, public y: number, readonly dir: number, readonly kind: SwingKind) {
    this.g = scene.add.graphics().setDepth(22);
    this.vx = dir * 1150;
    this.vy = kind === 'high' ? -60 : 0;
  }

  get angle() {
    return Math.atan2(this.vy, this.vx);
  }

  box(): Rect {
    const tipX = this.x + Math.cos(this.angle) * 36;
    return { left: Math.min(this.x, tipX) - 6, right: Math.max(this.x, tipX) + 6, top: this.y - 12, bottom: this.y + 12 };
  }

  update(dt: number) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 90 * dt;
    if (this.x < ARENA_LEFT - 60 || this.x > ARENA_RIGHT + 60) this.dead = true;
    const g = this.g;
    g.clear();
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      g.lineStyle(2 + i, ACC.main, (i / this.trail.length) * 0.7);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const tail = { x: this.x - c * 50 * FIG, y: this.y - s * 50 * FIG };
    const tip = { x: this.x + c * 30 * FIG, y: this.y + s * 30 * FIG };
    g.lineStyle(4, INK, 1);
    g.lineBetween(tail.x, tail.y, tip.x, tip.y);
    g.fillStyle(INK, 1);
    const hx = tip.x + c * 16, hy = tip.y + s * 16;
    g.fillTriangle(hx, hy, tip.x - s * 7, tip.y + c * 7, tip.x + s * 7, tip.y - c * 7);
    g.lineStyle(2, ACC.main, 1);
    g.lineBetween(tail.x, tail.y, tail.x + c * 12, tail.y + s * 12);
  }

  destroy() {
    this.g.destroy();
  }
}

// ---------------------------------------------------------------- angel

const ANGEL_FLY = pose({ lean: 0.35, head: -0.1, fThigh: 0.35, fShin: 0.35, bThigh: 0.15, bShin: 0.55, fUpper: 1.3, fFore: 1.8, bUpper: -0.7, bFore: -0.3, weapon: 2.6 });

export class Angel {
  private g: G;
  x: number;
  y: number;
  private facing = 1;
  private t = 0;
  private nextHit = 0.6;
  private swingT = 1;
  private leaving = false;
  done = false;

  constructor(scene: Phaser.Scene, x: number) {
    this.g = scene.add.graphics().setDepth(23);
    this.x = x;
    this.y = -60;
  }

  leave() {
    this.leaving = true;
  }

  /** Called back while flying away (the perk was switched on again). */
  stay() {
    this.leaving = false;
  }

  /** `hit` is called for every strike; returns nothing. */
  update(dt: number, zombies: Zombie[], player: Player, hit: (z: Zombie) => void) {
    this.t += dt;
    this.swingT += dt / 0.16;
    let tx: number, ty: number;
    const targets = zombies.filter((z) => z.hittable).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x));
    const target = this.leaving ? undefined : targets[0];
    if (this.leaving) {
      tx = this.x;
      ty = -200;
    } else if (target) {
      const side = this.x < target.x ? -1 : 1;
      tx = target.x + side * (target.hurtbox().right - target.hurtbox().left) * 0.5 + side * 26;
      ty = target.footY - target.height * 0.45;
      this.facing = -side;
    } else {
      tx = player.x - player.facing * 60;
      ty = player.footY - 150 * FIG + Math.sin(this.t * 3) * 10;
      this.facing = player.facing;
    }
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, 1000 * dt);
    if (d > 0.1) {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    if (target && d < 40 && this.t >= this.nextHit) {
      this.nextHit = this.t + 0.3;
      this.swingT = 0;
      hit(target);
    }
    if (this.leaving && this.y < -150) this.done = true;
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    const sc = FIG * 0.85;
    const foot = this.y + 55 * sc;
    // feathered wings behind the back, flapping
    const flap = Math.sin(this.t * 16) * 0.3;
    const WING: [number, number][] = [[0, 0], [-22, -30], [-50, -46], [-72, -40], [-64, -26], [-70, -16], [-56, -10], [-58, 0], [-42, -2], [-40, 10], [-24, 4], [-14, 14]];
    for (const k of [1, 0.75]) {
      const bx = this.x - this.facing * 4, by = this.y - 26 * sc;
      const pts = WING.map(([wx, wy]) => {
        const a = flap * (wx / -72);
        return { x: bx + this.facing * wx * sc * k, y: by + (wy * Math.cos(a) - wx * Math.sin(a) * 0.6) * sc * k };
      });
      g.fillStyle(0xffffff, 0.95);
      g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
      g.lineStyle(2.5, ACC.main, 1);
      g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
    }
    const sw = Math.min(1, this.swingT);
    const p = { ...ANGEL_FLY, weapon: sw < 1 ? 3.6 - sw * 3 : ANGEL_FLY.weapon, fUpper: sw < 1 ? 2.6 - sw * 1.5 : ANGEL_FLY.fUpper };
    const pts = drawFigure(g, this.x, foot, this.facing, sc, p, { kind: 'player', weapon: 'sword', time: this.t, ink: ACC.dark, fill: 0xffffff });
    // halo
    g.lineStyle(3.5, ACC.main, 1);
    g.strokeEllipse(pts.head.x, pts.head.y - 20 * sc, 30 * sc, 9 * sc);
    // glowing trail
    g.fillStyle(ACC.main, 0.15);
    g.fillCircle(this.x, this.y, 50 * sc);
  }

  destroy() {
    this.g.destroy();
  }
}

// ---------------------------------------------------------------- dawn (full-screen)

export class DawnFx {
  private g: G;
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(94).setScrollFactor(0);
    scene.cameras.main.shake(900, 0.006);
  }

  /** left: 0..1 of the perk time remaining. */
  update(dt: number, left: number) {
    this.t += dt;
    const g = this.g;
    g.clear();
    const t = this.t;
    // 0..0.5 darken, 0.4..1.6 the sun rises, cracks glow, beams; then a warm frame stays on
    const dark = t < 0.5 ? t / 0.5 : Math.max(0, 1 - (t - 1.4) / 0.8);
    if (dark > 0) {
      g.fillStyle(INK, 0.45 * dark);
      g.fillRect(0, 0, WIDTH, HEIGHT);
    }
    const rise = Phaser.Math.Clamp((t - 0.35) / 1.1, 0, 1);
    const fade = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 1.2);
    if (fade > 0) {
      // the sun comes up over the horizon behind everything, half hidden by the ground
      const sy = GROUND_Y + 140 - rise * 150;
      const R = 110 + rise * 30;
      for (let i = 0; i < 14; i++) {
        const a = Math.PI + (i / 13) * Math.PI + t * 0.3;
        g.lineStyle(10, ACC.main, 0.25 * fade);
        g.lineBetween(WIDTH / 2 + Math.cos(a) * (R + 20), sy + Math.sin(a) * (R + 20), WIDTH / 2 + Math.cos(a) * (R + 900), sy + Math.sin(a) * (R + 900));
      }
      g.fillStyle(ACC.soft, 0.35 * fade);
      g.fillCircle(WIDTH / 2, sy, R + 30);
      g.fillStyle(ACC.main, 0.5 * fade);
      g.fillCircle(WIDTH / 2, sy, R);
      // glowing cracks along the ground with beams
      const crack = Phaser.Math.Clamp((t - 0.5) / 0.6, 0, 1);
      for (let i = 0; i < 9; i++) {
        const x = 120 + i * 130 + Math.sin(i * 7) * 30;
        g.lineStyle(5, ACC.main, fade);
        g.beginPath();
        g.moveTo(x - 40 * crack, GROUND_Y + 4);
        g.lineTo(x - 10 * crack, GROUND_Y + 12);
        g.lineTo(x + 15 * crack, GROUND_Y + 2);
        g.lineTo(x + 40 * crack, GROUND_Y + 10);
        g.strokePath();
        g.fillStyle(ACC.main, 0.18 * fade * crack);
        g.fillRect(x - 18, 0, 36, GROUND_Y + 4);
      }
    }
    // the warm frame that stays while Dawn works
    const frame = Math.min(1, t / 1.5) * Math.min(1, left * 6) * (0.6 + Math.sin(t * 4) * 0.15);
    for (let i = 0; i < 4; i++) {
      g.lineStyle(26 - i * 6, ACC.main, 0.12 * frame);
      g.strokeRect(i * 10, i * 10, WIDTH - i * 20, HEIGHT - i * 20);
    }
  }

  /** Dust starts flying once the light reaches the ground. */
  get lit() {
    return this.t > 0.8;
  }

  destroy() {
    this.g.destroy();
  }
}
