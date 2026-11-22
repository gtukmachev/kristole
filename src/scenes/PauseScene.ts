import Phaser from 'phaser';
import { FONT_IMPACT, FONT_SLAB, HEIGHT, INK, PAPER, WIDTH, hex } from '../game/constants';
import { sfx } from '../game/sfx';
import { GridNav } from '../game/ui';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(PAPER, 0.82);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    this.add.text(WIDTH / 2, 190, 'PAUSED', { fontFamily: FONT_IMPACT, fontSize: '96px', color: hex(INK) }).setOrigin(0.5);
    const items = ['Resume', 'Restart level', 'Main menu'];
    const actions = [() => this.resume(), () => this.restart(), () => this.toMenu()];
    const texts = items.map((s, i) =>
      this.add
        .text(WIDTH / 2, 320 + i * 72, s, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '42px', color: hex(INK) })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true }),
    );
    const frame = this.add.graphics();
    const rows = texts.map((t, i) => [
      {
        focus: (f: boolean) => {
          if (!f) return;
          frame.clear();
          frame.lineStyle(4, INK, 1);
          frame.strokeRect(WIDTH / 2 - 200, t.y - 32, 400, 64);
        },
        activate: () => {
          sfx.click();
          actions[i]();
        },
      },
    ]);
    texts.forEach((t, i) => t.on('pointerup', () => rows[i][0].activate()));
    new GridNav(this, rows, () => this.resume());
    this.add.text(WIDTH / 2, HEIGHT - 60, 'Controls:  A / D or ← →  move   ·   ↑  jump   ·   ↓  duck   ·   W  swing up   ·   S  swing down   ·   M  sound', {
      fontFamily: FONT_SLAB, fontSize: '18px', color: hex(INK),
    }).setOrigin(0.5);
  }

  private resume() {
    this.scene.stop();
    this.scene.resume('Game');
  }

  private restart() {
    const game = this.scene.get('Game') as Phaser.Scene & { restartData?: () => object };
    this.scene.stop();
    game.scene.restart(game.restartData?.());
  }

  private toMenu() {
    this.scene.stop('Game');
    this.scene.start('Menu');
  }
}
