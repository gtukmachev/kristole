import Phaser from 'phaser';
import type { SchemeId } from './controls';
import { JoystickControls } from './TouchControls';
import type { TouchHost, TouchInput, TouchOptions } from './TouchInput';

/** Touch controls for a scheme (none for the keyboard). */
export function createTouch(scene: Phaser.Scene, host: TouchHost, scheme: SchemeId, opts: TouchOptions = {}): TouchInput | undefined {
  switch (scheme) {
    case 'joy1':
      return new JoystickControls(scene, host, opts);
    default:
      return undefined;
  }
}
