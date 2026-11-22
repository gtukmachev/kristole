import Phaser from 'phaser';
import { FIG, GROUND_Y } from './constants';
import { ZOMBIES, type ZombieDef, type ZombieSize } from './data';
import { drawFigure, ease, lerpPose, pose, BONES, type FigurePoints, type Pose } from './figure';
import type { Player, Rect, SwingKind } from './Player';
import { sfx } from './sfx';

export type ZombieState = 'rising' | 'walk' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dying';

const BASE_H = 110;
const BASE_W = 30;

const Z_WALK_BASE = pose({ lean: 0.28, head: 0.15, fUpper: 1.45, fFore: 1.6, bUpper: 1.3, bFore: 1.5 });
const Z_WINDUP_HIGH = pose({ lean: -0.12, head: -0.2, fThigh: 0.25, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.75, fFore: 3.0, bUpper: 2.5, bFore: 2.8 });
const Z_STRIKE_HIGH = pose({ lean: 0.5, head: 0.25, fThigh: 0.55, fShin: -0.05, bThigh: -0.4, bShin: -0.25, fUpper: 1.65, fFore: 1.55, bUpper: 1.45, bFore: 1.45 });
const Z_WINDUP_LOW = pose({ lean: -0.15, head: -0.3, fThigh: 0.8, fShin: -0.5, bThigh: 0.2, bShin: -0.9, fUpper: 0.9, fFore: 1.2, bUpper: 0.6, bFore: 1.0 });
const Z_STRIKE_LOW = pose({ lean: 1.15, head: 0.5, fThigh: 0.9, fShin: 0.1, bThigh: -0.6, bShin: -0.3, fUpper: 1.0, fFore: 0.9, bUpper: 0.8, bFore: 0.8 });
const Z_HURT = pose({ lean: -0.4, head: -0.5, fThigh: 0.2, fShin: 0.1, bThigh: -0.35, bShin: -0.2, fUpper: 0.6, fFore: 0.9, bUpper: -0.3, bFore: 0.3 });
const Z_DEAD = pose({ lean: 0, head: 0.5, fThigh: 0.35, fShin: 0.6, bThigh: -0.1, bShin: 0.2, fUpper: 2.4, fFore: 2.0, bUpper: -1.8, bFore: -1.2, rot: -1.52 });

export interface ZombieHost {
  zombieStrike(z: Zombie, band: Rect): void;
  zombieGone(z: Zombie): void;
}

let seedCounter = 1;

export class Zombie {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly gfx: Phaser.GameObjects.Graphics;
  readonly def: ZombieDef;
  readonly scale: number;
  readonly seed = seedCounter++;
  readonly maxHp: number;
  readonly damage: number;
  readonly speed: number;
  hp: number;
  state: ZombieState = 'rising';
  facing = 1;
  headless = false;
  /** Set by the scene: slow down because another zombie is right in front. */
  blocked = false;
  lastPoints: FigurePoints | null = null;
  private stateT = 0;
  private cur: Pose;
  private walkPhase = Math.random() * 10;
  private time = 0;
  private flashUntil = 0;
  private groanAt = 2 + Math.random() * 6;
  private killedBy: SwingKind | null = null;
  private poiseUntil = 0;
  private lungeUntil = 0;
  private lungeCooldown = 1 + Math.random() * 2;

  constructor(scene: Phaser.Scene, private host: ZombieHost, readonly size: ZombieSize, x: number, strength: number) {
    this.def = ZOMBIES[size];
    this.scale = this.def.scale * FIG * (0.95 + Math.random() * 0.1);
    this.maxHp = Math.round(this.def.hp * strength);
    this.hp = this.maxHp;
    this.damage = Math.round(this.def.damage * (1 + (strength - 1) * 0.6));
    this.speed = this.def.speed * 1.15 * (1 + (strength - 1) * 0.25) * (0.9 + Math.random() * 0.2);
    const h = BASE_H * this.scale;
    this.zone = scene.add.zone(x, GROUND_Y - h / 2, BASE_W * this.scale, h);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setAllowGravity(false);
    this.gfx = scene.add.graphics().setDepth(this.size === 'giant' ? 14 : 15 + Math.random());
    this.cur = pose({ ...Z_WALK_BASE, rot: 0 });
    sfx.rise();
  }

