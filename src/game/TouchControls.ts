import Phaser from 'phaser';
import { FONT_SLAB, HEIGHT, INK, PAPER, WIDTH, hex } from './constants';
import { LAYOUT_LIMITS, defaultLayout, joyLayout, setJoyLayout, type FightButton, type JoyLayout, type SchemeId } from './controls';
import { inOuterUp } from './gestures';
import { TOP_BAR_Y, TouchInput, emptyTouch, type TouchHost, type TouchOptions, type TouchState } from './TouchInput';

/**
 * Joystick 1 (v8): on-screen controls for phones and tablets.
 *  - one side: a floating stick (it appears where the thumb lands): sideways = walk, down = duck, up = jump;
 *  - the other side: two swing buttons (swing up, swing down) and the block button. A touch anywhere on
 *    that half goes to the nearest button — hard to miss.
 * Joystick 2 (v9): the same, plus an outer ring around the stick. Thumb up into the outer ring = a second
 * jump (flip in the air, wall bounce); back to the inner ring and up again = another one. The ring lights up.
 * The rings don't slide after the thumb; they can also stay in one place ("fixed").
 * Layout (v9): sizes and button places come from the scheme's saved layout; the Controls screen edits it
 * (drag the stick and the buttons, − / + sizes). Pause button and perk bar: see TouchInput.
 */

/** Second jump on Joystick 1: a tiny "down a bit, up again" of the thumb (× stick travel). */
const REARM_K = 0.15;
const FLICK_K = 0.2;
const KNOB_R = 28;
const BUTTON_IDS: FightButton[] = ['high', 'low', 'block'];
/** What the editor has picked up. */
export type EditPick = FightButton | 'stick';

