import Phaser from 'phaser';
import { ACC, ARENA_LEFT, ARENA_RIGHT, FIG, GROUND_Y, INK, INK_FAINT, INK_SOFT } from './constants';
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
  /** A or D held: guard with the sword. */
  block: boolean;
  /** Up arrow held (the ghost flies up). */
  up?: boolean;
}

/** Perks currently working on the player (set by the scene every frame). */
export interface PlayerPerks {
  sword: boolean;
  long: boolean;
  spear: boolean;
  berserk: boolean;
  invinc: boolean;
  ghost: boolean;
  invis: boolean;
  freeze: boolean;
}
export const NO_PERKS: PlayerPerks = { sword: false, long: false, spear: false, berserk: false, invinc: false, ghost: false, invis: false, freeze: false };
const LONG_MUL = 1.5;
const GHOST_SCALE = 1 / 1.5;
const BERSERK_TICK = 0.065;

export type HitResult = 'blocked' | 'hit' | 'ignored';
type AttackCtx = 'stand' | 'crouch' | 'air';

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
const TAU = Math.PI * 2;
const STANCE = { fThigh: 0.35, fShin: 0.05, bThigh: -0.35, bShin: -0.12 };
// Swing up #2: arm raised, the sword whirls a full circle over the head.
const SPIN_A = pose({ ...STANCE, lean: -0.08, fUpper: 2.85, fFore: 3.05, bUpper: -0.7, bFore: -0.3, weapon: 1.6 });
const SPIN_B = pose({ ...STANCE, lean: 0.05, fUpper: 2.75, fFore: 2.95, bUpper: -0.8, bFore: -0.4, weapon: 1.6 + TAU });
// Swing up #3: big backhand arc over the top, from behind to the front.
const BACK_A = pose({ ...STANCE, lean: -0.25, fUpper: 3.9, fFore: 4.2, bUpper: 0.6, bFore: 0.9, weapon: 4.6 });
const BACK_B = pose({ ...STANCE, lean: 0.3, fUpper: 1.75, fFore: 1.6, bUpper: -0.8, bFore: -0.5, weapon: 1.65 });
// Swing down #2: low whirl in front of the body.
const LSPIN_A = pose({ lean: 0.45, fThigh: 0.7, fShin: -0.1, bThigh: -0.5, bShin: -0.3, fUpper: 1.1, fFore: 1.0, bUpper: -0.6, bFore: -0.2, weapon: 0.3 });
const LSPIN_B = pose({ lean: 0.5, fThigh: 0.7, fShin: -0.1, bThigh: -0.5, bShin: -0.3, fUpper: 1.0, fFore: 0.95, bUpper: -0.6, bFore: -0.2, weapon: 0.3 + TAU });
// Swing down #3: low thrust with a step.
const STAB_A = pose({ ...STANCE, lean: -0.05, fUpper: -0.4, fFore: 0.6, bUpper: 0.4, bFore: 0.9, weapon: 1.2 });
const STAB_B = pose({ lean: 0.7, head: -0.2, fThigh: 0.9, fShin: -0.1, bThigh: -0.6, bShin: -0.4, fUpper: 1.2, fFore: 1.15, bUpper: -0.9, bFore: -0.6, weapon: 1.05 });
// Crouched: uppercut from the crouch (W) and a sweep along the ground (S).
const CHIGH_A = pose({ ...P_CROUCH, fUpper: 0.4, fFore: 0.3, weapon: 0.2 });
const CHIGH_B = pose({ ...P_CROUCH, lean: 0.25, head: 0, fUpper: 2.5, fFore: 2.7, weapon: 3.0 });
const CLOW_A = pose({ ...P_CROUCH, fUpper: -0.4, fFore: -0.9, weapon: -1.45 });
const CLOW_B = pose({ ...P_CROUCH, lean: 0.95, fUpper: 1.05, fFore: 1.45, weapon: 1.52 });
// In the air: cleave from above (W) and a downward stab under the feet (S).
const AIRH_A = pose({ ...P_JUMP, fUpper: 3.0, fFore: 3.3, weapon: 3.6 });
const AIRH_B = pose({ ...P_JUMP, lean: 0.5, fUpper: 1.2, fFore: 1.0, weapon: 0.9 });
const AIRL_A = pose({ ...P_JUMP, lean: -0.1, fUpper: 2.6, fFore: 2.9, weapon: 2.6 });
const AIRL_B = pose({ lean: 0.25, fThigh: 1.3, fShin: 0.2, bThigh: 0.9, bShin: -0.3, fUpper: 0.25, fFore: 0.1, bUpper: -1.2, bFore: -0.8, weapon: 0.02, lift: 6 });
// Guard and flip.
const P_BLOCK = pose({ lean: -0.1, fThigh: 0.35, fShin: 0.1, bThigh: -0.4, bShin: -0.2, fUpper: 1.0, fFore: 2.3, bUpper: 0.6, bFore: 2.0, weapon: 3.0 });
const P_CBLOCK = pose({ ...P_CROUCH, fUpper: 1.1, fFore: 2.4, bUpper: 0.6, bFore: 2.1, weapon: 3.1 });
const P_TUCK = pose({ lean: 0.6, head: 0.3, fThigh: 2.0, fShin: 0.3, bThigh: 1.7, bShin: 0.0, fUpper: 1.2, fFore: 2.4, bUpper: 0.8, bFore: 2.2, weapon: 2.4 });

