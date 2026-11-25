import Phaser from 'phaser';
import { HEIGHT, INK, PAPER, WIDTH } from './constants';
import { handsSwapped } from './touch';

/**
 * On-screen controls for phones and tablets.
 *  - one side: a floating stick (it appears where the thumb lands): sideways = walk, down = duck, up = jump;
 *  - the other side: two swing buttons one above the other at the edge (top = swing up, bottom = swing down)
 *    and the block button further in. Each owns a whole zone: the upper / lower part of the edge strip,
 *    everything between it and the middle of the screen is block — hard to miss;
 *  - taps on the perk bar switch a perk on, the pause button pauses.
 * Listens to the whole window, not just the canvas: on a wide phone the thumbs rest on the black bars
 * at the sides of the game picture.
 */

const STICK_R = 78; // how far the knob travels
const BTN_R = 64;
/** Fight side zones (on the right; mirrored when the hands are swapped): x of the swing strip, y between up and down. */
const SWING_X = 1095;
const SWING_SPLIT_Y = 532;
/** Ease the thumb off this much (from the highest point) and push again = the second jump: flip / wall bounce. */
const REARM = STICK_R * 0.35;
/** The stick when nobody touches it: where to look for it. */
const STICK_HOME = { x: 190, y: 585 };
const BUTTONS = [
  { id: 'high', x: 1188, y: 450 },
  { id: 'low', x: 1188, y: 615 },
  { id: 'block', x: 1010, y: 615 },
] as const;
type ButtonId = (typeof BUTTONS)[number]['id'];

export interface TouchHost {
  /** Perk bar slot centre (screen space) and how many slots. */
  perkSlot(i: number): { x: number; y: number };
  perkSlots: number;
  onPerk(i: number): void;
  onPause(): void;
  /** Pause button centre (screen space). */
  pauseAt: { x: number; y: number };
}

export interface TouchState {
  left: boolean;
  right: boolean;
  down: boolean;
  up: boolean;
  jumpPressed: boolean;
  swingHigh: boolean;
  swingLow: boolean;
  block: boolean;
}

export class TouchControls {
  private g: Phaser.GameObjects.Graphics;
  private swap = handsSwapped();
  private stick: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private held = new Map<number, ButtonId>();
  private swings: ButtonId[] = [];
  /** Jump edge from the stick: armed -> fires -> eases off a bit -> armed again. */
  private armed = true;
  private peakDy = 0;
  private rearmDy = 0;
  private flash = new Map<ButtonId, number>();
  private off: () => void;

