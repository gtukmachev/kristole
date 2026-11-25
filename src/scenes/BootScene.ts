import Phaser from 'phaser';
import { menuScene } from '../game/menuChoice';
import { GROUND_Y } from '../game/constants';
import { CHAPTERS } from '../game/data';
import { storage } from '../game/storage';

/** Generates the few textures the game needs (no image files) and routes to the first scene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('dot', 8, 8);
    g.clear();
    // blood splat on the ground
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(30, 8, 56, 10);
    g.fillEllipse(12, 7, 14, 8);
    g.fillEllipse(48, 9, 18, 6);
    g.fillCircle(56, 6, 2.5);
    g.fillCircle(4, 10, 2);
    g.generateTexture('splat', 60, 16);
    g.clear();
    // knocked-off zombie head
    const c = 13, r = 10;
    g.fillStyle(0xf7f7f2, 1);
    g.fillCircle(c, c, r);
    g.lineStyle(2.6, 0x111111, 1);
    g.strokeCircle(c, c, r);
    g.fillStyle(0x111111, 1);
    g.fillCircle(c + 2.5, c - 1.5, 2);
    g.fillCircle(c + 7, c - 1, 1.6);
    g.lineStyle(1.4, 0x111111, 1);
    g.lineBetween(c + 1, c + 4.5, c + 7.5, c + 4);
    g.fillStyle(0xc4000c, 1);
    g.fillEllipse(c - 1, c + r - 1, 10, 4);
    g.generateTexture('zhead', 26, 26);
    g.clear();
    // blood drop on the 'camera lens'
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 32, 18);
    g.fillCircle(52, 24, 7);
    g.fillCircle(14, 46, 6);
    g.fillCircle(44, 52, 5);
    g.fillCircle(58, 44, 3);
    g.fillCircle(8, 20, 3);
    g.fillRect(28, 32, 7, 26);
    g.fillCircle(31.5, 58, 5);
    g.generateTexture('drop', 64, 64);
    g.clear();
    // health heart: red with an ink outline
    const heart = (sc: number) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push({ x: 22 + x * sc, y: 20 + y * sc });
      }
      return pts as unknown as Phaser.Math.Vector2[];
    };
    // white fill, tinted with the chapter's accent colour in the game
    g.fillStyle(0xffffff, 1);
    g.fillPoints(heart(1.15), true);
    g.lineStyle(3, 0x111111, 1);
    g.strokePoints(heart(1.15), true);
    g.generateTexture('heart', 44, 42);
    g.destroy();
    void GROUND_Y;

    storage.init().then(() => this.route());
  }

  private route() {
    // URL shortcuts for testing: ?scene=game&chapter=0&level=2&weapon=axe
    const p = new URLSearchParams(window.location.search);
    // Test shortcut: /<chapter>/<level> (1-based), e.g. /2/3 = chapter 2, level 3; /2/0 = its level 0 (perk pick).
    const path = window.location.pathname.slice(import.meta.env.BASE_URL.length - 1);
    const deep = /^\/(\d+)\/(\d+)\/?$/.exec(path);
    if (deep) {
      const ch = Phaser.Math.Clamp(Number(deep[1]) - 1, 0, CHAPTERS.length - 1);
      const lv = Phaser.Math.Clamp(Number(deep[2]) - 1, -1, CHAPTERS[ch].levels - 1);
      let w: 'sword' | 'axe' = 'sword';
      try {
        if (window.localStorage.getItem('kristole.weapon') === 'axe') w = 'axe';
      } catch {
        /* ignore */
      }
      this.scene.start('Game', { chapter: ch, level: lv, weapon: w });
      return;
    }
    const target = p.get('scene');
    const chapter = Number(p.get('chapter') ?? 0);
    const level = Number(p.get('level') ?? 0);
    const weapon = p.get('weapon') === 'axe' ? 'axe' : 'sword';
    // &perks=1111111111 – perk counts per slot (1..0), for testing
    const perks = p.get('perks')?.padEnd(10, '0').slice(0, 10).split('').map(Number);
    if (target === 'game') this.scene.start('Game', { chapter, level, weapon, fromPlace: p.get('from') ?? undefined, perks });
    else if (target === 'weapon') this.scene.start('Weapon', { chapter });
    else if (target === 'avatar') this.scene.start('Avatar');
    else if (target === 'classic') this.scene.start('Menu');
    else if (target === 'map') this.scene.start('MapMenu');
    else if (target === 'leaderboard') this.scene.start('Leaderboard');
    else if (target === 'result') this.scene.start('Result', { win: p.has('win'), score: 1234, chapter, level, weapon, kills: 17 });
    else this.scene.start(menuScene());
  }
}
