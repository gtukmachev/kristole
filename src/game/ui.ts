import Phaser from 'phaser';
import { FONT_SLAB, MENU_ORANGE, MENU_WHITE, MENU_YELLOW, hex } from './constants';
import { sfx } from './sfx';

export interface Button {
  container: Phaser.GameObjects.Container;
  enabled: boolean;
  setFocus(f: boolean): void;
  activate(): void;
  setLabel(s: string): void;
}

export interface ButtonOpts {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: number;
  enabled?: boolean;
  fontSize?: number;
  border?: number;
  onClick: () => void;
  onDisabled?: () => void;
}

/** White-framed button in the style of Leo's menu mockup. */
export function makeButton(scene: Phaser.Scene, o: ButtonOpts): Button {
  const enabled = o.enabled ?? true;
  const g = scene.add.graphics();
  const text = scene.add
    .text(0, 0, o.label, {
      fontFamily: FONT_SLAB,
      fontStyle: 'bold',
      fontSize: `${o.fontSize ?? 46}px`,
      color: hex(o.color ?? MENU_YELLOW),
      align: 'center',
      lineSpacing: -8,
    })
    .setOrigin(0.5);
  const c = scene.add.container(o.x, o.y, [g, text]);
  c.setSize(o.w, o.h);
  let focused = false;
  const draw = () => {
    g.clear();
    if (focused) {
      g.fillStyle(enabled ? MENU_ORANGE : 0x333333, 0.18);
      g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
    }
    g.lineStyle(focused ? 7 : 5, focused && enabled ? MENU_YELLOW : o.border ?? MENU_WHITE, 1);
    g.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
  };
  draw();
  c.setInteractive({ useHandCursor: true });
  const btn: Button = {
    container: c,
    enabled,
    setFocus(f) {
      focused = f;
      draw();
      scene.tweens.killTweensOf(c);
      scene.tweens.add({ targets: c, scale: f ? 1.04 : 1, duration: 120 });
    },
    activate() {
      if (enabled) {
        sfx.click();
        o.onClick();
      } else {
        sfx.denied();
        o.onDisabled?.();
        scene.tweens.add({ targets: c, x: o.x + 8, duration: 40, yoyo: true, repeat: 2 });
      }
    },
    setLabel(s) {
      text.setText(s);
    },
  };
  c.on('pointerup', () => btn.activate());
  return btn;
}

/**
 * Keyboard navigation over a grid of focusable items: arrows / WASD to move,
 * Enter / Space to activate. Rows may have different lengths.
 */
export interface NavItem {
  focus(f: boolean): void;
  activate(): void;
  left?(): void;
  right?(): void;
  /** Interactive object that takes focus on mouse hover. */
  target?: Phaser.GameObjects.GameObject;
}

export class GridNav {
  row = 0;
  col = 0;
  constructor(
    private scene: Phaser.Scene,
    private rows: NavItem[][],
    private onBack?: () => void,
    private blocked?: () => boolean,
  ) {
    const kb = scene.input.keyboard!;
    kb.on('keydown', this.onKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', this.onKey, this));
    // Mouse hover moves the keyboard focus too, so both always agree.
    rows.forEach((r, ri) => r.forEach((it, ci) => it.target?.on('pointerover', () => this.set(ri, ci))));
    this.refresh();
  }

  set(row: number, col: number) {
    this.row = row;
    this.col = col;
    this.refresh();
  }

  private get current() {
    return this.rows[this.row][this.col];
  }

  private refresh() {
    this.rows.forEach((r, ri) => r.forEach((it, ci) => it.focus(ri === this.row && ci === this.col)));
  }

  private onKey(e: KeyboardEvent) {
    if (!this.scene.scene.isActive() || this.blocked?.()) return;
    const k = e.code;
    const prevR = this.row, prevC = this.col;
    if (k === 'ArrowUp' || k === 'KeyW') {
      this.row = (this.row - 1 + this.rows.length) % this.rows.length;
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      this.row = (this.row + 1) % this.rows.length;
    } else if (k === 'ArrowLeft' || k === 'KeyA') {
      if (this.current.left) {
        this.current.left();
        return;
      }
      this.col = Math.max(0, this.col - 1);
    } else if (k === 'ArrowRight' || k === 'KeyD') {
      if (this.current.right) {
        this.current.right();
        return;
      }
      this.col = Math.min(this.rows[this.row].length - 1, this.col + 1);
    } else if (k === 'Enter' || k === 'Space' || k === 'NumpadEnter') {
      this.current.activate();
      return;
    } else if (k === 'Escape' || k === 'Backspace') {
      this.onBack?.();
      return;
    } else return;
    if (prevR !== this.row) {
      // keep roughly the same horizontal position
      const prevLen = this.rows[prevR].length;
      const len = this.rows[this.row].length;
      this.col = Math.min(len - 1, Math.round((prevC / Math.max(1, prevLen - 1)) * (len - 1)));
    }
    if (prevR !== this.row || prevC !== this.col) sfx.click();
    this.refresh();
  }
}

export function buttonItem(b: Button) {
  return { focus: (f: boolean) => b.setFocus(f), activate: () => b.activate(), target: b.container as Phaser.GameObjects.GameObject };
}
