import Phaser from 'phaser';
import type { SchemeId } from './controls';
import { SimpleControls } from './SimpleControls';
import { JoystickControls } from './TouchControls';
import type { TouchHost, TouchInput, TouchOptions } from './TouchInput';

/** Touch controls for a scheme (none for the keyboard). */
export function createTouch(scene: Phaser.Scene, host: TouchHost, scheme: SchemeId, opts: TouchOptions = {}): TouchInput | undefined {
  switch (scheme) {
    case 'joy1':
      return new JoystickControls(scene, host, 1, opts, 'joy1');
    case 'simple':
      return new SimpleControls(scene, host, opts);
    case 'joy2':
      return new JoystickControls(scene, host, 2, opts, 'joy2');
    default:
      return undefined;
  }
}
