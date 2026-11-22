import Phaser from 'phaser';
import { ARENA_LEFT, ARENA_RIGHT, FIG, GROUND_Y, INK_FAINT, INK_SOFT } from './constants';
import { WEAPONS, type WeaponDef } from './data';
import { drawFigure, ease, lerpPose, pose, type Pose } from './figure';
import { sfx } from './sfx';
import type { Profile, WeaponId } from './storage';

export type SwingKind = 'high' | 'low';

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpPressed: boolean;
  swingHigh: boolean;
  swingLow: boolean;
}

const SPEED = 310;
const JUMP_V = 870;
const WALL_JUMP_VX = 400;
const WALL_JUMP_VY = 800;
export const PLAYER_W = 34 * FIG;
export const PLAYER_H = 110 * FIG;
export const PLAYER_CROUCH_H = 62 * FIG;

// Key poses (facing right).
const P_IDLE = pose({ lean: 0.06, fThigh: 0.16, fShin: 0.04, bThigh: -0.18, bShin: -0.06, fUpper: 0.55, fFore: 1.45, bUpper: -0.25, bFore: 0.35, weapon: 2.55 });
const P_CROUCH = pose({ lean: 0.78, head: -0.35, fThigh: 1.5, fShin: -0.45, bThigh: 0.95, bShin: -1.35, fUpper: 1.2, fFore: 1.7, bUpper: 0.2, bFore: 0.9, weapon: 2.1 });
const P_JUMP = pose({ lean: 0.12, fThigh: 1.0, fShin: -0.15, bThigh: 0.25, bShin: -0.7, fUpper: 1.0, fFore: 2.0, bUpper: -0.9, bFore: -0.4, weapon: 2.8, lift: 6 });
const P_FALL = pose({ lean: 0.05, fThigh: 0.5, fShin: 0.1, bThigh: -0.25, bShin: -0.5, fUpper: 1.3, fFore: 2.0, bUpper: -1.4, bFore: -1.0, weapon: 2.9 });
const P_HURT = pose({ lean: -0.35, head: -0.3, fThigh: 0.3, fShin: 0.1, bThigh: -0.35, bShin: -0.2, fUpper: -0.3, fFore: 0.6, bUpper: -1.2, bFore: -0.6, weapon: 1.2 });
const P_DEAD = pose({ lean: 0, head: 0.3, fThigh: 0.25, fShin: 0.4, bThigh: -0.2, bShin: 0.1, fUpper: 2.2, fFore: 2.6, bUpper: -2.0, bFore: -1.6, weapon: 1.6, rot: -1.5 });

// Swing up: from low-front, slash upward ("W – swing sword up").
const HIGH_A = pose({ lean: 0.18, fThigh: 0.4, fShin: 0.1, bThigh: -0.35, bShin: -0.15, fUpper: 0.2, fFore: 0.35, bUpper: -0.5, bFore: -0.2, weapon: 0.55 });
const HIGH_B = pose({ lean: -0.12, fThigh: 0.35, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.6, fFore: 2.85, bUpper: -0.9, bFore: -0.6, weapon: 3.0 });
// Swing down: from overhead, chop down-forward ("S – swing sword down").
const LOW_A = pose({ lean: -0.15, fThigh: 0.3, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.9, fFore: 3.2, bUpper: -0.6, bFore: -0.2, weapon: 3.5 });
const LOW_B = pose({ lean: 0.55, head: -0.2, fThigh: 0.75, fShin: -0.1, bThigh: -0.45, bShin: -0.35, fUpper: 1.1, fFore: 1.05, bUpper: -0.7, bFore: -0.2, weapon: 0.75 });
// Crouched variants.
const CHIGH_A = pose({ ...P_CROUCH, fUpper: 0.6, fFore: 0.7, weapon: 0.9 });
const CHIGH_B = pose({ ...P_CROUCH, lean: 0.45, fUpper: 2.1, fFore: 2.2, weapon: 2.4 });
const CLOW_A = pose({ ...P_CROUCH, fUpper: 2.4, fFore: 2.8, weapon: 3.2 });
const CLOW_B = pose({ ...P_CROUCH, lean: 0.95, fUpper: 1.25, fFore: 1.15, weapon: 1.0 });