const STAND_HIGH: [Pose, Pose][] = [[HIGH_A, HIGH_B], [SPIN_A, SPIN_B], [BACK_A, BACK_B]];
const STAND_LOW: [Pose, Pose][] = [[LOW_A, LOW_B], [LSPIN_A, LSPIN_B], [STAB_A, STAB_B]];

/**
 * Shield points spent per point of blocked damage. Lvl-1 medium zombie (12 dmg -> 40.8 per block): with the slow
 * regen while guarding (8/s, ~10 per attack cycle) two blocks hold and the 3rd breaks through.
 */
const BLOCK_COST = 3.4;
const SHIELD_REGEN_DELAY = 1.5;
const SHIELD_REGEN = 24;
const SHIELD_REGEN_SLOW = 12;
const SHIELD_REGEN_GUARD = 8;
const FLIP_TIME = 0.5;

export interface PlayerHost {
  playerSwing(player: Player, kind: SwingKind, box: Rect, hitOnce: Set<unknown>): void;
  playerDied(player: Player): void;
  dustAt(x: number, y: number, n: number): void;
  /** Distance from x to the nearest hittable zombie's near edge in direction dir, or null. */
  nearestAhead(x: number, dir: number): number | null;
  throwSpear(player: Player, kind: SwingKind, x: number, y: number): void;
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
  private attack: {
    kind: SwingKind;
    ctx: AttackCtx;
    variant: number;
    t: number;
    hit: Set<unknown>;
    swung: boolean;
    lunge: boolean;
    /** A spear throw: just a pose, the spear does the hitting. */
    throw?: boolean;
  } | null = null;
  fx: PlayerPerks = { ...NO_PERKS };
  private berserkT = 0;
  private wasGhost = false;
  maxShield = 100;
  shield = 100;
  blocking = false;
  flipping = false;
  /** Time of the last shield break (for the HUD flash). */
  shieldBrokeAt = -9;
  private lastBlockAt = -9;
  private blockFlashUntil = 0;
  private flipT = 0;
  private flipUsed = false;
  /** 0..1 how far the shield is unfolded. */
  private guard = 0;
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
  get shieldBrokenRecently() {
    return this.time - this.shieldBrokeAt < 1.2;
  }
  get invulnerable() {
    return this.god || this.time < this.invulnUntil || this.dead;
  }

  /** Drawing / hurtbox scale: the ghost is smaller. */
  get sizeMul() {
    return this.fx.ghost ? GHOST_SCALE : 1;
  }
  /** Weapon reach multiplier (long sword). */
  get reachMul() {
    return this.fx.long ? LONG_MUL : 1;
  }

  hurtbox(): Rect {
    const h = (this.crouching ? PLAYER_CROUCH_H : PLAYER_H) * this.sizeMul;
    const w = PLAYER_W * this.sizeMul;
    return { left: this.x - w / 2, right: this.x + w / 2, top: this.footY - h, bottom: this.footY };
  }

  /** Berserk: the whirl hits all around the player. */
  whirlBox(): Rect {
    const r = this.weapon.range * FIG * this.reachMul * 1.05;
    const f = this.footY;
    return { left: this.x - r, right: this.x + r, top: f - 140 * FIG * this.sizeMul, bottom: f + 6 };
  }

