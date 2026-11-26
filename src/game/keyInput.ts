import Phaser from 'phaser';
import type { PlayerInput } from './Player';

export type GameKeys = Record<'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'left' | 'right' | 'space' | 'esc' | 'm', Phaser.Input.Keyboard.Key>;

export function addGameKeys(scene: Phaser.Scene): GameKeys {
  const kb = scene.input.keyboard!;
  kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
  return kb.addKeys({
    w: 'W', a: 'A', s: 'S', d: 'D',
    up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
    space: 'SPACE', esc: 'ESC', m: 'M',
  }) as GameKeys;
}

/** Arrows (+ Space) move, WASD fights: W / S swing, A / D guard. */
export function keyboardInput(k: GameKeys): PlayerInput {
  const JD = Phaser.Input.Keyboard.JustDown;
  return {
    left: k.left.isDown,
    right: k.right.isDown,
    down: k.down.isDown,
    jumpPressed: JD(k.up) || JD(k.space),
    swingHigh: JD(k.w),
    swingLow: JD(k.s),
    block: k.a.isDown || k.d.isDown,
    up: k.up.isDown || k.space.isDown,
  };
}

/** Add the touch controls on top of the keys (both work at once). */
export function mergeTouch(input: PlayerInput, t: { left: boolean; right: boolean; down: boolean; up: boolean; jumpPressed: boolean; swingHigh: boolean; swingLow: boolean; block: boolean }) {
  input.left ||= t.left;
  input.right ||= t.right;
  input.down ||= t.down;
  input.up ||= t.up;
  input.jumpPressed ||= t.jumpPressed;
  input.swingHigh ||= t.swingHigh;
  input.swingLow ||= t.swingLow;
  input.block ||= t.block;
}
