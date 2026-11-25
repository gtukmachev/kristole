import Phaser from 'phaser';
import { hint as keyHint } from '../game/touch';
import { menuScene } from '../game/menuChoice';
import { ACC, FONT_HAND, FONT_IMPACT, FONT_SLAB, HEIGHT, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH, hex } from '../game/constants';
import { DEMO_H, DEMO_W, drawPerkDemo } from '../game/perkDemo';
import { PERKS, drawPerkIcon } from '../game/perks';
import { sfx } from '../game/sfx';

export interface PerksSceneData {
  /** Opened from the pause screen (returns there) or from the main menu. */
  from?: 'menu' | 'pause';
}

const VIEW_TOP = 118;
const VIEW_H = 500;
const PANEL_H = 152;
const STRIDE = 166;
const PANEL_X = 70;
const PANEL_W = WIDTH - 140;

interface Panel {
  frame: Phaser.GameObjects.Graphics;
  demo: Phaser.GameObjects.Graphics;
  top: number;
}

/**
 * Scrolling list of panels, one per perk: icon + key, what it does, and a small live scene of the hero
 * fighting a zombie with that perk on. ↑ / ↓ move between panels; the chosen one plays its scene.
 */
export class PerksScene extends Phaser.Scene {
  private from: 'menu' | 'pause' = 'menu';
  private panels: Panel[] = [];
  private focus = 0;
  private list!: Phaser.GameObjects.Container;
  private t = 0;

  constructor() {
    super('Perks');
  }

  init(data: PerksSceneData) {
    this.from = data?.from ?? 'menu';
    this.panels = [];
    this.focus = 0;
    this.t = 0;
  }

  create() {
    const bg = this.add.graphics();
    bg.fillStyle(PAPER, this.from === 'pause' ? 0.97 : 1);
    bg.fillRect(0, 0, WIDTH, HEIGHT);
    // header and footer bands sit above the scrolling list
    const bands = this.add.graphics().setDepth(10);
    bands.fillStyle(PAPER, 1);
    bands.fillRect(0, 0, WIDTH, VIEW_TOP - 8);
    bands.fillRect(0, VIEW_TOP + VIEW_H + 6, WIDTH, HEIGHT);
    this.add.text(WIDTH / 2, 44, 'PERKS', { fontFamily: FONT_IMPACT, fontSize: '60px', color: hex(INK) }).setOrigin(0.5).setDepth(11);
    this.add.text(WIDTH / 2, 92, keyHint('Press 1 … 9, 0 in the game to switch a perk on. Each one is used up and works for a few seconds.', 'In the game, tap a perk at the top of the screen to switch it on. Each one is used up and works for a few seconds.'), {
      fontFamily: FONT_SLAB, fontSize: '18px', color: hex(INK_SOFT),
    }).setOrigin(0.5).setDepth(11);

    this.list = this.add.container(0, VIEW_TOP);

    PERKS.forEach((p, i) => {
      const top = i * STRIDE;
      const frame = this.add.graphics();
      const icon = this.add.graphics();
      const cx = PANEL_X + 66, cy = top + PANEL_H / 2 - 8;
      icon.fillStyle(0xffffff, 1);
      icon.fillCircle(cx, cy, 40);
      icon.lineStyle(3.5, INK, 1);
      icon.strokeCircle(cx, cy, 40);
      icon.lineStyle(2, ACC.main, 0.9);
      icon.strokeCircle(cx, cy, 34);
      drawPerkIcon(icon, p.id, cx, cy, 28, ACC.main);
      const key = this.add.text(cx, cy + 46, `key ${p.key}`, { fontFamily: FONT_IMPACT, fontSize: '18px', color: hex(INK_SOFT) }).setOrigin(0.5, 0);
      const name = this.add.text(PANEL_X + 140, top + 20, p.name, { fontFamily: FONT_IMPACT, fontSize: '32px', color: hex(INK) });
      const secs = this.add.text(name.x + name.width + 14, top + 28, `${Math.round(p.durationMs / 1000)} seconds`, {
        fontFamily: FONT_SLAB, fontSize: '19px', color: hex(ACC.main),
      });
      const info = this.add.text(PANEL_X + 140, top + 66, p.info, { fontFamily: FONT_SLAB, fontSize: '20px', color: hex(INK), wordWrap: { width: 560 }, lineSpacing: 4 });
      const demo = this.add.graphics();
      const hit = this.add.zone(PANEL_X + PANEL_W / 2, top + PANEL_H / 2, PANEL_W, PANEL_H).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.setFocus(i));
      this.list.add([frame, icon, key, name, secs, info, demo, hit]);
      this.panels.push({ frame, demo, top });
      this.drawDemo(i, 1.3); // a still frame until the panel is chosen
    });

