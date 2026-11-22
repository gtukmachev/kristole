import Phaser from 'phaser';
import { sfx } from '../game/sfx';
import { FONT_IMPACT, FONT_SLAB, HEIGHT, MENU_ORANGE, MENU_PALE, MENU_WHITE, MENU_YELLOW, WIDTH, hex } from '../game/constants';
import { CHAPTERS, WEAPONS } from '../game/data';
import { storage } from '../game/storage';
import { GridNav, buttonItem, makeButton } from '../game/ui';
import { menuBackdrop } from './MenuScene';

export class LeaderboardScene extends Phaser.Scene {
  private highlight = -1;

  constructor() {
    super('Leaderboard');
  }

  init(data: { highlight?: number }) {
    this.highlight = data?.highlight ?? -1;
  }

  create() {
    sfx.playMusic('menu');
    menuBackdrop(this);
    this.add.text(WIDTH / 2, 60, 'LEADERBOARD', { fontFamily: FONT_IMPACT, fontSize: '64px', color: hex(MENU_ORANGE) }).setOrigin(0.5);
    const board = storage.getBoard();
    const cols = [200, 290, 640, 900, 1080];
    const head = ['#', 'NAME', 'SCORE', 'REACHED', 'WEAPON'];
    head.forEach((h, i) =>
      this.add.text(cols[i], 130, h, { fontFamily: FONT_SLAB, fontSize: '18px', color: '#888888' }).setOrigin(i === 2 ? 1 : 0, 0),
    );
    const g = this.add.graphics();
    g.lineStyle(2, MENU_WHITE, 0.4);
    g.lineBetween(180, 158, 1180, 158);
    if (!board.length) {
      this.add.text(WIDTH / 2, 320, 'No scores yet.\nPlay a game to get on the board!', {
        fontFamily: FONT_SLAB, fontSize: '28px', color: hex(MENU_PALE), align: 'center',
      }).setOrigin(0.5);
    }
    board.forEach((e, i) => {
      const y = 172 + i * 40;
      const color = i === this.highlight ? hex(MENU_ORANGE) : i < 3 ? hex(MENU_YELLOW) : hex(MENU_WHITE);
      const st = { fontFamily: FONT_SLAB, fontStyle: i < 3 ? 'bold' : 'normal', fontSize: '26px', color };
      const ch = CHAPTERS[e.chapter];
      this.add.text(cols[0], y, String(i + 1), st);
      this.add.text(cols[1], y, e.name, st);
      this.add.text(cols[2], y, String(e.score), st).setOrigin(1, 0);
      this.add.text(cols[3], y, ch ? `Ch.${e.chapter + 1} · Lvl ${e.level + 1}` : '-', { ...st, fontSize: '22px' });
      this.add.text(cols[4], y, WEAPONS[e.weapon]?.name ?? '-', { ...st, fontSize: '22px' });
      if (i === this.highlight) {
        g.lineStyle(3, MENU_ORANGE, 1);
        g.strokeRect(180, y - 4, 1000, 38);
      }
    });
    const back = makeButton(this, { x: WIDTH / 2, y: HEIGHT - 60, w: 240, h: 70, label: 'Back', fontSize: 34, onClick: () => this.scene.start('Menu') });
    new GridNav(this, [[buttonItem(back)]], () => this.scene.start('Menu'));
  }
}
