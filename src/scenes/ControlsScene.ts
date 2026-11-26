import Phaser from 'phaser';
import { FONT_IMPACT, FONT_SLAB, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH, hex } from '../game/constants';
import { SCHEMES, currentScheme, schemeAvailable, setScheme, setSimpleSwing, simpleSwing } from '../game/controls';
import { menuScene } from '../game/menuChoice';
import { sfx } from '../game/sfx';
import { handsSwapped, setHandsSwapped } from '../game/touch';
import type { PracticeScene } from './PracticeScene';

/**
 * Controls screen (v9): pick and set up how to play.
 * Header: ‹ scheme name ›, ✕ on the left (leave, change nothing), round ✓ on the right (take this one and leave).
 * The ✓ is filled on the scheme in use, hollow on the others. Below: the practice ground (PracticeScene),
 * which slides sideways when you flip to the next scheme — by the arrows or a swipe over the header.
 */

export interface ControlsData {
  from?: 'menu' | 'pause';
}

const HEADER_H = 92;
const OK = { x: WIDTH - 56, y: 46 };
const CANCEL = { x: 56, y: 46 };

export class ControlsScene extends Phaser.Scene {
  private from: 'menu' | 'pause' = 'menu';
  private idx = 0;
  private title!: Phaser.GameObjects.Text;
  private arrows!: Phaser.GameObjects.Text[];
  private okG!: Phaser.GameObjects.Graphics;
  private hands?: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Controls');
  }

  init(data: ControlsData) {
    this.from = data?.from ?? 'menu';
    this.idx = Math.max(0, SCHEMES.findIndex((s) => s.id === currentScheme()));
    this.busy = false;
  }

  create() {
    this.scene.launch('Practice', { scheme: SCHEMES[this.idx].id });
    this.scene.bringToTop();

    const bar = this.add.graphics();
    bar.fillStyle(PAPER, 0.97);
    bar.fillRect(0, 0, WIDTH, HEADER_H);
    bar.lineStyle(3, INK, 1);
    bar.lineBetween(0, HEADER_H, WIDTH, HEADER_H);

    this.title = this.add.text(WIDTH / 2, HEADER_H / 2, '', { fontFamily: FONT_IMPACT, fontSize: '56px', color: hex(INK) }).setOrigin(0.5);
    this.arrows = [-1, 1].map((d) => {
      const t = this.add.text(WIDTH / 2 + d * 270, HEADER_H / 2 - 4, d < 0 ? '‹' : '›', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '84px', color: hex(INK) })
        .setOrigin(0.5)
        .setPadding(30, 0, 30, 0)
        .setInteractive({ useHandCursor: true });
      t.on('pointerup', () => this.go(d));
      return t;
    });

    // ✕: leave, change nothing
    const cg = this.add.graphics();
    cg.lineStyle(4, INK, 1);
    cg.strokeCircle(CANCEL.x, CANCEL.y, 30);
    cg.lineStyle(6, INK, 1);
    cg.lineBetween(CANCEL.x - 11, CANCEL.y - 11, CANCEL.x + 11, CANCEL.y + 11);
    cg.lineBetween(CANCEL.x - 11, CANCEL.y + 11, CANCEL.x + 11, CANCEL.y - 11);
    this.add.zone(CANCEL.x, CANCEL.y, 90, 90).setInteractive({ useHandCursor: true }).on('pointerup', () => this.leave());

    // ✓: take this scheme and leave
    this.okG = this.add.graphics();
    this.add.zone(OK.x, OK.y, 90, 90).setInteractive({ useHandCursor: true }).on('pointerup', () => this.apply());

    // swipe over the header = next / previous scheme
    let sx: number | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sx = p.y < HEADER_H ? p.x : null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (sx !== null && Math.abs(p.x - sx) > 80) this.go(p.x < sx ? 1 : -1);
      sx = null;
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.leave());
    kb.on('keydown-ENTER', () => this.apply());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.removeAllListeners());
    this.refresh();
  }

  private get practice() {
    return this.scene.get('Practice') as PracticeScene;
  }

  private refresh() {
    const s = SCHEMES[this.idx];
    const live = schemeAvailable(s.id);
    this.title.setText(s.title).setColor(hex(live ? INK : INK_SOFT));
    this.arrows[0].setAlpha(this.idx > 0 ? 1 : 0.2);
    this.arrows[1].setAlpha(this.idx < SCHEMES.length - 1 ? 1 : 0.2);
    this.drawOk(s.id === currentScheme(), live);
    // left / right hand: joystick schemes only
    this.hands?.destroy();
    this.hands = undefined;
    if (s.hands) {
      const label = () => (handsSwapped() ? 'Stick: right hand  ⇄' : 'Stick: left hand  ⇄');
      const t = this.add.text(WIDTH / 2, HEADER_H + 26, label(), {
        fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '24px', color: hex(INK), backgroundColor: '#ffffff', padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        sfx.click();
        setHandsSwapped(!handsSwapped());
        t.setText(label());
        this.practice.handsChanged();
      });
      this.hands = t;
    }
    // Simple: what a tap swings
    if (s.id === 'simple') {
      const label = () => (simpleSwing() === 'height' ? 'Swings: by height  ⇄' : 'Swings: up, down in turn  ⇄');
      const t = this.add.text(WIDTH / 2, HEADER_H + 26, label(), {
        fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '24px', color: hex(INK), backgroundColor: '#ffffff', padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        sfx.click();
        setSimpleSwing(simpleSwing() === 'height' ? 'alternate' : 'height');
        t.setText(label());
      });
      this.hands = t;
    }
  }

  private drawOk(filled: boolean, live: boolean) {
    const g = this.okG;
    g.clear();
    const c = live ? INK : INK_FAINT;
    if (filled) {
      g.fillStyle(c, 1);
      g.fillCircle(OK.x, OK.y, 30);
    } else {
      g.lineStyle(4, c, 1);
      g.strokeCircle(OK.x, OK.y, 30);
    }
    g.lineStyle(6, filled ? PAPER : c, 1);
    g.beginPath();
    g.moveTo(OK.x - 13, OK.y + 1);
    g.lineTo(OK.x - 3, OK.y + 11);
    g.lineTo(OK.x + 14, OK.y - 10);
    g.strokePath();
  }

  /** Flip to the next (1) or previous (-1) scheme: the practice ground slides away, the next one slides in. */
  private go(d: number) {
    const to = this.idx + d;
    if (this.busy || to < 0 || to >= SCHEMES.length) return;
    this.busy = true;
    sfx.click();
    this.practice.slideOut(d, () => {
      this.idx = to;
      this.scene.stop('Practice');
      this.scene.launch('Practice', { scheme: SCHEMES[to].id, from: d });
      this.scene.bringToTop();
      this.refresh();
      this.busy = false;
    });
  }

  private apply() {
    if (this.busy) return;
    const s = SCHEMES[this.idx];
    if (!schemeAvailable(s.id)) {
      sfx.denied();
      return;
    }
    this.busy = true;
    sfx.click();
    setScheme(s.id);
    this.drawOk(true, true);
    this.time.delayedCall(220, () => this.exit());
  }

  private leave() {
    if (this.busy) return;
    this.busy = true;
    sfx.click();
    this.exit();
  }

  private exit() {
    this.scene.stop('Practice');
    if (this.from === 'pause') {
      this.scene.launch('Pause');
      this.scene.stop();
    } else this.scene.start(menuScene());
  }
}
