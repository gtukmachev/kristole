import Phaser from 'phaser';
import {
  FONT_IMPACT, FONT_SLAB, HEIGHT, MENU_BG, MENU_DARKRED, MENU_ORANGE, MENU_PALE, MENU_TEAL, MENU_WHITE, WIDTH, hex,
} from '../game/constants';
import { CHAPTERS } from '../game/data';
import { storage } from '../game/storage';
import { GridNav, buttonItem, makeButton } from '../game/ui';
import { sfx } from '../game/sfx';

type Seg = [number, number, number, number];

// Hand-drawn KRISTOLE logo strokes, letter box 100 x 150 (traced from Leo's menu).
const LETTERS: Seg[][] = [
  [[10, 0, 12, 150], [72, 8, 12, 82], [18, 72, 80, 140]], // K
  [[18, 150, 50, 2], [42, 6, 100, 26], [100, 26, 32, 82], [46, 70, 96, 142]], // R
  [[50, 10, 52, 145], [24, 8, 78, 14], [28, 140, 82, 146]], // I
  [[72, 0, 10, 55], [5, 50, 95, 82], [92, 76, 24, 140]], // S
  [[4, 14, 96, 26], [50, 18, 50, 152]], // T
  [[14, 48, 60, 8], [60, 8, 102, 58], [102, 58, 56, 102], [56, 102, 14, 48]], // O
  [[42, 0, 26, 112], [20, 100, 96, 132]], // L
  [[22, 10, 26, 150], [8, 16, 102, 10], [14, 80, 98, 84], [14, 146, 102, 150]], // E
];

export function drawLogo(scene: Phaser.Scene, cx: number, top: number, scale: number, color = MENU_ORANGE) {
  const g = scene.add.graphics();
  const spacing = 210 * scale;
  const startX = cx - (spacing * (LETTERS.length - 1) + 100 * scale) / 2;
  let seed = 3;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  LETTERS.forEach((segs, i) => {
    const ox = startX + i * spacing;
    for (const [x1, y1, x2, y2] of segs) {
      for (let pass = 0; pass < 3; pass++) {
        const j = () => (rand() - 0.5) * 5;
        const dx = x2 - x1, dy = y2 - y1;
        const ext = 0.04 + rand() * 0.04; // chalk overshoot
        g.lineStyle(pass === 0 ? 7 * scale * 1.6 : 3.5 * scale * 1.6, color, pass === 0 ? 0.95 : 0.6);
        g.lineBetween(
          ox + (x1 - dx * ext) * scale + j(),
          top + (y1 - dy * ext) * scale + j(),
          ox + (x2 + dx * ext) * scale + j(),
          top + (y2 + dy * ext) * scale + j(),
        );
      }
    }
  });
  return g;
}

export function menuBackdrop(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  g.fillStyle(MENU_BG, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle(0xffffff, Math.random() * 0.05);
    g.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 2, 2);
  }
  return g;
}

export class MenuScene extends Phaser.Scene {
  private chapter = 0;
  private chapterTitle!: Phaser.GameObjects.Text;
  private chapterName!: Phaser.GameObjects.Text;
  private lockText!: Phaser.GameObjects.Text;
  private arrows!: Phaser.GameObjects.Graphics;
  private toast!: Phaser.GameObjects.Text;
  private chapterFocused = false;

  constructor() {
    super('Menu');
  }

  init(data: { chapter?: number }) {
    if (typeof data?.chapter === 'number') this.chapter = data.chapter;
  }