  get x() {
    return this.body.center.x;
  }
  get footY() {
    return this.body.bottom;
  }
  get height() {
    return BASE_H * this.scale;
  }
  get alive() {
    return this.state !== 'dying';
  }
  /** Can be hit (not still deep in the ground, not dying). */
  get hittable() {
    return this.alive && !(this.state === 'rising' && this.stateT < 0.55);
  }

  hurtbox(): Rect {
    const w = BASE_W * this.scale;
    return { left: this.x - w / 2, right: this.x + w / 2, top: this.footY - this.height, bottom: this.footY };
  }

  /** Returns true if this hit killed it. */
  takeHit(dmg: number, kind: SwingKind, dirX: number, knockback: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flashUntil = this.time + 0.12;
    if (this.hp <= 0) {
      this.killedBy = kind;
      this.setState('dying');
      this.body.setAllowGravity(true);
      this.body.setVelocity(dirX * knockback * 1.1, -180);
      return true;
    }
    // After a stagger a zombie keeps pushing forward for a moment (poise), so spamming one button isn't enough.
    const staggers = (!this.def.heavy || kind === 'high') && this.time >= this.poiseUntil;
    if (staggers && this.state !== 'rising') {
      this.setState('hurt');
      this.poiseUntil = this.time + 0.3 + 0.7;
      this.body.setVelocityX(dirX * knockback / (this.def.heavy ? 2 : 1));
    }
    return false;
  }

  knockOffHead() {
    this.headless = true;
  }

  get wasKilledBy() {
    return this.killedBy;
  }

