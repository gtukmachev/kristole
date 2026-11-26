import Phaser from 'phaser';
import { menuScene } from '../game/menuChoice';
import { FONT_IMPACT, FONT_SLAB, HEIGHT, INK, PAPER, WIDTH, hex } from '../game/constants';
import { sfx } from '../game/sfx';
import { GridNav } from '../game/ui';
import { isTouch } from '../game/touch';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(PAPER, 0.82);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    this.add.text(WIDTH / 2, 170, 'PAUSED', { fontFamily: FONT_IMPACT, fontSize: '96px', color: hex(INK) }).setOrigin(0.5);
    const soundLabel = () => (sfx.muted ? 'Sound: off' : 'Sound: on');
    const items = [
      { label: 'Resume', act: () => this.resume() },
      { label: 'Restart level', act: () => this.restart() },
      { label: 'Perks', act: () => this.perks() },
      { label: soundLabel(), act: () => { sfx.toggleMute(); texts[3].setText(soundLabel()); } },
      { label: 'Controls', act: () => this.controls() },
      { label: 'Main menu', act: () => this.toMenu() },
    ];
    const actions = items.map((it) => it.act);
    const step = items.length > 5 ? 60 : 66;
    const top = items.length > 5 ? 262 : 280;
    const texts: Phaser.GameObjects.Text[] = items.map((it, i) =>
      this.add
        .text(WIDTH / 2, top + i * step, it.label, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '40px', color: hex(INK) })
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
          frame.strokeRect(WIDTH / 2 - 200, t.y - 29, 400, 58);
        },
        activate: () => {
          sfx.click();
          actions[i]();
        },
        target: t,
      },
    ]);
    texts.forEach((t, i) => t.on('pointerup', () => rows[i][0].activate()));
    new GridNav(this, rows, () => this.resume());
    if (!isTouch()) this.add.text(WIDTH / 2, HEIGHT - 50, '← →  move  ·  ↑ / Space  jump, again in air = flip  ·  ↓  duck  ·  W  swing up  ·  S  swing down  ·  A / D  block  ·  1…0  perks  ·  M  sound', {
      fontFamily: FONT_SLAB, fontSize: '18px', color: hex(INK),
    }).setOrigin(0.5);
  }

  private controls() {
    this.scene.stop();
    this.scene.launch('Controls', { from: 'pause' });
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

  private perks() {
    this.scene.stop();
    this.scene.launch('Perks', { from: 'pause' });
  }

  private toMenu() {
    this.scene.stop('Game');
    this.scene.start(menuScene());
  }
}