  constructor(private scene: Phaser.Scene, private host: TouchHost) {
    this.g = scene.add.graphics().setDepth(150).setScrollFactor(0);
    const down = (e: PointerEvent) => this.down(e);
    const move = (e: PointerEvent) => this.move(e);
    const up = (e: PointerEvent) => this.up(e);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.off = () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  destroy() {
    this.off();
    this.g.destroy();
  }

  /** Let go of everything (pause, resume, the level ends). */
  reset() {
    this.swap = handsSwapped();
    this.stick = null;
    this.held.clear();
    this.swings = [];
    this.armed = true;
    this.rearmDy = 0;
  }

  /** Mirror x when the hands are swapped. */
  private mx(x: number) {
    return this.swap ? WIDTH - x : x;
  }

  /** Window point -> game screen coordinates (may be outside 0…WIDTH on the black bars). */
  private toGame(e: PointerEvent) {
    const r = this.scene.game.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * WIDTH) / r.width, y: ((e.clientY - r.top) * HEIGHT) / r.height };
  }

  private active() {
    return this.scene.sys.isActive();
  }

  /** Which fight button owns this point (a zone, not just the circle). */
  private zoneAt(x: number, y: number): ButtonId | null {
    const fx = this.mx(x);
    if (y < 135 || fx < WIDTH / 2) return null;
    if (fx >= SWING_X) return y < SWING_SPLIT_Y ? 'high' : 'low';
    return 'block';
  }

  private press(id: ButtonId) {
    if (id !== 'block') this.swings.push(id);
    this.flash.set(id, this.scene.time.now);
  }

  private down(e: PointerEvent) {
    if (e.pointerType !== 'touch' || !this.active()) return;
    const { x, y } = this.toGame(e);
    const h = this.host;
    // pause button (top right)
    if (Math.hypot(x - h.pauseAt.x, y - h.pauseAt.y) < 52) {
      this.reset();
      h.onPause();
      return;
    }
    // perk bar (top middle)
    if (y < 135) {
      for (let i = 0; i < h.perkSlots; i++) {
        const s = h.perkSlot(i);
        if (Math.abs(x - s.x) < 24 && Math.abs(y - s.y) < 42) {
          h.onPerk(i);
          return;
        }
      }
      return;
    }
    const stickSide = this.swap ? x > WIDTH / 2 : x < WIDTH / 2;
    if (stickSide) {
      if (this.stick) return;
      this.stick = { id: e.pointerId, bx: x, by: y, x, y };
      return;
    }
    const b = this.zoneAt(x, y);
    if (!b) return;
    this.held.set(e.pointerId, b);
    this.press(b);
  }

  private move(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    const { x, y } = this.toGame(e);
    const s = this.stick;
    if (s && s.id === e.pointerId) {
      s.x = x;
      s.y = y;
      // pulled past the edge sideways or down: the stick follows the thumb. Not up: then the second
      // push (flip) would need the thumb to travel all the way back first.
      const dx = x - s.bx;
      const dy = y - s.by;
      if (Math.abs(dx) > STICK_R) s.bx = x - Math.sign(dx) * STICK_R;
      if (dy > STICK_R) s.by = y - STICK_R;
      return;
    }
    // sliding the thumb from one button onto another presses that one
    const was = this.held.get(e.pointerId);
    if (was) {
      const b = this.zoneAt(x, y);
      if (b && b !== was) {
        this.held.set(e.pointerId, b);
        this.press(b);
      }
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    if (this.stick?.id === e.pointerId) this.stick = null;
    this.held.delete(e.pointerId);
  }

  /** What the fingers say this frame. Swing presses are handed out once. */
  read(): TouchState {
    const st: TouchState = { left: false, right: false, down: false, up: false, jumpPressed: false, swingHigh: false, swingLow: false, block: false };
    const s = this.stick;
    if (s) {
      const dx = s.x - s.bx;
      const dy = s.y - s.by;
      st.left = dx < -STICK_R * 0.3;
      st.right = dx > STICK_R * 0.3;
      // up / down only when the thumb clearly goes that way (running with a wobbly thumb doesn't jump)
      st.up = dy < -STICK_R * 0.5 && -dy > Math.abs(dx) * 0.6;
      st.down = dy > STICK_R * 0.5 && dy > Math.abs(dx) * 0.8;
      // jump: push up. Second jump (flip in the air, wall bounce): ease off a little and push again.
      if (this.armed) {
        if (st.up && dy < Math.min(-STICK_R * 0.5, this.rearmDy - REARM * 0.7)) {
          st.jumpPressed = true;
          this.armed = false;
          this.peakDy = dy;
        }
      } else {
        this.peakDy = Math.min(this.peakDy, dy);
        if (dy > this.peakDy + REARM) {
          this.armed = true;
          this.rearmDy = dy;
        }
      }
    } else {
      this.armed = true;
      this.rearmDy = 0;
    }
    for (const b of this.swings.splice(0)) {
      if (b === 'high') st.swingHigh = true;
      else st.swingLow = true;
    }
    for (const b of this.held.values()) if (b === 'block') st.block = true;
    return st;
  }

  draw() {
    const g = this.g;
    g.clear();
    const now = this.scene.time.now;
    // the stick
    const s = this.stick;
    const bx = s ? Phaser.Math.Clamp(s.bx, STICK_R, WIDTH - STICK_R) : this.mx(STICK_HOME.x);
    const by = s ? Phaser.Math.Clamp(s.by, 140 + STICK_R, HEIGHT - 20) : STICK_HOME.y;
    g.fillStyle(PAPER, s ? 0.35 : 0.2);
    g.fillCircle(bx, by, STICK_R + 22);
    g.lineStyle(4, INK, s ? 0.45 : 0.22);
    g.strokeCircle(bx, by, STICK_R + 22);
    let kx = bx;
    let ky = by;
    if (s) {
      const dx = s.x - s.bx;
      const dy = s.y - s.by;
      const d = Math.min(STICK_R, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      kx += dx * d;
      ky += dy * d;
    }
    g.fillStyle(INK, s ? 0.5 : 0.22);
    g.fillCircle(kx, ky, 34);
    // the buttons
    const heldIds = new Set(this.held.values());
    for (const b of BUTTONS) {
      const x = this.mx(b.x);
      const lit = heldIds.has(b.id) || now - (this.flash.get(b.id) ?? -1e9) < 120;
      g.fillStyle(lit ? INK : PAPER, lit ? 0.45 : 0.3);
      g.fillCircle(x, b.y, BTN_R);
      g.lineStyle(4, INK, lit ? 0.7 : 0.4);
      g.strokeCircle(x, b.y, BTN_R);
      this.icon(b.id, x, b.y, lit);
    }
  }

  private icon(id: ButtonId, x: number, y: number, lit: boolean) {
    const g = this.g;
    const c = lit ? PAPER : INK;
    const a = lit ? 0.95 : 0.6;
    g.lineStyle(7, c, a);
    if (id === 'block') {
      // a shield
      g.beginPath();
      g.moveTo(x - 24, y - 26);
      g.lineTo(x + 24, y - 26);
      g.lineTo(x + 22, y + 4);
      g.lineTo(x, y + 28);
      g.lineTo(x - 22, y + 4);
      g.closePath();
      g.strokePath();
      return;
    }
    // a swing arc with an arrow head: up (swing up) or down (swing down)
    const dir = id === 'high' ? -1 : 1;
    const ex = x + 20;
    const ey = y + dir * 22;
    g.beginPath();
    g.moveTo(x - 24, y - dir * 18);
    g.lineTo(x - 4, y - dir * 2);
    g.lineTo(ex - 6, ey - dir * 6);
    g.strokePath();
    g.fillStyle(c, a);
    // head pointing along (ex, ey) direction: roughly diagonal
    g.fillTriangle(ex + 6, ey + dir * 6, ex - 14, ey + dir * 2, ex + 2, ey - dir * 14);
  }
}