  private setState(s: ZombieState) {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, player: Player) {
    this.time += dt;
    this.stateT += dt;
    const d = this.def;
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    const lowAttack = this.size === 'small';

    switch (this.state) {
      case 'rising': {
        this.body.setVelocity(0, 0);
        const riseT = 0.95;
        if (this.stateT >= riseT) {
          this.body.setAllowGravity(true);
          this.setState('walk');
        }
        break;
      }
      case 'walk': {
        if (!player.dead) this.facing = dx >= 0 ? 1 : -1;
        if (!player.dead && dist <= d.reach * FIG + PLAYER_HALF && Math.abs(player.footY - this.footY) < 140 * FIG) {
          this.body.setVelocityX(0);
          this.setState('windup');
          sfx.zombieAttack();
        } else {
          // Occasional lunge to close the distance (not the heavy ones).
          this.lungeCooldown -= dt;
          const near = dist < d.reach * FIG + 230 && dist > d.reach * FIG + 40;
          if (!d.heavy && near && this.lungeCooldown <= 0 && !this.blocked) {
            this.lungeUntil = this.time + 0.4;
            this.lungeCooldown = 2.5 + Math.random() * 3;
          }
          const lunge = this.time < this.lungeUntil ? 2.6 : 1;
          const sp = player.dead ? this.speed * 0.3 : this.speed * lunge * (this.blocked ? 0.15 : 1);
          this.body.setVelocityX(this.facing * sp);
        }
        this.groanAt -= dt;
        if (this.groanAt <= 0) {
          sfx.groan();
          this.groanAt = 4 + Math.random() * 8;
        }
        break;
      }
      case 'windup': {
        this.body.setVelocityX(0);
        if (this.stateT * 1000 >= d.windupMs) {
          this.setState('strike');
          const reachFar = this.x + this.facing * (d.reach * FIG + PLAYER_HALF + 8);
          const [top, bottom] = d.attackBand.map((v) => v * FIG);
          this.host.zombieStrike(this, {
            left: Math.min(this.x, reachFar),
            right: Math.max(this.x, reachFar),
            top: this.footY - top,
            bottom: this.footY - bottom + (lowAttack ? 4 : 0),
          });
          if (lowAttack) this.body.setVelocityX(this.facing * 120);
        }
        break;
      }
      case 'strike': {
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT >= 0.22) this.setState('recover');
        break;
      }
      case 'recover': {
        this.body.setVelocityX(0);
        if (this.stateT >= 0.55) this.setState('walk');
        break;
      }
      case 'hurt': {
        this.body.setVelocityX(this.body.velocity.x * 0.86);
        if (this.stateT >= 0.3) this.setState('walk');
        break;
      }
      case 'dying': {
        if (this.body.blocked.down) this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > 2.6) {
          this.host.zombieGone(this);
          return;
        }
        break;
      }
    }

    this.cur = this.computePose(dt, lowAttack);
    this.draw();
  }

  private computePose(dt: number, lowAttack: boolean): Pose {
    const d = this.def;
    const smooth = (target: Pose, k: number) => lerpPose(this.cur, target, 1 - Math.exp(-dt * k));
    switch (this.state) {
      case 'rising':
        return smooth(pose({ ...Z_WALK_BASE, fUpper: 2.6, fFore: 2.8, bUpper: 2.3, bFore: 2.6, lean: 0.1 }), 6);
      case 'walk': {
        const sp = Math.abs(this.body.velocity.x);
        this.walkPhase += dt * (3 + sp / 18);
        const s = Math.sin(this.walkPhase);
        const c = Math.cos(this.walkPhase);
        const sway = Math.sin(this.walkPhase * 0.5 + this.seed) * 0.08;
        return smooth(
          pose({
            ...Z_WALK_BASE,
            lean: Z_WALK_BASE.lean + sway,
            head: Z_WALK_BASE.head + Math.sin(this.time * 2 + this.seed) * 0.15,
            fThigh: 0.4 * s,
            fShin: 0.4 * s - 0.3 * Math.max(0, c),
            bThigh: -0.4 * s,
            bShin: -0.4 * s - 0.3 * Math.max(0, -c),
            fUpper: Z_WALK_BASE.fUpper + 0.12 * s,
            bUpper: Z_WALK_BASE.bUpper - 0.12 * s,
          }),
          14,
        );
      }
      case 'windup': {
        const t = ease.out(Math.min(1, (this.stateT * 1000) / d.windupMs));
        const target = lowAttack ? Z_WINDUP_LOW : Z_WINDUP_HIGH;
        // shiver a little right before striking
        const shake = t > 0.7 ? Math.sin(this.time * 70) * 0.05 : 0;
        const p = lerpPose(this.cur, target, t * 0.5 + 0.1);
        return { ...p, lean: p.lean + shake };
      }
      case 'strike':
        return smooth(lowAttack ? Z_STRIKE_LOW : Z_STRIKE_HIGH, 40);
      case 'recover':
        return smooth(Z_WALK_BASE, 6);
      case 'hurt':
        return smooth(Z_HURT, 25);
      case 'dying':
        return smooth(Z_DEAD, this.stateT < 0.6 ? 7 : 3);
    }
  }

  private draw() {
    const g = this.gfx;
    g.clear();
    let sink = 0;
    if (this.state === 'rising') {
      const t = Math.min(1, this.stateT / 0.95);
      sink = (1 - ease.out(t)) * (this.height + 10);
    }
    let alpha = 1;
    if (this.state === 'dying' && this.stateT > 1.9) alpha = Math.max(0, 1 - (this.stateT - 1.9) / 0.7);
    this.lastPoints = drawFigure(g, this.x, this.footY + sink, this.facing, this.scale, this.cur, {
      kind: 'zombie',
      seed: this.seed,
      alpha,
      flash: this.time < this.flashUntil,
      headless: this.headless,
    });
    if (this.state === 'windup' && this.stateT > 0.08) {
      // Teach the player what to do: arrow above the head (↓ = duck, ↑ = jump).
      const hx = this.lastPoints.head.x;
      const hy = this.lastPoints.head.y - BONES.headR * this.scale - 18;
      const up = this.size === 'small';
      const a = Math.min(1, this.stateT * 6);
      g.fillStyle(0x111111, a);
      if (up) g.fillTriangle(hx - 8, hy + 6, hx + 8, hy + 6, hx, hy - 8);
      else g.fillTriangle(hx - 8, hy - 6, hx + 8, hy - 6, hx, hy + 8);
    }
    if (this.size === 'giant' && this.alive) {
      const w = 90;
      const top = this.footY - this.height - 34 + sink;
      g.fillStyle(0xffffff, 1);
      g.fillRect(this.x - w / 2, top, w, 8);
      g.fillStyle(0x111111, 1);
      g.fillRect(this.x - w / 2, top, (w * Math.max(0, this.hp)) / this.maxHp, 8);
      g.lineStyle(2, 0x111111, 1);
      g.strokeRect(this.x - w / 2, top, w, 8);
    }
  }

  destroy() {
    this.gfx.destroy();
    this.zone.destroy();
  }
}

const PLAYER_HALF = 17 * FIG;
