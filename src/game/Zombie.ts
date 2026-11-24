import Phaser from 'phaser';
import { ACC, FIG, GROUND_Y, INK_SOFT } from './constants';
import { ZOMBIES, type ZombieDef, type ZombieSize } from './data';
import { drawFigure, ease, lerpPose, pose, BONES, type FigurePoints, type Pose, type ZombieVariant } from './figure';
import type { Player, Rect, SwingKind } from './Player';
import { sfx } from './sfx';

export type ZombieState = 'rising' | 'falling' | 'walk' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dying' | 'jumpWind' | 'jumpUp';

/** Low strike of the bigger zombies at a player who was already crouching (in base units, above the feet). */
const LOW_BAND: [number, number] = [70, 0];
/** How long a zombie stays angry after being hit from a ledge. */
const ANGER_SEC = 6;

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
  dustAt(x: number, y: number, n: number): void;
  /** Badminton zombies serve a shuttlecock at the player. */
  zombieShoot?(z: Zombie): void;
}

/** rise: out of the earth; emerge: walks out of a door/coffin/barrel; drop: falls from a ledge/window; parachute: floats down. */
export type SpawnMode = 'rise' | 'emerge' | 'drop' | 'parachute';

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
  /** Freeze perk: stuck to the ground until this time. */
  private frozenUntil = 0;
  /** Invisibility perk: the zombie doesn't see the player and just wanders about. */
  ignorePlayer = false;
  private wanderDir = Math.random() < 0.5 ? -1 : 1;
  private wanderT = 0;
  /** Hit while the player is invisible: strike back once in that direction. */
  private retaliateDir = 0;
  /** Dawn perk: crumbles to dust instead of falling dead. */
  ash = false;
  private shootCooldown = 1.5 + Math.random() * 2;
  /** This swing goes low: the player was already crouching when it started. */
  private aimLow = false;
  /** Hit from a ledge: until this time it jumps up at the player there. */
  private angryUntil = 0;
  /** The last strike was a jump attack: rest longer after landing. */
  private jumped = false;

  constructor(scene: Phaser.Scene, private host: ZombieHost, readonly size: ZombieSize, x: number, strength: number, readonly variant: ZombieVariant = 'plain', readonly spawn: SpawnMode = 'rise', startY = GROUND_Y) {
    this.def = ZOMBIES[size];
    this.scale = this.def.scale * FIG * (0.95 + Math.random() * 0.1);
    this.maxHp = Math.round(this.def.hp * strength);
    this.hp = this.maxHp;
    this.damage = Math.round(this.def.damage * (1 + (strength - 1) * 0.6));
    this.speed = this.def.speed * 1.15 * (1 + (strength - 1) * 0.25) * (0.9 + Math.random() * 0.2);
    const h = BASE_H * this.scale;
    this.zone = scene.add.zone(x, startY - h / 2, BASE_W * this.scale, h);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setAllowGravity(false);
    this.gfx = scene.add.graphics().setDepth(this.size === 'giant' ? 14 : 15 + Math.random());
    this.cur = pose({ ...Z_WALK_BASE, rot: 0 });
    if (spawn === 'rise') sfx.rise();
    if (spawn === 'drop' || spawn === 'parachute') {
      this.state = 'falling';
      this.body.setAllowGravity(true);
      if (spawn === 'parachute') this.body.setMaxVelocityY(95);
    }
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
    return this.alive && !(this.state === 'rising' && this.stateT < (this.spawn === 'emerge' ? 0.3 : 0.55));
  }

  hurtbox(): Rect {
    const w = BASE_W * this.scale;
    return { left: this.x - w / 2, right: this.x + w / 2, top: this.footY - this.height, bottom: this.footY };
  }

  get frozen() {
    return this.time < this.frozenUntil && this.alive;
  }

  freeze(sec: number) {
    if (!this.alive || this.state === 'rising' || this.state === 'falling') return;
    this.frozenUntil = this.time + sec;
    if (this.state === 'windup' || this.state === 'strike' || this.state === 'jumpWind' || this.state === 'jumpUp') this.setState('recover');
  }

  /** Dawn: turn to dust right away. */
  crumble() {
    if (!this.alive) return;
    this.hp = 0;
    this.ash = true;
    this.killedBy = 'low';
    this.chuteDrop = 0;
    this.setState('dying');
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, 0);
  }

  /** Hit by the player standing on a ledge above: jump up at them for a while. */
  anger() {
    this.angryUntil = this.time + ANGER_SEC;
  }

  /** Strike band (screen y: top < bottom) for a swing from the feet at `footY`. */
  private band(low: boolean, footY = this.footY) {
    const [top, bottom] = (low ? (this.size === 'small' ? this.def.attackBand : LOW_BAND) : this.def.attackBand).map((v) => v * FIG);
    return { top: footY - top, bottom: footY - bottom + (low ? 4 : 0) };
  }

  /** Does a standing swing from here reach the player's body vertically? */
  private reachesUp(player: Player) {
    const b = this.band(this.size === 'small');
    const hb = player.hurtbox();
    return b.top < hb.bottom && b.bottom > hb.top;
  }

  /** Returns true if this hit killed it. */
  takeHit(dmg: number, kind: SwingKind, dirX: number, knockback: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flashUntil = this.time + 0.12;
    if (this.ignorePlayer) this.retaliateDir = -dirX;
    if (this.hp <= 0) {
      this.killedBy = kind;
      this.setState('dying');
      this.body.setMaxVelocityY(1400); // a parachutist killed mid-air falls like a stone
      this.body.setAllowGravity(true);
      this.body.setVelocity(dirX * knockback * 1.1, -180);
      return true;
    }
    // After a stagger a zombie keeps pushing forward for a moment (poise), so spamming one button isn't enough.
    const staggers = (!this.def.heavy || kind === 'high') && this.time >= this.poiseUntil;
    if (staggers && this.state !== 'rising' && this.state !== 'falling') {
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

  private strike(low: boolean) {
    const reachFar = this.x + this.facing * (this.def.reach * FIG + PLAYER_HALF + 8);
    this.host.zombieStrike(this, { left: Math.min(this.x, reachFar), right: Math.max(this.x, reachFar), ...this.band(low) });
  }

  update(dt: number, player: Player) {
    this.time += dt;
    this.stateT += dt;
    const d = this.def;
    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    const lowAttack = this.size === 'small';

    if (this.frozen) {
      // Stuck to the ground: no moving, no attacking, pose held.
      this.body.setVelocityX(0);
      this.draw();
      return;
    }

    switch (this.state) {
      case 'falling': {
        this.body.setVelocityX(0);
        if (!player.dead) this.facing = dx >= 0 ? 1 : -1;
        if (this.body.blocked.down) {
          this.body.setMaxVelocityY(1400);
          this.host.dustAt(this.x, this.footY, this.spawn === 'parachute' ? 6 : 12);
          this.chuteDrop = this.spawn === 'parachute' ? 1 : 0;
          this.setState('recover');
        }
        break;
      }
      case 'rising': {
        this.body.setVelocity(0, 0);
        const riseT = this.spawn === 'emerge' ? 0.7 : 0.95;
        if (this.stateT >= riseT) {
          this.body.setAllowGravity(true);
          this.setState('walk');
        }
        break;
      }
      case 'walk': {
        if (this.retaliateDir) {
          // hit by something it can't see: swing back that way
          this.facing = this.retaliateDir;
          this.retaliateDir = 0;
          this.body.setVelocityX(0);
          this.setState('windup');
          sfx.zombieAttack();
          break;
        }
        if (this.ignorePlayer) {
          this.wanderT -= dt;
          const nearWall = (this.wanderDir < 0 && this.body.blocked.left) || (this.wanderDir > 0 && this.body.blocked.right);
          if (this.wanderT <= 0 || nearWall) {
            this.wanderDir = nearWall ? -this.wanderDir : Math.random() < 0.5 ? -1 : 1;
            this.wanderT = 1.2 + Math.random() * 2.5;
          }
          this.facing = this.wanderDir;
          this.body.setVelocityX(this.wanderDir * this.speed * 0.45 * (this.blocked ? 0.3 : 1));
          break;
        }
        if (!player.dead) this.facing = dx >= 0 ? 1 : -1;
        // The player standing on a ledge above (not just jumping): only swing if the blow really reaches.
        const onLedge = player.onGround && this.footY - player.footY > 20;
        const inReach = dist <= d.reach * FIG + PLAYER_HALF;
        const angry = this.time < this.angryUntil && onLedge && !player.dead;
        if (!player.dead && inReach && (Math.abs(player.footY - this.footY) < 140 * FIG || angry) && (!onLedge || this.reachesUp(player))) {
          this.body.setVelocityX(0);
          // already crouching when the swing starts: the bigger ones aim low (ducking only dodges a swing begun on a standing player)
          this.aimLow = !lowAttack && !onLedge && player.crouching;
          this.setState('windup');
          sfx.zombieAttack();
        } else if (angry && !lowAttack && this.size !== 'giant' && dist <= d.reach * FIG + PLAYER_HALF + 20 && this.body.blocked.down) {
          // hit from a ledge and can't reach: crouch, then jump up and strike
          this.body.setVelocityX(0);
          this.aimLow = false;
          this.setState('jumpWind');
          sfx.zombieAttack();
        } else {
          // Occasional lunge to close the distance (not the heavy ones).
          this.lungeCooldown -= dt;
          const near = dist < d.reach * FIG + 230 && dist > d.reach * FIG + 40;
          if (!d.heavy && near && this.lungeCooldown <= 0 && !this.blocked) {
            this.lungeUntil = this.time + 0.4;
            this.lungeCooldown = 2.5 + Math.random() * 3;
          }
          // v5 zombies: basketball players jump about, badminton players serve shuttlecocks from afar
          if (this.variant === 'basket' && this.body.blocked.down && Math.random() < dt * 0.6) this.body.setVelocityY(-760);
          this.shootCooldown -= dt;
          if (this.variant === 'badminton' && !player.dead && dist > 220 && dist < 820 && this.shootCooldown <= 0 && this.host.zombieShoot) {
            this.shootCooldown = 2.8 + Math.random() * 2.2;
            this.host.zombieShoot(this);
            this.body.setVelocityX(0);
            this.setState('recover');
            break;
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
          this.strike(lowAttack || this.aimLow);
          if (lowAttack || this.aimLow) this.body.setVelocityX(this.facing * 120);
        }
        break;
      }
      case 'jumpWind': {
        this.body.setVelocityX(0);
        if (this.stateT >= 0.4) {
          // jump just high enough for the strike band to meet the player's middle
          const hb = player.hurtbox();
          const [top, bottom] = d.attackBand.map((v) => v * FIG);
          const rise = Math.max(40, this.footY - (hb.top + hb.bottom) / 2 - (top + bottom) / 2);
          const g = this.body.gravity.y + (this.body.world?.gravity.y ?? 2000);
          this.body.setVelocity(Phaser.Math.Clamp(dx * 1.5, -260, 260), -Math.sqrt(2 * g * rise));
          this.jumped = true;
          this.setState('jumpUp');
        }
        break;
      }
      case 'jumpUp': {
        // strike at the top of the jump
        if (this.body.velocity.y >= -30 || this.stateT > 0.8) {
          this.setState('strike');
          this.strike(false);
        }
        break;
      }
      case 'strike': {
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT >= 0.22) this.setState('recover');
        break;
      }
      case 'recover': {
        if (this.jumped && !this.body.blocked.down) {
          // still falling back down from a jump attack
          this.stateT = 0;
          break;
        }
        this.body.setVelocityX(0);
        if (this.stateT >= (this.jumped ? 0.8 : 0.55)) {
          this.jumped = false;
          this.aimLow = false;
          this.setState('walk');
        }
        break;
      }
      case 'hurt': {
        this.body.setVelocityX(this.body.velocity.x * 0.86);
        if (this.stateT >= 0.3) this.setState('walk');
        break;
      }
      case 'dying': {
        if (this.body.blocked.down) this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > (this.ash ? 1.1 : 2.6)) {
          this.host.zombieGone(this);
          return;
        }
        break;
      }
    }

    if (this.chuteDrop > 0 && this.state !== 'falling') this.chuteDrop = Math.max(0, this.chuteDrop - dt * 1.2);
    this.cur = this.computePose(dt, lowAttack);
    this.draw();
  }

  private computePose(dt: number, lowAttack: boolean): Pose {
    const d = this.def;
    const smooth = (target: Pose, k: number) => lerpPose(this.cur, target, 1 - Math.exp(-dt * k));
    switch (this.state) {
      case 'falling':
        return smooth(pose({ ...Z_WALK_BASE, fUpper: 2.7, fFore: 2.9, bUpper: 2.5, bFore: 2.7, fThigh: 0.4, fShin: 0.1, bThigh: -0.2, bShin: -0.3 }), 8);
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
        const target = lowAttack || this.aimLow ? Z_WINDUP_LOW : Z_WINDUP_HIGH;
        // shiver a little right before striking
        const shake = t > 0.7 ? Math.sin(this.time * 70) * 0.05 : 0;
        const p = lerpPose(this.cur, target, t * 0.5 + 0.1);
        return { ...p, lean: p.lean + shake };
      }
      case 'strike':
        return smooth(lowAttack || this.aimLow ? Z_STRIKE_LOW : Z_STRIKE_HIGH, 40);
      case 'jumpWind':
        return smooth(pose({ ...Z_WINDUP_LOW, fUpper: 2.6, fFore: 2.9, bUpper: 2.4, bFore: 2.7 }), 14);
      case 'jumpUp':
        return smooth(Z_WINDUP_HIGH, 18);
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
    let alpha = 1;
    if (this.state === 'rising' && this.spawn === 'rise') {
      const t = Math.min(1, this.stateT / 0.95);
      sink = (1 - ease.out(t)) * (this.height + 10);
    } else if (this.state === 'rising') {
      alpha = Math.min(1, this.stateT / 0.5); // steps out of the dark doorway
    }
    if (this.spawn === 'parachute') this.drawChute(g);
    if (this.state === 'dying' && this.stateT > 1.9) alpha = Math.max(0, 1 - (this.stateT - 1.9) / 0.7);
    if (this.ash) {
      alpha = Math.max(0, 1 - this.stateT / 1.0);
      sink = this.stateT * this.stateT * 40;
    }
    this.lastPoints = drawFigure(g, this.x, this.footY + sink, this.facing, this.scale, this.cur, {
      kind: 'zombie',
      seed: this.seed,
      alpha,
      flash: this.time < this.flashUntil,
      headless: this.headless,
      variant: this.variant,
      ink: this.ash ? (this.stateT < 0.25 ? ACC.main : INK_SOFT) : undefined,
    });
    if (this.frozen) {
      // stuck to the ground: jagged crust around the feet, faint coloured film over the body
      const w = 30 * this.scale, f = this.footY;
      const left = Math.max(0, (this.frozenUntil - this.time) / 1.5);
      g.fillStyle(ACC.main, 0.12 * Math.min(1, left * 3));
      g.fillRoundedRect(this.x - w * 0.9, f - this.height * 1.02, w * 1.8, this.height * 1.02, 10);
      g.fillStyle(ACC.soft, 1);
      g.lineStyle(2.5, ACC.main, 1);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = this.x - w + (2 * w * i) / 8;
        pts.push({ x, y: f - (i % 2 ? 26 : 10) * this.scale * 0.8 });
      }
      pts.push({ x: this.x + w, y: f }, { x: this.x - w, y: f });
      g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
      g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
    }
    if (this.state === 'windup' && this.stateT > 0.08 && !this.aimLow) {
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

  /** 1 while the chute is collapsing after landing, 0 when gone. */
  private chuteDrop = 0;

  private drawChute(g: Phaser.GameObjects.Graphics) {
    const falling = this.state === 'falling';
    if (!falling && this.chuteDrop <= 0) return;
    const a = falling ? 1 : Math.max(0, this.chuteDrop);
    const top = this.footY - this.height - 70 * this.scale + (falling ? Math.sin(this.time * 3) * 3 : (1 - a) * 60);
    const w = 70 * this.scale;
    // torn canopy + strings to the hands
    g.fillStyle(0xf7f7f2, a);
    g.lineStyle(3, 0x111111, a);
    g.beginPath();
    g.arc(this.x, top + w * 0.5, w, Math.PI, 0, false);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.lineStyle(1.5, 0x111111, a);
    for (const k of [-1, -0.4, 0.4, 1]) g.lineBetween(this.x + k * w, top + w * 0.5, this.x + k * 8, this.footY - this.height * 0.75);
    // a couple of rips
    g.lineStyle(2, 0x111111, a);
    g.lineBetween(this.x - w * 0.3, top + w * 0.1, this.x - w * 0.2, top + w * 0.35);
    g.lineBetween(this.x + w * 0.45, top + w * 0.2, this.x + w * 0.35, top + w * 0.45);
  }

  destroy() {
    this.gfx.destroy();
    this.zone.destroy();
  }
}

const PLAYER_HALF = 17 * FIG;
