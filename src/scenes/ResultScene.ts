import Phaser from 'phaser';
import { startChapter } from '../game/startChapter';
import { menuScene } from '../game/menuChoice';
import { ACC, setAccent, FONT_HAND, FONT_IMPACT, FONT_SLAB, HEIGHT, INK, INK_SOFT, PAPER, WIDTH, hex } from '../game/constants';
import { CHAPTERS } from '../game/data';
import { storage, type WeaponId } from '../game/storage';
import { GridNav } from '../game/ui';
import { sfx } from '../game/sfx';

export interface ResultData {
  win: boolean;
  score: number;
  chapter: number;
  level: number;
  weapon: WeaponId;
  kills: number;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  create(d: ResultData) {
    sfx.playMusic(null);
    setAccent(d.chapter);
    const g = this.add.graphics();
    g.fillStyle(PAPER, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    // blood drips from the top edge
    for (let x = 0; x < WIDTH; x += Phaser.Math.Between(18, 60)) {
      const len = Phaser.Math.Between(10, d.win ? 40 : 130);
      g.fillStyle(ACC.main, 1);
      g.fillRect(x, 0, 7, len);
      g.fillCircle(x + 3.5, len, 6);
    }
    const profile = storage.getProfile();
    const rank = d.score > 0
      ? storage.addScore({ name: profile.name, score: d.score, chapter: d.chapter, level: d.level, weapon: d.weapon, date: Date.now() })
      : -1;
    const ch = CHAPTERS[d.chapter];
    const title = d.win ? (d.chapter === CHAPTERS.length - 1 ? 'YOU BEAT KRISTOLE!' : 'CHAPTER COMPLETE!') : 'GAME OVER';
    this.add.text(WIDTH / 2, 170, title, { fontFamily: FONT_IMPACT, fontSize: '100px', color: hex(INK) }).setOrigin(0.5);
    this.add.text(WIDTH / 2, 250, `${ch.title} — ${ch.name}  ·  reached level ${d.level + 1}`, {
      fontFamily: FONT_SLAB, fontSize: '26px', color: hex(INK_SOFT),
    }).setOrigin(0.5);
    this.add.text(WIDTH / 2, 330, `SCORE  ${d.score}`, { fontFamily: FONT_IMPACT, fontSize: '64px', color: hex(INK) }).setOrigin(0.5);
    this.add.text(WIDTH / 2, 385, `Zombies defeated: ${d.kills}`, { fontFamily: FONT_HAND, fontSize: '26px', color: hex(INK) }).setOrigin(0.5);
    if (rank === 0) {
      this.add.text(WIDTH / 2, 430, 'NEW HIGH SCORE!', { fontFamily: FONT_IMPACT, fontSize: '36px', color: hex(ACC.main) }).setOrigin(0.5);
    } else if (rank > 0) {
      this.add.text(WIDTH / 2, 430, `You are #${rank + 1} on the leaderboard`, { fontFamily: FONT_HAND, fontSize: '28px', color: hex(INK) }).setOrigin(0.5);
    }
    if (d.win && d.chapter + 1 < CHAPTERS.length) {
      this.add.text(WIDTH / 2, 470, `${CHAPTERS[d.chapter + 1].title} unlocked!`, { fontFamily: FONT_HAND, fontSize: '26px', color: hex(INK) }).setOrigin(0.5);
    }

    const opts: { label: string; act: () => void }[] = [];
    if (d.win && d.chapter + 1 < CHAPTERS.length) opts.push({ label: 'Next chapter', act: () => startChapter(this, d.chapter + 1) });
    opts.push({ label: d.win ? 'Play again' : 'Try again', act: () => this.scene.start('Game', { chapter: d.chapter, level: -1, weapon: d.weapon, resumeLevel: storage.resumeLevel(d.chapter) }) });
    opts.push({ label: 'Leaderboard', act: () => this.scene.start('Leaderboard', { highlight: rank }) });
    opts.push({ label: 'Main menu', act: () => this.scene.start(menuScene(), { chapter: d.chapter }) });
    const frame = this.add.graphics();
    const spacing = 260;
    const x0 = WIDTH / 2 - ((opts.length - 1) * spacing) / 2;
    const items = opts.map((o, i) => {
      const t = this.add
        .text(x0 + i * spacing, 580, o.label, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '30px', color: hex(INK) })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const item = {
        focus: (f: boolean) => {
          if (!f) return;
          frame.clear();
          frame.lineStyle(4, INK, 1);
          frame.strokeRect(t.x - 120, t.y - 30, 240, 60);
        },
        activate: () => {
          sfx.click();
          o.act();
        },
        target: t,
      };
      t.on('pointerup', item.activate);
      return item;
    });
    // Ignore keys for a moment so a held attack key doesn't skip the screen.
    this.time.delayedCall(600, () => new GridNav(this, [items], () => this.scene.start(menuScene(), { chapter: d.chapter })));
    items[0].focus(true);
  }
}
