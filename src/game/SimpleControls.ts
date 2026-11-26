import Phaser from 'phaser';
import { FONT_SLAB, HEIGHT, INK, WIDTH, hex } from './constants';
import { simpleSwing } from './controls';
import { CSS_PX_PER_CM, blockLineY, fingerKind, isTap, swipeDir } from './gestures';
import { TOP_BAR_Y, TouchInput, emptyTouch, type TouchHost, type TouchOptions, type TouchState } from './TouchInput';

/**
 * Simple (v9): no stick, just thumbs, anywhere in the control strip at the bottom.
 *  - hold a finger on the right half: walk right; on the left half: walk left (at once, from the touch);
 *  - swipe up: jump; swipe up-and-sideways: jump and flip (towards the walk, or the swipe when standing);
 *  - swipe down: duck and stay down until you jump or walk;
 *  - tap: swing (alternately up / down, or by height: upper half of the strip = up, lower = down);
 *  - press above the strip: block, while held.
 * One thumb walks, the other swipes or taps; either hand can do anything (it's symmetric).
 */

interface Finger {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  kind: 'pending' | 'hold' | 'swipe' | 'block';
}

/** How long the flip keeps its direction held (the player needs a side pressed for it). */
const FLIP_DIR_MS = 250;

export class SimpleControls extends TouchInput {
  private fingers = new Map<number, Finger>();
  private jumps = 0;
  private flipDir = 0;
  private flipDirUntil = 0;
  private flipNext = false;
  private swings: ('high' | 'low')[] = [];
  private nextHigh = true;
  private ducked = false;
  private flash: { x: number; y: number; at: number } | null = null;

  constructor(scene: Phaser.Scene, host: TouchHost, opts: TouchOptions = {}) {
    super(scene, host, opts);
  }

  override reset() {
    super.reset();
    this.fingers.clear();
    this.jumps = 0;
    this.flipNext = false;
    this.flipDirUntil = 0;
    this.swings = [];
    this.ducked = false;
  }

  /** Game units per centimetre of the real screen. */
  private unitsPerCm() {
    const h = this.scene.game.canvas.getBoundingClientRect().height || HEIGHT;
    return (CSS_PX_PER_CM * HEIGHT) / h;
  }

  private blockLine() {
    return blockLineY(this.scene.game.canvas.getBoundingClientRect().height || HEIGHT, HEIGHT, TOP_BAR_Y);
  }

  private now() {
    return this.scene.time.now;
  }

  protected onDown(id: number, { x, y }: { x: number; y: number }) {
    const kind = y < this.blockLine() ? 'block' : 'pending';
    this.fingers.set(id, { x0: x, y0: y, x, y, t0: this.now(), kind });
  }

  protected onMove(id: number, { x, y }: { x: number; y: number }) {
    const f = this.fingers.get(id);
    if (!f) return;
    f.x = x;
    f.y = y;
    this.classify(f);
  }

  protected onUp(id: number) {
    const f = this.fingers.get(id);
    this.fingers.delete(id);
    if (!f || f.kind !== 'pending') return;
    const moved = Math.hypot(f.x - f.x0, f.y - f.y0) / this.unitsPerCm();
    if (isTap(moved)) this.tap(f);
  }

  /** Pending finger: a swipe yet, or a hold? */
  private classify(f: Finger) {
    if (f.kind !== 'pending') return;
    const moved = Math.hypot(f.x - f.x0, f.y - f.y0) / this.unitsPerCm();
    const k = fingerKind(moved, this.now() - f.t0);
    if (k === 'swipe') {
      f.kind = 'swipe';
      this.swipe(swipeDir(f.x - f.x0, f.y - f.y0));
    } else if (k === 'hold') {
      f.kind = 'hold';
      this.ducked = false; // walking stands you up
    }
  }

  /**
   * Which way to walk. A finger walks from the moment it touches (no waiting to tell a tap from a hold:
   * a tap just turns you, swings, and makes a tiny step). While a finger already holds the walk,
   * a new touch from the other hand doesn't turn you: it's a tap or a swipe.
   */
  private walkDir(): number {
    const side = (kind: Finger['kind']) => {
      let l = false;
      let r = false;
      for (const f of this.fingers.values()) {
        if (f.kind !== kind) continue;
        if (f.x < WIDTH / 2) l = true;
        else r = true;
      }
      return l === r ? 0 : l ? -1 : 1;
    };
    const held = [...this.fingers.values()].some((f) => f.kind === 'hold');
    return held ? side('hold') : side('pending');
  }