export interface PlayerHost {
  playerSwing(player: Player, kind: SwingKind, box: Rect, hitOnce: Set<unknown>): void;
  playerDied(player: Player): void;
  dustAt(x: number, y: number, n: number): void;
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly gfx: Phaser.GameObjects.Graphics;
  private trail: Phaser.GameObjects.Graphics;
  readonly weapon: WeaponDef;
  facing = 1;
  maxHp = 100;
  hp = 100;
  dead = false;
  god = false;
  crouching = false;
  private time = 0;
  private walkPhase = 0;
  private cur: Pose = P_IDLE;
  private attack: { kind: SwingKind; t: number; crouched: boolean; hit: Set<unknown>; swung: boolean } | null = null;
  private nextAttackAt = 0;
  private hurtUntil = 0;
  private invulnUntil = 0;
  private lockUntil = 0;
  private lastGroundAt = 0;
  private jumpBufferedAt = -1;
  private deadT = 0;
  private trailPts: { x: number; y: number; hx: number; hy: number; t: number }[] = [];
  private wasOnGround = true;

  constructor(scene: Phaser.Scene, private host: PlayerHost, x: number, weapon: WeaponId, private profile: Profile) {
    this.weapon = WEAPONS[weapon];
    this.zone = scene.add.zone(x, GROUND_Y - PLAYER_H / 2, PLAYER_W, PLAYER_H);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(1400);
    this.trail = scene.add.graphics().setDepth(19);
    this.gfx = scene.add.graphics().setDepth(20);
  }

  get x() {
    return this.body.center.x;
  }
  get footY() {
    return this.body.bottom;
  }
  get onGround() {
    return this.body.blocked.down;
  }
  get invulnerable() {
    return this.god || this.time < this.invulnUntil || this.dead;
  }

  hurtbox(): Rect {
    const h = this.crouching ? PLAYER_CROUCH_H : PLAYER_H;
    return { left: this.x - PLAYER_W / 2, right: this.x + PLAYER_W / 2, top: this.footY - h, bottom: this.footY };
  }

  swingBox(kind: SwingKind, crouched: boolean): Rect {
    const near = this.x - this.facing * 10;
    const far = this.x + this.facing * this.weapon.range * FIG;
    const f = this.footY;
    let top: number, bottom: number;
    if (crouched) {
      [top, bottom] = kind === 'high' ? [f - 80 * FIG, f - 28 * FIG] : [f - 50 * FIG, f + 4];
    } else {
      [top, bottom] = kind === 'high' ? [f - 132 * FIG, f - 72 * FIG] : [f - 70 * FIG, f + 4];
    }
    return { left: Math.min(near, far), right: Math.max(near, far), top, bottom };
  }