  swingBox(kind: SwingKind, crouched: boolean, ctx: AttackCtx = crouched ? 'crouch' : 'stand'): Rect {
    const near = this.x - this.facing * 10;
    const far = this.x + this.facing * this.weapon.range * FIG * this.reachMul;
    const f = this.footY;
    let top: number, bottom: number;
    if (ctx === 'air') {
      if (kind === 'low') {
        // downward stab: under and slightly in front of the player
        const cx = this.x + this.facing * 12;
        return { left: cx - 40 * FIG, right: cx + 40 * FIG, top: f - 30 * FIG, bottom: f + 95 * FIG };
      }
      [top, bottom] = [f - 130 * FIG, f - 15 * FIG];
    } else if (crouched) {
      [top, bottom] = kind === 'high' ? [f - 80 * FIG, f - 28 * FIG] : [f - 50 * FIG, f + 4];
    } else {
      [top, bottom] = kind === 'high' ? [f - 132 * FIG, f - 72 * FIG] : [f - 70 * FIG, f + 4];
    }
    return { left: Math.min(near, far), right: Math.max(near, far), top, bottom };
  }

  damage(amount: number, fromDir: number): HitResult {
    if (this.invulnerable) return 'ignored';
    if (this.fx.ghost) return 'ignored'; // blows pass right through a ghost
    if (this.fx.invinc) {
      this.blockFlashUntil = this.time + 0.2;
      this.body.setVelocityX(fromDir * 160);
      sfx.block();
      return 'ignored';
    }
    if (this.fx.berserk) {
      // Berserk takes the hit but keeps whirling: no stagger, no knockback.
      this.hp = Math.max(0, this.hp - amount);
      this.invulnUntil = this.time + 0.5;
      sfx.playerHurt();
      if (this.hp <= 0) this.die(fromDir);
      return 'hit';
    }
    if (this.blocking) {
      const cost = amount * BLOCK_COST;
      this.lastBlockAt = this.time;
      if (this.shield >= cost) {
        this.shield -= cost;
        this.blockFlashUntil = this.time + 0.15;
        this.body.setVelocityX(fromDir * 260);
        sfx.block();
        return 'blocked';
      }
      // Guard broken: the hit goes through.
      this.shield = 0;
      this.shieldBrokeAt = this.time;
      sfx.guardBreak();
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = this.time + 0.9;
    this.hurtUntil = this.time + 0.28;
    this.attack = null;
    this.blocking = false;
    this.body.setVelocity(fromDir * 260, -260);
    sfx.playerHurt();
    if (this.hp <= 0) this.die(fromDir);
    return 'hit';
  }

  private die(fromDir: number) {
    this.dead = true;
    this.deadT = 0;
    this.body.setAllowGravity(true);
    this.body.setVelocityX(fromDir * 200);
    this.host.playerDied(this);
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  update(dt: number, input: PlayerInput) {
    this.time += dt;
    const onGround = this.onGround;
    if (onGround) this.lastGroundAt = this.time;
    if (onGround) this.flipUsed = false;
    if (this.flipping && (onGround || this.flipT > FLIP_TIME + 0.25)) {
      this.flipping = false;
      this.cur = { ...this.cur, rot: 0 };
    }
    if (this.flipping) this.flipT += dt;
    // Shield regenerates after a short pause without blocking.
    // Shield always refills: slowly while guarding, faster after a pause without blocks.
    const regen = this.blocking ? SHIELD_REGEN_GUARD : this.time - this.lastBlockAt > SHIELD_REGEN_DELAY ? SHIELD_REGEN : SHIELD_REGEN_SLOW;
    // ...except right after a guard break: then it stays empty for a moment.
    if (this.time - this.shieldBrokeAt > SHIELD_REGEN_DELAY) this.shield = Math.min(this.maxShield, this.shield + regen * dt);
    this.guard += ((this.blocking ? 1 : 0) - this.guard) * Math.min(1, dt * 12);
    if (onGround && !this.wasOnGround && !this.dead) {
      this.cur = { ...this.cur, lift: -4 };
      this.host.dustAt(this.x, this.footY, 8);
    }
    this.wasOnGround = onGround;

    if (this.fx.ghost !== this.wasGhost && !this.dead) {
      this.wasGhost = this.fx.ghost;
      this.body.setAllowGravity(!this.fx.ghost);
      if (this.fx.ghost) {
        this.flipping = false;
        this.cur = { ...this.cur, rot: 0 };
      }
    }
    if (this.dead) {
      this.deadT += dt;
      if (onGround) this.body.setVelocityX(this.body.velocity.x * 0.9);
      this.cur = lerpPose(this.cur, P_DEAD, 1 - Math.exp(-dt * 8));
      this.draw();
      return;
    }

    const hurt = this.time < this.hurtUntil;
    const locked = this.time < this.lockUntil;
    const ghost = this.fx.ghost;
    this.crouching = input.down && onGround && !hurt && !ghost;
    this.blocking = input.block && onGround && !hurt && !this.attack && !this.flipping && !this.fx.berserk;
    if (ghost) {
      // Fly: up / down arrows move vertically, no gravity.
      const vy = (input.up || input.jumpPressed ? -1 : 0) + (input.down ? 1 : 0);
      this.body.setVelocityY(Phaser.Math.Linear(this.body.velocity.y, vy * SPEED, Math.min(1, 12 * dt)));
      if (this.body.top < 70 && this.body.velocity.y < 0) this.body.setVelocityY(0);
    }

    // Horizontal movement.
    if (!hurt && !locked) {
      let dirX = 0;
      if (input.left) dirX -= 1;
      if (input.right) dirX += 1;
      if (dirX !== 0 && !this.attack) this.facing = dirX;
      let speed = SPEED;
      if (this.crouching) speed = 0;
      else if (this.blocking) speed *= 0.35;
      else if (this.attack && onGround) speed *= 0.3;
      const target = dirX * speed;
      const accel = onGround ? 18 : 9;
      this.body.setVelocityX(Phaser.Math.Linear(this.body.velocity.x, target, Math.min(1, accel * dt)));
    } else if (onGround && hurt) {
      this.body.setVelocityX(this.body.velocity.x * 0.88);
    }
    // Lunge: the target is a bit too far, take a step into the swing.
    if (this.attack?.lunge && this.attack.t < 0.5 && onGround) this.body.setVelocityX(this.facing * 430);

    // Jumping (with a little buffer + coyote time so it feels fair).
    if (input.jumpPressed) this.jumpBufferedAt = this.time;
    const wantsJump = this.time - this.jumpBufferedAt < 0.12;
    if (wantsJump && !hurt && !ghost) {
      const touchingLeft = this.body.blocked.left || this.body.left <= ARENA_LEFT + 2;
      const touchingRight = this.body.blocked.right || this.body.right >= ARENA_RIGHT - 2;
      if (onGround || this.time - this.lastGroundAt < 0.09) {
        this.body.setVelocityY(-JUMP_V);
        this.jumpBufferedAt = -1;
        this.lastGroundAt = -1;
        sfx.jump();
        this.host.dustAt(this.x, this.footY, 5);
      } else if (input.jumpPressed && !touchingLeft && !touchingRight && !this.flipUsed && !this.flipping && (input.left || input.right)) {
        // Flip: a somersault that flies further and passes through zombies.
        const dir = input.left && input.right ? this.facing : input.right ? 1 : -1;
        this.flipping = true;
        this.flipUsed = true;
        this.flipT = 0;
        this.attack = null;
        this.facing = dir;
        this.body.setVelocity(dir * 560, Math.min(this.body.velocity.y, -520));
        this.lockUntil = this.time + FLIP_TIME;
        this.jumpBufferedAt = -1;
        sfx.flip();
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

    // Berserk: a non-stop whirl that hits on both sides, five times faster than a swing.
    if (this.fx.berserk) {
      this.attack = null;
      this.berserkT -= dt;
      if (this.berserkT <= 0) {
        this.berserkT = BERSERK_TICK;
        this.host.playerSwing(this, Math.random() < 0.5 ? 'high' : 'low', this.whirlBox(), new Set());
        if (Math.random() < 0.35) sfx.swing(this.weapon.id === 'axe');
      }
    }
    // Spear: W / S throw a spear instead of swinging.
    if (this.fx.spear && !this.fx.berserk && !this.attack && !hurt && !this.flipping && this.time >= this.nextAttackAt && (input.swingHigh || input.swingLow)) {
      const kind: SwingKind = input.swingHigh ? 'high' : 'low';
      const hb = this.hurtbox();
      const y = kind === 'high' ? hb.top + (hb.bottom - hb.top) * 0.2 : hb.top + (hb.bottom - hb.top) * 0.62;
      this.host.throwSpear(this, kind, this.x + this.facing * 20, y);
      this.attack = { kind: 'low', ctx: 'stand', variant: 2, t: this.weapon.activeFrom, hit: new Set(), swung: true, lunge: false, throw: true };
      this.nextAttackAt = this.time + 0.35;
      input = { ...input, swingHigh: false, swingLow: false };
    }
    // Attacks.
    if (!this.attack && !hurt && !this.flipping && !this.fx.berserk && this.time >= this.nextAttackAt && (input.swingHigh || input.swingLow)) {
      const kind: SwingKind = input.swingHigh ? 'high' : 'low';
      const ctx: AttackCtx = !onGround ? 'air' : this.crouching ? 'crouch' : 'stand';
      let lunge = false;
      if (ctx === 'stand') {
        const d = this.host.nearestAhead(this.x, this.facing);
        const reach = this.weapon.range * FIG * this.reachMul;
        lunge = d !== null && d > reach - 12 && d < reach + 80;
      }
      this.attack = { kind, ctx, variant: Math.floor(Math.random() * 3), t: 0, hit: new Set(), swung: false, lunge };
      this.blocking = false;
      this.nextAttackAt = this.time + this.weapon.swingMs / 1000 + 0.04;
      this.trailPts = [];
      if (ctx === 'air' && kind === 'low' && !ghost) this.body.setVelocityY(Math.max(this.body.velocity.y, 0) + 380);
    }
    if (this.attack) {
      const a = this.attack;
      a.t += (dt * 1000) / this.weapon.swingMs;
      if (!a.swung && a.t >= this.weapon.activeFrom * 0.7) {
        a.swung = true;
        sfx.swing(this.weapon.id === 'axe');
      }
      if (!a.throw && a.t >= this.weapon.activeFrom && a.t <= this.weapon.activeTo) {
        this.host.playerSwing(this, a.kind, this.swingBox(a.kind, a.ctx === 'crouch', a.ctx), a.hit);
      }
      if (a.t >= 1) this.attack = null;
    }

    // Pose.
    if (this.fx.berserk && !hurt) {
      const spin = this.time * 26;
      const legs = onGround && Math.abs(this.body.velocity.x) > 30 ? this.walkPose(dt) : P_IDLE;
      this.cur = { ...legs, lean: 0.05 + Math.sin(this.time * 9) * 0.1, fUpper: 2.4 + Math.sin(spin) * 0.6, fFore: 2.6 + Math.sin(spin) * 0.6, bUpper: -1.6, bFore: -1.2, weapon: spin, rot: 0 };
      // the whirl draws its smear with the normal trail
      this.draw();
      return;
    }
    if (this.attack) {
      const a = this.attack;
      const [A, B] =
        a.ctx === 'crouch' ? (a.kind === 'high' ? [CHIGH_A, CHIGH_B] : [CLOW_A, CLOW_B])
        : a.ctx === 'air' ? (a.kind === 'high' ? [AIRH_A, AIRH_B] : [AIRL_A, AIRL_B])
        : a.kind === 'high' ? STAND_HIGH[a.variant] : STAND_LOW[a.variant];
      // quick wind-up into A, fast swing to B, settle.
      let p: Pose;
      const w = this.weapon.activeFrom;
      if (a.t < w) p = lerpPose(this.cur, A, ease.out(a.t / w));
      else if (a.t < this.weapon.activeTo) p = lerpPose(A, B, ease.out((a.t - w) / (this.weapon.activeTo - w)));
      else p = B;
      if (!onGround && a.ctx !== 'air') p = { ...p, fThigh: P_JUMP.fThigh, fShin: P_JUMP.fShin, bThigh: P_JUMP.bThigh, bShin: P_JUMP.bShin };
      this.cur = p;
    } else {
      let target: Pose;
      if (this.flipping) {
        // Tuck and spin a full turn.
        const r = Math.min(1, this.flipT / FLIP_TIME) * TAU;
        this.cur = { ...lerpPose(this.cur, P_TUCK, 1 - Math.exp(-dt * 30)), rot: r };
        this.draw();
        return;
      }
      if (hurt) target = P_HURT;
      else if (this.blocking) target = this.crouching ? P_CBLOCK : P_BLOCK;
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
    // A flip rotates around the body's centre, not around the feet.
    let ox = 0, oy = 0;
    if (this.flipping) {
      const r = this.cur.rot, h = 32;
      ox = -h * Math.sin(r) * this.facing * FIG;
      oy = (-h + h * Math.cos(r)) * FIG;
    }
    const fx = this.fx;
    const sc = FIG * this.sizeMul;
    const fy = this.footY + oy + (fx.ghost ? Math.sin(this.time * 4) * 4 : 0);
    this.trail.clear();
    if (fx.ghost) {
      // haze around the floating ghost
      for (let i = 0; i < 5; i++) {
        const a = this.time * 2 + i * 1.3;
        this.trail.fillStyle(ACC.main, 0.12);
        this.trail.fillCircle(this.x + Math.cos(a) * 16, fy - 50 * sc + Math.sin(a * 1.3) * 26, 26 * sc + i * 2);
      }
    }
    const pts = drawFigure(g, this.x + ox, fy, this.facing, sc, this.cur, {
      kind: 'player',
      weapon: this.weapon.id,
      headgear: this.profile.headgear,
      time: this.time,
      vx: this.body.velocity.x,
      alpha: blink ? 0.35 : fx.invis ? 0.45 : fx.ghost ? 0.75 : 1,
      weaponScale: (1 - this.guard) * this.reachMul,
      ink: fx.invis ? ACC.main : undefined,
      fill: fx.invis ? ACC.soft : undefined,
    });
    if (fx.long && this.guard < 0.5) {
      // accent edge on the stretched blade
      g.lineStyle(2.5, ACC.main, 0.9);
      g.lineBetween(pts.hand.x + (pts.tip.x - pts.hand.x) * 0.3, pts.hand.y + (pts.tip.y - pts.hand.y) * 0.3, pts.tip.x, pts.tip.y);
    }
    if (fx.invinc) {
      // the cocoon
      const hb = this.hurtbox();
      const cy = (hb.top + hb.bottom) / 2 - 6;
      const pulse = 1 + Math.sin(this.time * 6) * 0.04 + (this.time < this.blockFlashUntil ? 0.08 : 0);
      g.fillStyle(ACC.main, 0.13);
      g.fillEllipse(this.x, cy, 110 * FIG * pulse, 175 * FIG * pulse);
      g.lineStyle(5, ACC.main, 0.85);
      g.strokeEllipse(this.x, cy, 110 * FIG * pulse, 175 * FIG * pulse);
      g.lineStyle(2, INK, 0.7);
      g.strokeEllipse(this.x, cy, 120 * FIG * pulse, 186 * FIG * pulse);
    }
    if (fx.berserk) {
      const hb = this.hurtbox();
      const cy = hb.top + (hb.bottom - hb.top) * 0.35;
      const R = this.weapon.range * FIG * this.reachMul * 0.75;
      for (let i = 0; i < 3; i++) {
        const a0 = this.time * 20 + i * 2.1;
        this.trail.lineStyle(6 - i, ACC.main, 0.55 - i * 0.12);
        this.trail.beginPath();
        this.trail.arc(this.x, cy, R - i * 10, a0, a0 + 1.8, false);
        this.trail.strokePath();
      }
    }
    // The sword folds away and a curved shield unfolds up and down in front of the hands.
    if (this.guard > 0.04) {
      const k = ease.out(this.guard);
      const R = 46 * FIG;
      const span = 1.05 * k;
      const cx = pts.hand.x - this.facing * R * 0.55;
      const cy = pts.hand.y + 4;
      const base = this.facing > 0 ? 0 : Math.PI;
      const flash = this.time < this.blockFlashUntil;
      g.lineStyle((flash ? 13 : 10) * FIG * k, INK, blink ? 0.35 : 1);
      g.beginPath();
      g.arc(cx, cy, R, base - span, base + span, false);
      g.strokePath();
      g.lineStyle(2.5, 0xffffff, 0.9 * k);
      g.beginPath();
      g.arc(cx, cy, R - 1, base - span * 0.8, base + span * 0.8, false);
      g.strokePath();
      // rim studs
      g.fillStyle(0xffffff, k);
      for (const a of [-0.6, 0, 0.6]) g.fillCircle(cx + Math.cos(base + a * span) * R, cy + Math.sin(base + a * span) * R, 2.2 * FIG);
    }
    // Weapon swoosh.
    if ((this.attack && !this.attack.throw && this.attack.t > this.weapon.activeFrom * 0.8) || fx.berserk) {
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
        this.trail.fillStyle(fx.sword || fx.berserk ? ACC.main : INK_FAINT, (fx.sword ? 0.7 : 0.55) * k);
        this.trail.fillPoints([{ x: ax, y: ay }, { x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: bx, y: by }] as unknown as Phaser.Math.Vector2[], true);
      }
      const last = this.trailPts[n - 1];
      this.trail.lineStyle(3, fx.sword ? ACC.dark : INK_SOFT, 0.6);
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
