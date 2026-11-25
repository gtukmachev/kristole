import Phaser from 'phaser';
import { HEIGHT, MENU_BG, WIDTH } from './game/constants';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MapMenuScene } from './scenes/MapMenuScene';
import { WeaponScene } from './scenes/WeaponScene';
import { AvatarScene } from './scenes/AvatarScene';
import { LeaderboardScene } from './scenes/LeaderboardScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { PerksScene } from './scenes/PerksScene';
import { installKeyDebug } from './keyDebug';
import { storage } from './game/storage';

installKeyDebug();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: MENU_BG,
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 2000 }, debug: false } },
  scene: [BootScene, MapMenuScene, MenuScene, WeaponScene, AvatarScene, LeaderboardScene, GameScene, PauseScene, ResultScene, PerksScene],
});

(window as unknown as { __kristole: Phaser.Game }).__kristole = game;
// test hook
(window as unknown as { __storage: typeof storage }).__storage = storage;