export class JoystickControls extends TouchInput {
  private lay: JoyLayout;
  /** Joystick 2: thumb in the outer ring (upper part) / a flip waiting for the next frame. */
  private inOuter = false;
  private pendingJump = false;
  private stick: { id: number; bx: number; by: number; x: number; y: number } | null = null;
  private held = new Map<number, FightButton>();
  private swings: FightButton[] = [];
  /** Jump edge from the stick: armed -> fires -> eases off a bit -> armed again. */
  private armed = true;
  /** Highest thumb point since the last jump (most negative dy). */
  private peakDy = 0;
  /** Lowest thumb point since re-arming (null = from rest: first jump). */
  private troughDy: number | null = null;
  private flash = new Map<FightButton, number>();
  // ---- layout editor
  editing = false;
  picked: EditPick | null = null;
  private drag: { id: number; dx: number; dy: number } | null = null;
  private editLabel?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, host: TouchHost, private rings: 1 | 2 = 1, opts: TouchOptions = {}, private scheme: SchemeId = rings === 2 ? 'joy2' : 'joy1') {
    super(scene, host, opts);
    this.lay = joyLayout(scheme);
  }

  get layout(): JoyLayout {
    return this.lay;
  }

  /** Let go of everything (pause, resume, the level ends); re-reads hands and layout. */
  override reset() {
    super.reset();
    this.lay = joyLayout(this.scheme);
    this.stick = null;
    this.held.clear();
    this.swings = [];
    this.armed = true;
    this.troughDy = null;
    this.inOuter = false;
    this.pendingJump = false;
    this.drag = null;
  }

  private get R() {
    return this.lay.stickR;
  }

  private get outerR() {
    return this.R * this.lay.outerK;
  }

  /** Is this point on the stick's half of the screen? */
  private stickSide(x: number) {
    return this.swap ? x > WIDTH / 2 : x < WIDTH / 2;
  }

  /** Fixed stick: its centre on screen. */
  private stickHome() {
    return { x: this.mx(this.lay.stick.x), y: this.lay.stick.y };
  }

  /** The fight button for a touch on the buttons' half: the nearest one. */
  private zoneAt(x: number, y: number): FightButton | null {
    if (y < TOP_BAR_Y || this.stickSide(x)) return null;
    let best: FightButton | null = null;
    let bestD = Infinity;
    for (const id of BUTTON_IDS) {
      const b = this.lay.buttons[id];
      // distance to the circle's edge, so a big button wins over a small one next to it
      const d = Math.hypot(x - this.mx(b.x), y - b.y) - b.r;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private press(id: FightButton) {
    if (id !== 'block') this.swings.push(id);
    this.flash.set(id, this.scene.time.now);
  }

  protected onDown(id: number, { x, y }: { x: number; y: number }) {
    if (this.editing) {
      this.editDown(id, x, y);
      return;
    }
    if (this.stickSide(x)) {
      if (this.stick) return;
      const home = this.lay.fixed && this.rings === 2 ? this.stickHome() : { x, y };
      this.stick = { id, bx: home.x, by: home.y, x, y };
      return;
    }
    const b = this.zoneAt(x, y);
    if (!b) return;
    this.held.set(id, b);
    this.press(b);
  }

  protected onMove(id: number, { x, y }: { x: number; y: number }) {
    if (this.editing) {
      this.editMove(id, x, y);
      return;
    }
    const s = this.stick;
    if (s && s.id === id) {
      s.x = x;
      s.y = y;
      // Joystick 2: the rings stay where they appeared — the outer ring must be reachable by moving the thumb.
      if (this.rings === 2) return;
      // Joystick 1: pulled past the edge sideways or down, the stick follows the thumb. Not up: then the
      // second push (flip) would need the thumb to travel all the way back first.
      const dx = x - s.bx;
      const dy = y - s.by;
      if (Math.abs(dx) > this.R) s.bx = x - Math.sign(dx) * this.R;
      if (dy > this.R) s.by = y - this.R;
      return;
    }
    // sliding the thumb from one button onto another presses that one
    const was = this.held.get(id);
    if (was) {
      const b = this.zoneAt(x, y);
      if (b && b !== was) {
        this.held.set(id, b);
        this.press(b);
      }
    }
  }

  protected onUp(id: number) {
    if (this.drag?.id === id) {
      this.drag = null;
      setJoyLayout(this.scheme, this.lay);
    }
    if (this.stick?.id === id) this.stick = null;
    this.held.delete(id);
  }

  // ---- layout editor: drag the stick and the buttons, − / + sizes (from the Controls screen)

  protected override acceptsMouse() {
    return this.editing;
  }

  setEditing(on: boolean) {
    this.reset();
    this.editing = on;
    this.picked = on ? this.picked : null;
  }

  /** Element under a point (in edit mode). */
  private elementAt(x: number, y: number): EditPick | null {
    for (const id of BUTTON_IDS) {
      const b = this.lay.buttons[id];
      if (Math.hypot(x - this.mx(b.x), y - b.y) < b.r + 14) return id;
    }
    const h = this.stickHome();
    if (Math.hypot(x - h.x, y - h.y) < this.R + 30) return 'stick';
    return null;
  }

  private editDown(id: number, x: number, y: number) {
    const e = this.elementAt(x, y);
    this.picked = e;
    if (!e) return;
    const p = e === 'stick' ? this.lay.stick : this.lay.buttons[e];
    this.drag = { id, dx: this.mx(p.x) - x, dy: p.y - y };
  }

  private editMove(id: number, x: number, y: number) {
    const d = this.drag;
    if (!d || d.id !== id || !this.picked) return;
    const pick = this.picked;
    const r = pick === 'stick' ? this.R + 18 : this.lay.buttons[pick].r;
    // keep it on its own half and on the screen
    let sx = this.mx(x + d.dx); // back to the right-hand layout
    const sy = Phaser.Math.Clamp(y + d.dy, TOP_BAR_Y + r * 0.6, HEIGHT - r * 0.4);
    if (pick === 'stick') sx = Phaser.Math.Clamp(sx, r * 0.5, WIDTH / 2 - r * 0.6);
    else sx = Phaser.Math.Clamp(sx, WIDTH / 2 + r * 0.6, WIDTH - r * 0.4);
    const p = pick === 'stick' ? this.lay.stick : this.lay.buttons[pick];
    p.x = sx;
    p.y = sy;
  }

  /** − / + for a size: the stick travel, the outer ring, or the picked button (all buttons if none is picked). */
  resize(what: 'stick' | 'outer' | 'button', dir: number) {
    const l = this.lay;
    if (what === 'stick') {
      const [lo, hi, st] = LAYOUT_LIMITS.stickR;
      l.stickR = Phaser.Math.Clamp(l.stickR + dir * st, lo, hi);
    } else if (what === 'outer') {
      const [lo, hi, st] = LAYOUT_LIMITS.outerK;
      l.outerK = Math.round(Phaser.Math.Clamp(l.outerK + dir * st, lo, hi) * 10) / 10;
    } else {
      const [lo, hi, st] = LAYOUT_LIMITS.buttonR;
      const ids = this.picked && this.picked !== 'stick' ? [this.picked] : BUTTON_IDS;
      for (const id of ids) l.buttons[id].r = Phaser.Math.Clamp(l.buttons[id].r + dir * st, lo, hi);
    }
    setJoyLayout(this.scheme, l);
  }

  setFixed(on: boolean) {
    this.lay.fixed = on;
    setJoyLayout(this.scheme, this.lay);
  }

  resetLayout() {
    const fixed = this.lay.fixed;
    this.lay = defaultLayout();
    this.lay.fixed = fixed;
    setJoyLayout(this.scheme, this.lay);
    this.picked = null;
  }

  /** What the fingers say this frame. Swing presses are handed out once. */
  read(): TouchState {
    const st: TouchState = emptyTouch();
    if (this.editing) return st;
    const R = this.R;
    const s = this.stick;
    if (s) {
      const dx = s.x - s.bx;
      const dy = s.y - s.by;
      st.left = dx < -R * 0.3;
      st.right = dx > R * 0.3;
      // up / down only when the thumb clearly goes that way (running with a wobbly thumb doesn't jump)
      st.up = dy < -R * 0.45 && -dy > Math.abs(dx) * 0.5;
      st.down = dy > R * 0.5 && dy > Math.abs(dx) * 0.8;
      if (this.rings === 2) {
        // Joystick 2: up = jump; on into the outer ring = second jump (flip, wall bounce)
        const outer = inOuterUp(dx, dy, R, this.inOuter, this.lay.outerK);
        if (this.pendingJump) {
          st.jumpPressed = true;
          this.pendingJump = false;
        }
        if (this.armed && st.up) {
          st.jumpPressed = true;
          this.armed = false;
        }
        if (outer && !this.inOuter) {
          // the whole way up in one frame: jump now, flip in the next one
          if (st.jumpPressed) this.pendingJump = true;
          else st.jumpPressed = true;
          this.armed = false;
        }
        this.inOuter = outer;
        if (dy > -R * 0.3) this.armed = true;
      }
      // jump: push up. Second jump (flip in the air, wall bounce): a tiny ease-off and push again.
      else if (this.armed) {
        const fire =
          this.troughDy === null
            ? st.up // from rest: clearly up
            : dy < this.troughDy - R * FLICK_K && dy < -R * 0.25; // again: a small flick, still in the upper part
        if (fire) {
          st.jumpPressed = true;
          this.armed = false;
          this.peakDy = dy;
        } else if (this.troughDy !== null) this.troughDy = Math.max(this.troughDy, dy);
      } else {
        this.peakDy = Math.min(this.peakDy, dy);
        if (dy > this.peakDy + R * REARM_K) {
          this.armed = true;
          this.troughDy = dy;
        }
      }
      // back near the middle: the next push is a first jump again
      if (dy > -R * 0.3 && this.armed) this.troughDy = null;
    } else {
      this.armed = true;
      this.troughDy = null;
      this.inOuter = false;
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
    const R = this.R;
    const ed = this.editing;
    // the stick
    const s = this.stick;
    const home = this.stickHome();
    const bx = s ? Phaser.Math.Clamp(s.bx, R, WIDTH - R) : home.x;
    const by = s ? Phaser.Math.Clamp(s.by, TOP_BAR_Y + 5 + R, HEIGHT - 20) : home.y;
    const on = !!s || ed;
    if (this.rings === 2) {
      // the outer ring: lit while the thumb is in it
      const outerR = this.outerR + 24;
      if (this.inOuter) {
        g.fillStyle(INK, 0.28);
        g.fillCircle(bx, by, outerR);
      }
      g.lineStyle(this.inOuter ? 6 : 3, INK, this.inOuter ? 0.75 : on ? 0.4 : 0.2);
      g.strokeCircle(bx, by, outerR);
    }
    g.fillStyle(PAPER, on ? 0.35 : 0.2);
    g.fillCircle(bx, by, R + 18);
    g.lineStyle(4, INK, on ? 0.45 : 0.22);
    g.strokeCircle(bx, by, R + 18);
    let kx = bx;
    let ky = by;
    if (s) {
      const dx = s.x - s.bx;
      const dy = s.y - s.by;
      const max = this.inOuter ? this.outerR : R;
      const d = Math.min(max, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      kx += dx * d;
      ky += dy * d;
    }
    g.fillStyle(INK, on ? 0.5 : 0.22);
    g.fillCircle(kx, ky, KNOB_R);
    if (ed && this.picked === 'stick') this.pickRing(bx, by, (this.rings === 2 ? this.outerR + 24 : R + 18) + 8);
    // the buttons
    const heldIds = new Set(this.held.values());
    for (const id of BUTTON_IDS) {
      const b = this.lay.buttons[id];
      const x = this.mx(b.x);
      const lit = heldIds.has(id) || now - (this.flash.get(id) ?? -1e9) < 120;
      g.fillStyle(lit ? INK : PAPER, lit ? 0.45 : ed ? 0.5 : 0.3);
      g.fillCircle(x, b.y, b.r);
      g.lineStyle(4, INK, lit ? 0.7 : ed ? 0.6 : 0.4);
      g.strokeCircle(x, b.y, b.r);
      this.icon(id, x, b.y, lit, b.r / 64);
      if (ed && this.picked === id) this.pickRing(x, b.y, b.r + 10);
    }
    // edit mode: a hint
    if (ed) {
      if (!this.editLabel) {
        this.editLabel = this.scene.add.text(WIDTH / 2, TOP_BAR_Y + 60, 'Drag the stick and the buttons · tap one, then − / +', {
          fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '22px', color: hex(INK),
        }).setOrigin(0.5).setDepth(151).setScrollFactor(this.g.scrollFactorX);
      }
      this.editLabel.setVisible(true);
    } else this.editLabel?.setVisible(false);
  }

  /** A dashed ring around the picked element. */
  private pickRing(x: number, y: number, r: number) {
    const g = this.g;
    g.lineStyle(4, INK, 0.9);
    const n = 24;
    for (let i = 0; i < n; i += 2) {
      g.beginPath();
      g.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      g.strokePath();
    }
  }

  private icon(id: FightButton, x: number, y: number, lit: boolean, k: number) {
    const g = this.g;
    const c = lit ? PAPER : INK;
    const a = lit ? 0.95 : 0.6;
    g.lineStyle(7 * Math.min(1.2, Math.max(0.7, k)), c, a);
    if (id === 'block') {
      // a shield
      g.beginPath();
      g.moveTo(x - 24 * k, y - 26 * k);
      g.lineTo(x + 24 * k, y - 26 * k);
      g.lineTo(x + 22 * k, y + 4 * k);
      g.lineTo(x, y + 28 * k);
      g.lineTo(x - 22 * k, y + 4 * k);
      g.closePath();
      g.strokePath();
      return;
    }
    // a swing arc with an arrow head: up (swing up) or down (swing down)
    const dir = id === 'high' ? -1 : 1;
    const ex = x + 20 * k;
    const ey = y + dir * 22 * k;
    g.beginPath();
    g.moveTo(x - 24 * k, y - dir * 18 * k);
    g.lineTo(x - 4 * k, y - dir * 2 * k);
    g.lineTo(ex - 6 * k, ey - dir * 6 * k);
    g.strokePath();
    g.fillStyle(c, a);
    g.fillTriangle(ex + 6 * k, ey + dir * 6 * k, ex - 14 * k, ey + dir * 2 * k, ex + 2 * k, ey - dir * 14 * k);
  }

  override destroy() {
    super.destroy();
    this.editLabel?.destroy();
  }
}
