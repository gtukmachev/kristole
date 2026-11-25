import type Phaser from 'phaser';
import { storage } from './storage';

/** Starts a chapter: with the player's weapon, or first the weapon choice if he has none yet. */
export function startChapter(scene: Phaser.Scene, chapter: number) {
  const weapon = storage.getWeapon();
  if (weapon) scene.scene.start('Game', { chapter, level: -1, weapon, resumeLevel: storage.resumeLevel(chapter) });
  else scene.scene.start('Weapon', { chapter });
}