    this.add.text(WIDTH / 2, HEIGHT - 70,
      'Get perks: one free pick on level 0 of every chapter  ·  break things that wobble, put out candles, scare birds  ·  big zombies sometimes drop one, giants drop three', {
        fontFamily: FONT_HAND, fontSize: '18px', color: hex(INK), align: 'center', wordWrap: { width: 1180 },
      }).setOrigin(0.5).setDepth(11);
    const back = this.add.text(WIDTH / 2, HEIGHT - 30, keyHint('↑ ↓  choose     Esc  back', '‹  Back'), { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '22px', color: hex(INK) })
      .setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.close());

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.setFocus(this.focus - 1));
    kb.on('keydown-DOWN', () => this.setFocus(this.focus + 1));
    kb.on('keydown-W', () => this.setFocus(this.focus - 1));
    kb.on('keydown-S', () => this.setFocus(this.focus + 1));
    kb.on('keydown-ESC', () => this.close());
    kb.on('keydown-BACKSPACE', () => this.close());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setFocus(this.focus + Math.sign(dy)));
    this.setFocus(0, true);
  }

  private setFocus(i: number, instant = false) {
    const n = Phaser.Math.Clamp(i, 0, this.panels.length - 1);
    if (n !== this.focus && !instant) sfx.click();
    this.drawDemo(this.focus, 1.3);
    this.focus = n;
    this.t = 0;
    this.panels.forEach((p, k) => this.drawFrame(p, k === n));
    // keep the chosen panel in view (centred when possible)
    const maxScroll = this.panels.length * STRIDE - (STRIDE - PANEL_H) - VIEW_H;
    const target = Phaser.Math.Clamp(this.panels[n].top + PANEL_H / 2 - VIEW_H / 2, 0, Math.max(0, maxScroll));
    this.tweens.killTweensOf(this.list);
    if (instant) this.list.y = VIEW_TOP - target;
    else this.tweens.add({ targets: this.list, y: VIEW_TOP - target, duration: 220, ease: 'Cubic.Out' });
  }

  private drawFrame(p: Panel, focused: boolean) {
    const g = p.frame;
    g.clear();
    g.fillStyle(0xffffff, focused ? 1 : 0.6);
    g.fillRoundedRect(PANEL_X, p.top, PANEL_W, PANEL_H, 14);
    if (focused) {
      g.lineStyle(9, ACC.main, 0.25);
      g.strokeRoundedRect(PANEL_X - 4, p.top - 4, PANEL_W + 8, PANEL_H + 8, 17);
    }
    g.lineStyle(focused ? 4 : 2, focused ? INK : INK_FAINT, 1);
    g.strokeRoundedRect(PANEL_X, p.top, PANEL_W, PANEL_H, 14);
    // the demo window
    const dx = PANEL_X + PANEL_W - DEMO_W - 8, dy = p.top + 6;
    g.fillStyle(0xf7f6f1, 1);
    g.fillRect(dx, dy, DEMO_W, DEMO_H);
    g.lineStyle(2, focused ? INK : INK_FAINT, 1);
    g.strokeRect(dx, dy, DEMO_W, DEMO_H);
  }

  private drawDemo(i: number, time: number) {
    const p = this.panels[i];
    if (!p) return;
    p.demo.clear();
    drawPerkDemo(p.demo, PERKS[i].id, time, PANEL_X + PANEL_W - DEMO_W - 8, p.top + 6);
  }

  update(_t: number, dms: number) {
    this.t += Math.min(dms, 50) / 1000;
    this.drawDemo(this.focus, this.t);
  }

  private close() {
    sfx.click();
    if (this.from === 'pause') {
      this.scene.stop();
      this.scene.launch('Pause');
    } else this.scene.start(menuScene());
  }
}