  create() {
    menuBackdrop(this);
    const logo = drawLogo(this, WIDTH / 2, 38, 0.66);
    logo.setAlpha(0);
    this.tweens.add({ targets: logo, alpha: 1, duration: 600 });

    const bw = 300, bh = 108, gap = 28;
    const row1y = 255, row2y = 392;
    const x0 = WIDTH / 2 - bw - gap;
    const play = makeButton(this, { x: x0, y: row1y, w: bw, h: bh, label: 'Play', onClick: () => this.play() });
    const avatar = makeButton(this, { x: WIDTH / 2, y: row1y, w: bw, h: bh, label: 'Avatar', onClick: () => this.scene.start('Avatar') });
    const board = makeButton(this, {
      x: WIDTH / 2 + bw + gap, y: row1y, w: bw, h: bh, label: 'Leader\nboard', fontSize: 40,
      onClick: () => this.scene.start('Leaderboard'),
    });
    const soon = () => this.showToast('Coming soon!');
    const events = makeButton(this, { x: WIDTH / 2 - bw / 2 - gap / 2, y: row2y, w: bw, h: bh, label: 'Events', color: MENU_DARKRED, enabled: false, onClick: soon, onDisabled: soon });
    const rewards = makeButton(this, { x: WIDTH / 2 + bw / 2 + gap / 2, y: row2y, w: bw, h: bh, label: 'Rewards', color: MENU_DARKRED, enabled: false, onClick: soon, onDisabled: soon });

    // Chapter selector.
    const cy = 540;
    this.chapterTitle = this.add.text(WIDTH / 2, cy, '', { fontFamily: FONT_IMPACT, fontSize: '68px', color: hex(MENU_ORANGE) }).setOrigin(0.5);
    this.chapterName = this.add.text(WIDTH / 2, cy + 52, '', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '30px', color: hex(MENU_PALE) }).setOrigin(0.5);
    this.lockText = this.add.text(WIDTH / 2, cy + 90, '', { fontFamily: FONT_SLAB, fontSize: '18px', color: '#888888' }).setOrigin(0.5);
    this.arrows = this.add.graphics();
    const leftHit = this.add.zone(WIDTH / 2 - 330, cy + 40, 110, 120).setInteractive({ useHandCursor: true });
    const rightHit = this.add.zone(WIDTH / 2 + 330, cy + 40, 110, 120).setInteractive({ useHandCursor: true });
    leftHit.on('pointerup', () => this.changeChapter(-1));
    rightHit.on('pointerup', () => this.changeChapter(1));
    const titleHit = this.add.zone(WIDTH / 2, cy + 30, 460, 120).setInteractive({ useHandCursor: true });
    titleHit.on('pointerup', () => this.play());

    this.add.text(24, HEIGHT - 34, 'GAME DESIGN BY ', { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '18px', color: hex(MENU_WHITE) })
      .setOrigin(0, 0)
      .setName('credit');
    this.add.text(24 + 166, HEIGHT - 34, 'LEO T.', { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '18px', fontStyle: 'bold italic', color: hex(MENU_WHITE) });
    this.add.text(WIDTH - 24, HEIGHT - 34, 'M — sound on/off', { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', color: '#666666' }).setOrigin(1, 0);

    this.toast = this.add.text(WIDTH / 2, row2y + 80, '', { fontFamily: FONT_SLAB, fontSize: '22px', color: hex(MENU_PALE) }).setOrigin(0.5).setAlpha(0);

    this.refreshChapter();

    const chapterItem = {
      focus: (f: boolean) => {
        this.chapterFocused = f;
        this.refreshChapter();
      },
      activate: () => this.play(),
      left: () => this.changeChapter(-1),
      right: () => this.changeChapter(1),
    };
    new GridNav(this, [[buttonItem(play), buttonItem(avatar), buttonItem(board)], [buttonItem(events), buttonItem(rewards)], [chapterItem]]);
    this.input.keyboard!.on('keydown-M', () => sfx.toggleMute());
  }

  private showToast(s: string) {
    this.toast.setText(s).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1000, duration: 500 });
  }

  private changeChapter(d: number) {
    const n = CHAPTERS.length;
    this.chapter = (this.chapter + d + n) % n;
    sfx.click();
    this.refreshChapter();
    this.tweens.add({ targets: [this.chapterTitle, this.chapterName], x: { from: WIDTH / 2 + d * 30, to: WIDTH / 2 }, duration: 180, ease: 'Cubic.Out' });
  }

  private get locked() {
    return this.chapter > storage.getProgress().unlockedChapter;
  }

  private refreshChapter() {
    const ch = CHAPTERS[this.chapter];
    this.chapterTitle.setText(ch.title).setAlpha(this.locked ? 0.4 : 1);
    this.chapterName.setText(ch.name).setAlpha(this.locked ? 0.4 : 1);
    this.lockText.setText(this.locked ? '🔒 Finish the previous chapter to unlock' : this.chapterFocused ? 'Press Enter to play' : '');
    const g = this.arrows;
    g.clear();
    const cy = 580;
    const s = this.chapterFocused ? 1.12 : 1;
    g.lineStyle(this.chapterFocused ? 6 : 5, MENU_TEAL, 1);
    const L = WIDTH / 2 - 330, R = WIDTH / 2 + 330;
    g.strokeTriangle(L + 44 * s, cy - 50 * s, L + 44 * s, cy + 50 * s, L - 46 * s, cy);
    g.strokeTriangle(R - 44 * s, cy - 50 * s, R - 44 * s, cy + 50 * s, R + 46 * s, cy);
  }

  private play() {
    if (this.locked) {
      sfx.denied();
      this.showToast('This chapter is locked');
      return;
    }
    sfx.click();
    this.scene.start('Weapon', { chapter: this.chapter });
  }
}
