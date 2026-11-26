import Phaser from 'phaser';
import { ARENA_LEFT, ARENA_RIGHT, FONT_SLAB, GROUND_Y, HEIGHT, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH, hex, setAccent, ACC } from '../game/constants';
import { SCHEMES, schemeAvailable, type SchemeId } from '../game/controls';
import { Dummy } from '../game/Dummy';
import { addGameKeys, keyboardInput, mergeTouch, type GameKeys } from '../game/keyInput';
import { NO_PERKS, Player, type PlayerHost, type Rect, type SwingKind } from '../game/Player';
import { sfx } from '../game/sfx';
import { storage } from '../game/storage';
import type { TouchInput } from '../game/TouchInput';
import { createTouch } from '../game/touchSchemes';

/**
 * The live practice ground under the Controls screen header: ground, one ledge, the hero and a dummy.
 * The controls of the scheme on screen are drawn where they are in the game, so you can try them at once.
 * The keyboard works here too (it always does). The Controls scene slides this one sideways.
 */

export interface PracticeData {
  scheme: SchemeId;
  /** Slide in from this side (-1 left, 1 right), 0 = just appear. */
  from?: number;
}

const LEDGE = { x: 330, y: 470, w: 240 };
const DUMMY_X = 900;
const overlap = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export class PracticeScene extends Phaser.Scene implements PlayerHost {
  private scheme: SchemeId = 'keyboard';
  private from = 0;
  private player?: Player;
  private dummy?: Dummy;
  private keys!: GameKeys;
  private touch?: TouchInput;
  private bloodR!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bloodL!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Sliding out or in: no input. */
  sliding = false;

  constructor() {
    super('Practice');
  }

  init(data: PracticeData) {
    this.scheme = data.scheme ?? 'keyboard';
    this.from = data.from ?? 0;
    this.player = undefined;
    this.dummy = undefined;
    this.touch = undefined;
    this.sliding = false;
  }

  create() {
    setAccent(0);
    const live = schemeAvailable(this.scheme);
    this.physics.world.setBounds(ARENA_LEFT, -400, ARENA_RIGHT - ARENA_LEFT, GROUND_Y + 400);
    this.physics.world.gravity.y = 2000;
    this.physics.world.timeScale = 1;
    const g = this.add.graphics();
    g.fillStyle(live ? PAPER : 0xcfcfca, 1);
    g.fillRect(-WIDTH, 0, WIDTH * 3, HEIGHT);
    // ground
    g.lineStyle(4, live ? INK : INK_SOFT, 1);
    g.lineBetween(0, GROUND_Y + 2, WIDTH, GROUND_Y + 2);
    g.fillStyle(live ? INK_FAINT : 0xb0b0aa, 0.5);
    g.fillRect(0, GROUND_Y + 4, WIDTH, HEIGHT - GROUND_Y);
    if (this.scheme === 'keyboard') this.drawKeys(live);
    if (!live) {
      // a phone: the keyboard is only shown, there is nothing to try
      this.add.text(WIDTH / 2, 520, 'For computers', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '40px', color: hex(INK_SOFT) }).setOrigin(0.5);
      this.slideIn();
      return;
    }
    // the ledge
    g.fillStyle(INK, 1);
    g.fillRect(LEDGE.x - LEDGE.w / 2, LEDGE.y, LEDGE.w, 10);
    g.lineStyle(3, INK_SOFT, 1);
    g.lineBetween(LEDGE.x - LEDGE.w / 2 + 20, LEDGE.y + 10, LEDGE.x - LEDGE.w / 2 + 40, GROUND_Y);
    g.lineBetween(LEDGE.x + LEDGE.w / 2 - 20, LEDGE.y + 10, LEDGE.x + LEDGE.w / 2 - 40, GROUND_Y);

    this.player = new Player(this, this, 520, storage.getWeapon() ?? 'sword', storage.getProfile());
    this.player.fx = { ...NO_PERKS };
    this.player.god = true;
    const zone = this.add.zone(LEDGE.x, LEDGE.y + 6, LEDGE.w, 12);
    this.physics.add.existing(zone, true);
    const b = zone.body as Phaser.Physics.Arcade.StaticBody;
    b.checkCollision.down = false;
    b.checkCollision.left = false;
    b.checkCollision.right = false;
    this.physics.add.collider(this.player.zone, zone);
    this.dummy = new Dummy(this, DUMMY_X);

    const blood = (angle: { min: number; max: number }) =>
      this.add.particles(0, 0, 'dot', {
        speed: { min: 120, max: 420 }, angle, gravityY: 1100, lifespan: { min: 500, max: 1000 },
        scale: { start: 1.1, end: 0.4 }, tint: [ACC.main, ACC.dark], emitting: false,
      }).setDepth(30);
    this.bloodR = blood({ min: -70, max: 15 });
    this.bloodL = blood({ min: 165, max: 250 });
    this.dust = this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 160 }, angle: { min: -160, max: -20 }, gravityY: 500, lifespan: { min: 300, max: 700 },
      scale: { start: 0.9, end: 0.2 }, tint: INK_SOFT, alpha: { start: 0.6, end: 0 }, emitting: false,
    }).setDepth(25);

    this.keys = addGameKeys(this);
    // drawn on a computer too (to see how it looks); only fingers move it
    {
      this.touch = createTouch(this, { perkSlot: () => ({ x: -999, y: -999 }), perkSlots: 0, onPerk: () => {}, onPause: () => {}, pauseAt: null }, this.scheme, { inWorld: true });
    }
    this.slideIn();
    (window as unknown as { __practice?: PracticeScene }).__practice = this;
  }

  /** Hands switched on the Controls screen: the controls move over at once. */
  handsChanged() {
    this.touch?.reset();
  }

  private slideIn() {
    const cam = this.cameras.main;
    if (!this.from) return;
    cam.scrollX = -this.from * WIDTH;
    this.sliding = true;
    this.tweens.add({ targets: cam, scrollX: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => (this.sliding = false) });
  }

  /** Slide away to this side, then call done. */
  slideOut(dir: number, done: () => void) {
    this.sliding = true;
    this.touch?.reset();
    this.tweens.add({ targets: this.cameras.main, scrollX: -dir * WIDTH, duration: 220, ease: 'Cubic.easeIn', onComplete: done });
  }

  /** The keys and what they do, on the wall behind the ground. */
  private drawKeys(live: boolean) {
    const ink = live ? INK : INK_SOFT;
    const g = this.add.graphics();
    const key = (x: number, y: number, label: string, w = 54) => {
      g.fillStyle(live ? 0xffffff : 0xdcdcd6, 1);
      g.fillRoundedRect(x - w / 2, y - 27, w, 54, 8);
      g.lineStyle(3, ink, 1);
      g.strokeRoundedRect(x - w / 2, y - 27, w, 54, 8);
      this.add.text(x, y, label, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: label.length > 2 ? '18px' : '26px', color: hex(ink) }).setOrigin(0.5);
    };
    const note = (x: number, y: number, s: string) => this.add.text(x, y, s, { fontFamily: FONT_SLAB, fontSize: '19px', color: hex(ink), align: 'center' }).setOrigin(0.5, 0);
    // movement: arrows + Space
    const ax = 250, ay = 250;
    key(ax, ay - 60, '↑');
    key(ax - 60, ay, '←');
    key(ax, ay, '↓');
    key(ax + 60, ay, '→');
    key(ax, ay + 70, 'Space', 170);
    note(ax, ay + 108, '← → walk · ↑ / Space jump\n↑ again in the air = flip · ↓ duck');
    // fighting: W S A D
    const wx = 640, wy = 250;
    key(wx, wy - 60, 'W');
    key(wx - 60, wy, 'A');
    key(wx, wy, 'S');
    key(wx + 60, wy, 'D');
    note(wx, wy + 48, 'W swing up · S swing down\nA / D block (hold)');
    // the rest
    const rx = 1010, ry = 220;
    key(rx - 90, ry, '1…0', 90);
    note(rx + 40, ry - 12, 'perks').setOrigin(0, 0);
    key(rx - 90, ry + 70, 'Esc', 90);
    note(rx + 40, ry + 58, 'pause').setOrigin(0, 0);
    key(rx - 90, ry + 140, 'M', 90);
    note(rx + 40, ry + 128, 'sound').setOrigin(0, 0);
  }

  update(_t: number, deltaMs: number) {
    const p = this.player;
    if (!p) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.touch?.draw();
    const input = keyboardInput(this.keys);
    if (this.touch) mergeTouch(input, this.touch.read());
    if (this.sliding) input.left = input.right = input.down = input.jumpPressed = input.swingHigh = input.swingLow = input.block = false;
    p.update(dt, input);
    this.dummy?.update(dt, p.x);
  }

  // ---- PlayerHost
  playerSwing(player: Player, kind: SwingKind, box: Rect, hitOnce: Set<unknown>) {
    const d = this.dummy;
    if (!d || hitOnce.has(d) || !overlap(box, d.hurtbox())) return;
    hitOnce.add(d);
    const dir = player.flipping ? Math.sign(d.x - player.x) || player.facing : player.facing;
    d.hit(kind, dir);
    const at = d.hitPoint(kind, dir);
    (dir > 0 ? this.bloodR : this.bloodL).explode(12, at.x, at.y);
    sfx.hit(false);
  }

  playerDied() {
    /* the hero is god here */
  }

  dustAt(x: number, y: number, n: number) {
    this.dust.explode(n, x, y);
  }

  nearestAhead(x: number, dir: number): number | null {
    const d = this.dummy;
    if (!d) return null;
    const hb = d.hurtbox();
    const edge = dir > 0 ? hb.left - x : x - hb.right;
    return edge >= 0 ? edge : null;
  }

  throwSpear() {
    /* no spears here */
  }

  static titleOf(id: SchemeId) {
    return SCHEMES.find((s) => s.id === id)?.title ?? id;
  }
}
