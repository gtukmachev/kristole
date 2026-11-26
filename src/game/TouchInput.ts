import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './constants';
import { handsSwapped } from './touch';

/**
 * Common part of every touch scheme: listens to the whole window (on a wide phone the thumbs rest on
 * the black bars at the sides of the picture), turns window points into game coordinates, and handles
 * the pause button and the perk bar at the top. The scheme itself decides what the other touches do.
 */

export interface TouchHost {
  /** Perk bar slot centre (screen space) and how many slots. */
  perkSlot(i: number): { x: number; y: number };
  perkSlots: number;
  onPerk(i: number): void;
  onPause(): void;
  /** Pause button centre (screen space); null = no pause button. */
  pauseAt: { x: number; y: number } | null;
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

export const emptyTouch = (): TouchState => ({ left: false, right: false, down: false, up: false, jumpPressed: false, swingHigh: false, swingLow: false, block: false });

/** Touches above this line belong to the top bar (perks, pause, the Controls screen header). */
export const TOP_BAR_Y = 135;

export interface TouchOptions {
  /** Drawn in the world (moves with the camera: the Controls screen slides) instead of fixed on screen. */
  inWorld?: boolean;
}

export abstract class TouchInput {
  protected g: Phaser.GameObjects.Graphics;
  protected swap = handsSwapped();
  private off: () => void;

  constructor(protected scene: Phaser.Scene, protected host: TouchHost, opts: TouchOptions = {}) {
    this.g = scene.add.graphics().setDepth(150).setScrollFactor(opts.inWorld ? 1 : 0);
    const down = (e: PointerEvent) => this.down(e);
    const move = (e: PointerEvent) => {
      if (this.accepts(e)) this.onMove(e.pointerId, this.toGame(e));
    };
    const up = (e: PointerEvent) => {
      if (this.accepts(e)) this.onUp(e.pointerId, this.toGame(e));
    };
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

  /** Let go of everything (pause, resume, the level ends); re-reads the hands setting. */
  reset() {
    this.swap = handsSwapped();
  }

  /** Mirror x when the hands are swapped. */
  protected mx(x: number) {
    return this.swap ? WIDTH - x : x;
  }

  /** Window point -> game screen coordinates (may be outside 0…WIDTH on the black bars). */
  protected toGame(e: PointerEvent) {
    const r = this.scene.game.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * WIDTH) / r.width, y: ((e.clientY - r.top) * HEIGHT) / r.height };
  }

  private down(e: PointerEvent) {
    if (!this.accepts(e) || !this.scene.sys.isActive()) return;
    const { x, y } = this.toGame(e);
    const h = this.host;
    // pause button (top right)
    if (h.pauseAt && Math.hypot(x - h.pauseAt.x, y - h.pauseAt.y) < 52) {
      this.reset();
      h.onPause();
      return;
    }
    // perk bar (top middle)
    if (y < TOP_BAR_Y) {
      for (let i = 0; i < h.perkSlots; i++) {
        const s = h.perkSlot(i);
        if (Math.abs(x - s.x) < 24 && Math.abs(y - s.y) < 42) {
          h.onPerk(i);
          return;
        }
      }
      return;
    }
    this.onDown(e.pointerId, { x, y });
  }

  /** Fingers only; the layout editor takes the mouse too (to try it on a computer). */
  protected acceptsMouse() {
    return false;
  }

  private accepts(e: PointerEvent) {
    return e.pointerType === 'touch' || (this.acceptsMouse() && e.pointerType === 'mouse');
  }

  protected abstract onDown(id: number, p: { x: number; y: number }): void;
  protected abstract onMove(id: number, p: { x: number; y: number }): void;
  protected abstract onUp(id: number, p: { x: number; y: number }): void;
  /** What the fingers say this frame. Presses (jump, swings) are handed out once. */
  abstract read(): TouchState;
  abstract draw(): void;
}