  damage(amount: number, fromDir: number) {
    if (this.invulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = this.time + 0.9;
    this.hurtUntil = this.time + 0.28;
    this.attack = null;
    this.body.setVelocity(fromDir * 260, -260);
    sfx.playerHurt();
    if (this.hp <= 0) {
      this.dead = true;
      this.deadT = 0;
      this.body.setVelocityX(fromDir * 200);
      this.host.playerDied(this);
    }
    return true;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt: number, input: PlayerInput) {
    this.time += dt;
    const onGround = this.onGround;
    if (onGround) this.lastGroundAt = this.time;
    if (onGround && !this.wasOnGround && !this.dead) {
      this.cur = { ...this.cur, lift: -4 };
      this.host.dustAt(this.x, this.footY, 8);
    }
    this.wasOnGround = onGround;

    if (this.dead) {
      this.deadT += dt;
      if (onGround) this.body.setVelocityX(this.body.velocity.x * 0.9);
      this.cur = lerpPose(this.cur, P_DEAD, 1 - Math.exp(-dt * 8));
      this.draw();
      return;
    }

    const hurt = this.time < this.hurtUntil;
    const locked = this.time < this.lockUntil;
    this.crouching = input.down && onGround && !hurt;

    // Horizontal movement.
    if (!hurt && !locked) {
      let dirX = 0;
      if (input.left) dirX -= 1;
      if (input.right) dirX += 1;
      if (dirX !== 0 && !this.attack) this.facing = dirX;
      let speed = SPEED;
      if (this.crouching) speed = 0;
      else if (this.attack && onGround) speed *= 0.3;
      const target = dirX * speed;
      const accel = onGround ? 18 : 9;
      this.body.setVelocityX(Phaser.Math.Linear(this.body.velocity.x, target, Math.min(1, accel * dt)));
    } else if (onGround && hurt) {
      this.body.setVelocityX(this.body.velocity.x * 0.88);
    }

    // Jumping (with a little buffer + coyote time so it feels fair).
    if (input.jumpPressed) this.jumpBufferedAt = this.time;
    const wantsJump = this.time - this.jumpBufferedAt < 0.12;
    if (wantsJump && !hurt) {
      const touchingLeft = this.body.blocked.left || this.body.left <= ARENA_LEFT + 2;
      const touchingRight = this.body.blocked.right || this.body.right >= ARENA_RIGHT - 2;
      if (onGround || this.time - this.lastGroundAt < 0.09) {
        this.body.setVelocityY(-JUMP_V);
        this.jumpBufferedAt = -1;
        this.lastGroundAt = -1;
        sfx.jump();
        this.host.dustAt(this.x, this.footY, 5);
      } else if (touchingLeft || touchingRight) {
        // Bounce off the wall.
        const away = touchingLeft ? 1 : -1;
        this.body.setVelocity(away * WALL_JUMP_VX, -WALL_JUMP_VY);
        this.facing = away;
        this.lockUntil = this.time + 0.22;
        this.jumpBufferedAt = -1;
        sfx.wallJump();
        this.host.dustAt(touchingLeft ? this.body.left : this.body.right, this.body.center.y, 7);
      }
    }

    // Attacks.
    if (!this.attack && !hurt && this.time >= this.nextAttackAt && (input.swingHigh || input.swingLow)) {
      const kind: SwingKind = input.swingHigh ? 'high' : 'low';
      this.attack = { kind, t: 0, crouched: this.crouching, hit: new Set(), swung: false };
      this.nextAttackAt = this.time + this.weapon.swingMs / 1000 + 0.04;
      this.trailPts = [];
    }
    if (this.attack) {
      const a = this.attack;
      a.t += (dt * 1000) / this.weapon.swingMs;
      if (!a.swung && a.t >= this.weapon.activeFrom * 0.7) {
        a.swung = true;
        sfx.swing(this.weapon.id === 'axe');
      }
      if (a.t >= this.weapon.activeFrom && a.t <= this.weapon.activeTo) {
        this.host.playerSwing(this, a.kind, this.swingBox(a.kind, a.crouched), a.hit);
      }
      if (a.t >= 1) this.attack = null;
    }

    // Pose.
    if (this.attack) {
      const a = this.attack;
      const [A, B] = a.crouched ? (a.kind === 'high' ? [CHIGH_A, CHIGH_B] : [CLOW_A, CLOW_B]) : a.kind === 'high' ? [HIGH_A, HIGH_B] : [LOW_A, LOW_B];
      // quick wind-up into A, fast swing to B, settle.
      let p: Pose;
      const w = this.weapon.activeFrom;
      if (a.t < w) p = lerpPose(this.cur, A, ease.out(a.t / w));
      else if (a.t < this.weapon.activeTo) p = lerpPose(A, B, ease.out((a.t - w) / (this.weapon.activeTo - w)));
      else p = B;
      if (!onGround) p = { ...p, fThigh: P_JUMP.fThigh, fShin: P_JUMP.fShin, bThigh: P_JUMP.bThigh, bShin: P_JUMP.bShin };
      this.cur = p;
    } else {
      let target: Pose;
      if (hurt) target = P_HURT;
      else if (!onGround) target = this.body.velocity.y < 0 ? P_JUMP : P_FALL;
      else if (this.crouching) target = P_CROUCH;
      else if (Math.abs(this.body.velocity.x) > 30) target = this.walkPose(dt);
      else {
        const b = Math.sin(this.time * 3) * 0.03;
        target = { ...P_IDLE, lean: P_IDLE.lean + b, fUpper: P_IDLE.fUpper + b, weapon: P_IDLE.weapon + b * 2 };
      }
      this.cur = lerpPose(this.cur, target, 1 - Math.exp(-dt * 22));
    }
    this.draw();
  }

  private walkPose(dt: number): Pose {
    this.walkPhase += dt * (Math.abs(this.body.velocity.x) / SPEED) * 13;
    const s = Math.sin(this.walkPhase);
    const c = Math.cos(this.walkPhase);
    return pose({
      lean: 0.16,
      fThigh: 0.6 * s,
      fShin: 0.6 * s - 0.55 * Math.max(0, c),
      bThigh: -0.6 * s,
      bShin: -0.6 * s - 0.55 * Math.max(0, -c),
      fUpper: 0.75 + 0.1 * s,
      fFore: 1.6,
      bUpper: 0.5 * s,
      bFore: 0.5 * s + 0.6,
      weapon: 2.35 + 0.1 * s,
      lift: Math.abs(c) * 3,
    });
  }

  private draw() {
    const g = this.gfx;
    g.clear();
    const blink = this.time < this.invulnUntil && !this.dead && Math.floor(this.time * 18) % 2 === 0;
    const pts = drawFigure(g, this.x, this.footY, this.facing, FIG, this.cur, {
      kind: 'player',
      weapon: this.weapon.id,
      headgear: this.profile.headgear,
      time: this.time,
      vx: this.body.velocity.x,
      alpha: blink ? 0.35 : 1,
    });
    // Weapon swoosh.
    this.trail.clear();
    if (this.attack && this.attack.t > this.weapon.activeFrom * 0.8) {
      this.trailPts.push({ x: pts.tip.x, y: pts.tip.y, hx: pts.hand.x, hy: pts.hand.y, t: this.time });
    }
    this.trailPts = this.trailPts.filter((p) => this.time - p.t < 0.14);
    if (this.trailPts.length > 1) {
      // Brush smear: fill the area the blade swept, from the hand out to the tip, fading out.
      const n = this.trailPts.length;
      for (let i = 1; i < n; i++) {
        const a = this.trailPts[i - 1], b = this.trailPts[i];
        const k = i / n;
        // only the outer part of the blade, so the smear looks like an arc
        const inner = 0.45;
        const ax = a.hx + (a.x - a.hx) * inner, ay = a.hy + (a.y - a.hy) * inner;
        const bx = b.hx + (b.x - b.hx) * inner, by = b.hy + (b.y - b.hy) * inner;
        this.trail.fillStyle(INK_FAINT, 0.55 * k);
        this.trail.fillPoints([{ x: ax, y: ay }, { x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: bx, y: by }] as unknown as Phaser.Math.Vector2[], true);
      }
      const last = this.trailPts[n - 1];
      this.trail.lineStyle(3, INK_SOFT, 0.6);
      this.trail.beginPath();
      this.trail.moveTo(this.trailPts[0].x, this.trailPts[0].y);
      for (const p of this.trailPts) this.trail.lineTo(p.x, p.y);
      this.trail.lineTo(last.x, last.y);
      this.trail.strokePath();
    }
  }

  destroy() {
    this.gfx.destroy();
    this.trail.destroy();
    this.zone.destroy();
  }
}