  private swipe(dir: ReturnType<typeof swipeDir>) {
    if (!dir) return;
    if (dir === 'down') {
      this.ducked = true;
      return;
    }
    this.ducked = false;
    this.jumps++;
    if (dir === 'upLeft' || dir === 'upRight') {
      // jump, and flip in the next frame (a second "up" right after take-off is a flip)
      this.flipNext = true;
      this.flipDir = this.walkDir() || (dir === 'upLeft' ? -1 : 1);
      this.flipDirUntil = this.now() + FLIP_DIR_MS;
    }
  }

  private tap(f: Finger) {
    let high: boolean;
    if (simpleSwing() === 'height') {
      const line = this.blockLine();
      high = f.y0 < line + (HEIGHT - line) / 2;
    } else {
      high = this.nextHigh;
      this.nextHigh = !this.nextHigh;
    }
    this.swings.push(high ? 'high' : 'low');
    this.flash = { x: f.x0, y: f.y0, at: this.now() };
  }

  read(): TouchState {
    const st = emptyTouch();
    // fingers that were held still long enough become walking even without a move event
    for (const f of this.fingers.values()) this.classify(f);
    const walk = this.walkDir();
    st.left = walk < 0;
    st.right = walk > 0;
    if (this.now() < this.flipDirUntil) {
      st.left = this.flipDir < 0;
      st.right = this.flipDir > 0;
    }
    if (this.jumps > 0) {
      st.jumpPressed = true;
      st.up = true;
      this.jumps--;
      if (this.flipNext && this.jumps === 0) {
        // the flip: one more "up" in the next frame
        this.flipNext = false;
        this.jumps = 1;
      }
    }
    st.down = this.ducked;
    for (const f of this.fingers.values()) if (f.kind === 'block') st.block = true;
    for (const s of this.swings.splice(0)) {
      if (s === 'high') st.swingHigh = true;
      else st.swingLow = true;
    }
    return st;
  }

  draw() {
    const g = this.g;
    g.clear();
    const line = this.blockLine();
    const blocking = [...this.fingers.values()].some((f) => f.kind === 'block');
    // block zone: a faint band above the control strip
    g.fillStyle(INK, blocking ? 0.16 : 0.05);
    g.fillRect(0, TOP_BAR_Y, WIDTH, line - TOP_BAR_Y);
    g.lineStyle(2, INK, 0.25);
    g.lineBetween(0, line, WIDTH, line);
    this.label('BLOCK', WIDTH / 2, (TOP_BAR_Y + line) / 2, blocking ? 0.7 : 0.35);
    if (simpleSwing() === 'height') {
      const mid = line + (HEIGHT - line) / 2;
      for (let x = 0; x < WIDTH; x += 28) g.lineBetween(x, mid, x + 14, mid);
      this.label('tap: swing up', WIDTH / 2, line + 26, 0.35);
      this.label('tap: swing down', WIDTH / 2, HEIGHT - 26, 0.35);
    }
    // walking sides
    const walk = this.walkDir();
    this.label('◀ hold', 70, HEIGHT - 26, walk < 0 ? 0.8 : 0.3);
    this.label('hold ▶', WIDTH - 70, HEIGHT - 26, walk > 0 ? 0.8 : 0.3);
    // a ring where a tap landed
    const fl = this.flash;
    if (fl && this.now() - fl.at < 160) {
      g.lineStyle(5, INK, 0.5 * (1 - (this.now() - fl.at) / 160));
      g.strokeCircle(fl.x, fl.y, 34);
    }
  }

  private labels = new Map<string, Phaser.GameObjects.Text>();

  private label(s: string, x: number, y: number, alpha: number) {
    let t = this.labels.get(s);
    if (!t) {
      t = this.scene.add.text(x, y, s, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '22px', color: hex(INK) }).setOrigin(0.5).setDepth(150)
        .setScrollFactor(this.g.scrollFactorX);
      this.labels.set(s, t);
    }
    t.setPosition(x, y).setAlpha(alpha).setVisible(true);
  }

  override destroy() {
    super.destroy();
    for (const t of this.labels.values()) t.destroy();
  }
}
