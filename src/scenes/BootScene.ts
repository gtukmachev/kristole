import Phaser from 'phaser';
import { GROUND_Y } from '../game/constants';

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
    g.destroy();
    void GROUND_Y;

    // URL shortcuts for testing: ?scene=game&chapter=0&level=2&weapon=axe
    const p = new URLSearchParams(window.location.search);
    const target = p.get('scene');
    const chapter = Number(p.get('chapter') ?? 0);
    const level = Number(p.get('level') ?? 0);
    const weapon = p.get('weapon') === 'axe' ? 'axe' : 'sword';
    if (target === 'game') this.scene.start('Game', { chapter, level, weapon });
    else if (target === 'weapon') this.scene.start('Weapon', { chapter });
    else if (target === 'avatar') this.scene.start('Avatar');
    else if (target === 'leaderboard') this.scene.start('Leaderboard');
    else if (target === 'result') this.scene.start('Result', { win: p.has('win'), score: 1234, chapter, level, weapon, kills: 17 });
    else this.scene.start('Menu');
  }
}
