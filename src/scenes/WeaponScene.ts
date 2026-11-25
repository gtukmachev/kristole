import Phaser from 'phaser';
import { hint as keyHint } from '../game/touch';
import { menuScene } from '../game/menuChoice';
import { FONT_IMPACT, FONT_SLAB, HEIGHT, MENU_ORANGE, MENU_PALE, MENU_TEAL, MENU_WHITE, MENU_YELLOW, WIDTH, hex } from '../game/constants';
import { CHAPTERS, WEAPONS } from '../game/data';
import { drawWeapon } from '../game/figure';
import { sfx } from '../game/sfx';
import { storage, type WeaponId } from '../game/storage';
import { GridNav } from '../game/ui';
import { menuBackdrop } from './MenuScene';

export class WeaponScene extends Phaser.Scene {
  private chapter = 0;
  /** Opened from the menu ("Weapon"): pick and go back. Otherwise: pick and fight. */
  private fromMenu = false;

  constructor() {
    super('Weapon');
  }

  init(data: { chapter?: number; from?: 'menu' }) {
    this.chapter = data.chapter ?? 0;
    this.fromMenu = data.from === 'menu';
  }

  create() {
    sfx.playMusic('menu');
    menuBackdrop(this);
    const ch = CHAPTERS[this.chapter];
    this.add.text(WIDTH / 2, 60, 'CHOOSE FROM 2 WEAPONS', { fontFamily: FONT_IMPACT, fontSize: '60px', color: hex(MENU_ORANGE) }).setOrigin(0.5);
    const sub = this.fromMenu ? 'Your weapon for every fight' : `${ch.title} — ${ch.name}`;
    this.add.text(WIDTH / 2, 112, sub, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '24px', color: hex(MENU_PALE) }).setOrigin(0.5);

    const ids: WeaponId[] = ['sword', 'axe'];
    const mine = storage.getWeapon();
    const last: WeaponId = mine ?? 'sword';

    const cards = ids.map((id, i) => {
      const w = WEAPONS[id];
      const cx = WIDTH / 2 + (i === 0 ? -250 : 250);
      const cy = 380;
      const frame = this.add.graphics();
      const g = this.add.graphics();
      drawWeapon(g, id, { x: cx - 70, y: cy + 40 }, { x: 0.55, y: -0.83 }, 2.3, 1, MENU_WHITE, 0x000000);
      if (id === mine) this.add.text(cx, cy - 170, '✓ YOUR WEAPON', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '18px', color: hex(MENU_TEAL) }).setOrigin(0.5);
      const name = this.add.text(cx, cy + 100, w.name, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '44px', color: hex(MENU_YELLOW) }).setOrigin(0.5);
      this.add.text(cx, cy + 150, w.blurb, { fontFamily: FONT_SLAB, fontSize: '20px', color: hex(MENU_WHITE), align: 'center' }).setOrigin(0.5, 0);
      // stat bars
      const bars = this.add.graphics();
      const stat = (label: string, v: number, y: number) => {
        this.add.text(cx - 160, y - 10, label, { fontFamily: FONT_SLAB, fontSize: '16px', color: '#aaaaaa' });
        bars.lineStyle(2, MENU_WHITE, 1);
        bars.strokeRect(cx - 60, y - 7, 200, 14);
        bars.fillStyle(MENU_TEAL, 1);
        bars.fillRect(cx - 60, y - 7, 200 * v, 14);
      };
      stat('RANGE', w.range / 120, cy + 218);
      stat('DAMAGE', w.damage / 40, cy + 240);
      stat('SPEED', 300 / w.swingMs, cy + 262);
      const zone = this.add.zone(cx, cy + 40, 400, 470).setInteractive({ useHandCursor: true });
      const focus = (f: boolean) => {
        frame.clear();
        frame.lineStyle(f ? 7 : 4, f ? MENU_YELLOW : MENU_WHITE, f ? 1 : 0.5);
        frame.strokeRect(cx - 200, cy - 195, 400, 480);
        name.setScale(f ? 1.08 : 1);
      };
      const choose = () => {
        sfx.click();
        storage.setWeapon(id);
        if (this.fromMenu) this.scene.start(menuScene(), { chapter: this.chapter });
        else this.scene.start('Game', { chapter: this.chapter, level: -1, weapon: id, resumeLevel: storage.resumeLevel(this.chapter) });
      };
      return { focus, activate: choose, zone };
    });
    cards.forEach((c) => c.zone.on('pointerup', () => c.activate()));
    const nav = new GridNav(this, [cards.map((c) => ({ focus: c.focus, activate: c.activate, target: c.zone }))], () => this.scene.start(menuScene(), { chapter: this.chapter }));
    nav.set(0, ids.indexOf(last));
    this.add.text(WIDTH / 2, HEIGHT - 30, keyHint(`← →  choose     Enter  ${this.fromMenu ? 'take it' : 'fight!'}     Esc  back`, `Tap a weapon to ${this.fromMenu ? 'take it' : 'fight!'}`), { fontFamily: FONT_SLAB, fontSize: '18px', color: '#888888' }).setOrigin(0.5);
    // a way back without Esc (phones)
    const back = this.add.text(36, 30, '‹  Back', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '26px', color: '#aaaaaa' }).setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start(menuScene(), { chapter: this.chapter }));
  }
}
