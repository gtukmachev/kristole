import Phaser from 'phaser';
import {
  ARENA_LEFT, ARENA_RIGHT, BLOOD, FIG, BLOOD_DARK, FONT_HAND, FONT_IMPACT, GROUND_Y, HEIGHT, INK, INK_SOFT, WIDTH, hex,
} from '../game/constants';
import { CHAPTERS, buildLevel, type LevelDef, type ZombieSize } from '../game/data';
import { PLACES, type PlaceDef, type PlaceId, type SpotKind } from '../game/places';
import type { AmbientMode } from '../game/ambient';
import { drawBackground } from '../game/background';
import { Ambient } from '../game/ambient';
import { Player, type PlayerHost, type PlayerInput, type Rect, type SwingKind } from '../game/Player';
import { Zombie, type ZombieHost } from '../game/Zombie';
import { sfx } from '../game/sfx';
import { storage, type WeaponId } from '../game/storage';
import { drawWeapon, type ZombieVariant } from '../game/figure';

export interface GameSceneData {
  chapter: number;
  level?: number;
  weapon: WeaponId;
  score?: number;
  hp?: number;
  kills?: number;
  /** Place the player just left: shown sliding away during the transition. */
  fromPlace?: string;
}

type Phase = 'enter' | 'intro' | 'wave' | 'between' | 'cleared' | 'exit' | 'over';

const AMBIENT: Record<PlaceId, AmbientMode> = {
  cliffFoot: 'sky', caveDoor: 'sky', caveInside: 'none', cliffPath: 'sky', summit: 'sky',
  graveGates: 'night', crypts: 'night', chapel: 'night', openGraves: 'night', mausoleum: 'night',
  moat: 'sky', courtyard: 'torches', armory: 'none', ramparts: 'sky', throne: 'none',
};

/** Size of the dark opening a zombie steps out of. */
const SPOT_SIZE: Partial<Record<SpotKind, [number, number]>> = {
  cave: [110, 160], door: [76, 120], crypt: [76, 120], coffin: [110, 30], barrel: [60, 80],
  cabinet: [96, 186], armor: [60, 160], throne: [110, 200], mausoleum: [110, 170],
};

const overlap = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export class GameScene extends Phaser.Scene implements PlayerHost, ZombieHost {
  private chapter = 0;
  private levelIdx = 0;
  private weaponId: WeaponId = 'sword';
  private level!: LevelDef;
  private player!: Player;
  private zombies: Zombie[] = [];
  private waveIdx = 0;
  private spawnQueue: ZombieSize[] = [];
  private spawnTimer = 0;
  private phase: Phase = 'intro';
  private phaseT = 0;
  score = 0;
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private bloodR!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bloodL!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bloodUp!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private splats: Phaser.GameObjects.Image[] = [];
  private heads: Phaser.GameObjects.Image[] = [];
  private hud!: {
    hp: Phaser.GameObjects.Graphics;
    score: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    wave: Phaser.GameObjects.Text;
    banner: Phaser.GameObjects.Text;
    sub: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
    mute: Phaser.GameObjects.Text;
  };
  private debugG?: Phaser.GameObjects.Graphics;
  private hitStop = 0;
  private ambient!: Ambient;
  private startHp = 100;
  private levelStartScore = 0;
  private levelStartKills = 0;
  private slowLeft = 0;
  private tipsSeen = new Set<string>();
  private tipText?: Phaser.GameObjects.Text;
  private place!: PlaceDef;
  private fromPlace?: string;
  private hearts: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('Game');
  }

  init(data: GameSceneData) {
    this.chapter = data.chapter ?? 0;
    this.levelIdx = data.level ?? 0;
    this.weaponId = data.weapon ?? 'sword';
    this.score = data.score ?? 0;
    this.startHp = data.hp ?? 100;
    this.levelStartScore = this.score;
    this.levelStartKills = data.kills ?? 0;
    this.fromPlace = data.fromPlace;
    this.hearts = [];
    this.slowLeft = 0;
    this.zombies = [];
    this.splats = [];
    this.heads = [];
    this.waveIdx = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = data.kills ?? 0;
    this.hitStop = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.pending = 0;
  }

  create() {
    this.place = PLACES[this.chapter][this.levelIdx];
    this.level = buildLevel(this.chapter, this.levelIdx);
    this.physics.world.setBounds(ARENA_LEFT, -400, ARENA_RIGHT - ARENA_LEFT, GROUND_Y + 400);
    this.physics.world.gravity.y = 2000;
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    drawBackground(this, this.place);
    this.ambient = new Ambient(this, AMBIENT[this.place.id]);

    const params = new URLSearchParams(window.location.search);
    this.player = new Player(this, this, this.fromPlace ? ARENA_LEFT + 40 : WIDTH / 2, this.weaponId, storage.getProfile());
    // Ledges: one-way platforms you can jump onto from below.
    for (const pl of this.place.platforms) {
      const zone = this.add.zone(pl.x, pl.y + 6, pl.w, 12);
      this.physics.add.existing(zone, true);
      const b = zone.body as Phaser.Physics.Arcade.StaticBody;
      b.checkCollision.down = false;
      b.checkCollision.left = false;
      b.checkCollision.right = false;
      this.physics.add.collider(this.player.zone, zone);
    }
    this.player.hp = this.startHp;
    this.player.god = params.has('god');
    if (params.has('debug')) this.debugG = this.add.graphics().setDepth(200);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      space: 'SPACE', esc: 'ESC', m: 'M',
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    const bloodCfg = (angle: { min: number; max: number }): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      speed: { min: 120, max: 420 },
      angle,
      gravityY: 1100,
      lifespan: { min: 500, max: 1000 },
      scale: { start: 1.1, end: 0.4 },
      tint: [BLOOD, BLOOD_DARK],
      emitting: false,
    });
    this.bloodR = this.add.particles(0, 0, 'dot', bloodCfg({ min: -70, max: 15 })).setDepth(30);
    this.bloodL = this.add.particles(0, 0, 'dot', bloodCfg({ min: 165, max: 250 })).setDepth(30);
    this.bloodUp = this.add.particles(0, 0, 'dot', bloodCfg({ min: -120, max: -60 })).setDepth(30);
    this.dust = this.add.particles(0, 0, 'dot', {
      speed: { min: 40, max: 160 },
      angle: { min: -160, max: -20 },
      gravityY: 500,
      lifespan: { min: 300, max: 700 },
      scale: { start: 0.9, end: 0.2 },
      tint: INK_SOFT,
      alpha: { start: 0.8, end: 0 },
      emitting: false,
    }).setDepth(55);

    this.createHud();

    // Lose focus (switch tab / window) -> pause, so you don't die while away.
    const onBlur = () => this.openPause();
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      // Don't let keys that were held while paused leak into the game.
      kb.resetKeys();
    });

    sfx.playMusic('game');
    this.spawnHeart(this.place.heart.x, this.place.heart.y, false);
    if (this.fromPlace && this.textures.exists(`bg-${this.fromPlace}`)) this.slideIn(this.fromPlace);
    else this.startIntro();
    (window as unknown as { __scene?: GameScene }).__scene = this;
  }

  private createHud() {
    const ch = CHAPTERS[this.chapter];
    const txt = (x: number, y: number, s: string, size: number, font = FONT_IMPACT) =>
      this.add.text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color: hex(INK) }).setDepth(100).setScrollFactor(0);
    const hp = this.add.graphics().setDepth(100).setScrollFactor(0);
    const name = storage.getProfile().name;
    txt(24, 14, name, 22);
    const wIcon = this.add.graphics().setDepth(100).setScrollFactor(0);
    drawWeapon(wIcon, this.weaponId, { x: 286, y: 66 }, { x: 0.8, y: -0.6 }, 0.75);
    const level = txt(WIDTH / 2, 14, `${ch.title}  ·  LEVEL ${this.levelIdx + 1}/${ch.levels}  ·  ${this.place.name.toUpperCase()}`, 22).setOrigin(0.5, 0);
    const wave = txt(WIDTH / 2, 42, '', 20).setOrigin(0.5, 0).setColor(hex(INK_SOFT));
    const score = txt(WIDTH - 24, 12, '', 34).setOrigin(1, 0);
    const combo = txt(WIDTH - 24, 52, '', 24).setOrigin(1, 0);
    const banner = txt(WIDTH / 2, 250, '', 84).setOrigin(0.5).setAlpha(0);
    const sub = txt(WIDTH / 2, 320, '', 30, FONT_HAND).setOrigin(0.5).setAlpha(0);
    const hint = txt(WIDTH / 2, HEIGHT - 42, '', 20, FONT_HAND).setOrigin(0.5).setAlpha(0);
    const mute = txt(WIDTH - 24, HEIGHT - 34, 'SOUND OFF (M)', 18).setOrigin(1, 0).setVisible(sfx.muted);
    this.hud = { hp, score, combo, level, wave, banner, sub, hint, mute };
    if (this.chapter === 0 && this.levelIdx === 0) {
      hint.setText('← →  move    ↑ / Space  jump (again in air = flip)    ↓  duck    W  swing up    S  swing down    A / D  block    Esc  pause');
      hint.setAlpha(1);
      this.tweens.add({ targets: hint, alpha: 0, delay: 14000, duration: 1500 });
    }
  }

  private banner(text: string, sub = '', ms = 1600) {
    const { banner, sub: subT } = this.hud;
    banner.setText(text).setAlpha(0).setScale(1.4);
    subT.setText(sub).setAlpha(0);
    this.tweens.killTweensOf([banner, subT]);
    this.tweens.add({ targets: banner, alpha: 1, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: subT, alpha: 1, duration: 300, delay: 150 });
    this.tweens.add({ targets: [banner, subT], alpha: 0, duration: 400, delay: ms });
  }

  private startIntro() {
    this.phase = 'intro';
    this.phaseT = 0;
    this.banner(`LEVEL ${this.levelIdx + 1}`, this.place.name, 1500);
  }

  private startWave() {
    this.phase = 'wave';
    this.phaseT = 0;
    const wave = this.level.waves[this.waveIdx];
    this.spawnQueue = [...wave.zombies];
    // shuffle, but keep a giant (if any) last
    const giant = this.spawnQueue.filter((z) => z === 'giant');
    const rest = Phaser.Utils.Array.Shuffle(this.spawnQueue.filter((z) => z !== 'giant'));
    this.spawnQueue = [...rest, ...giant];
    this.spawnTimer = 0.4;
    sfx.wave();
    sfx.intensity = Math.min(1, (this.chapter * 5 + this.levelIdx) / 7 + this.waveIdx * 0.12);
    const last = this.waveIdx === this.level.waves.length - 1;
    this.banner(`WAVE ${this.waveIdx + 1}`, giant.length ? 'Something BIG is coming…' : last ? 'Final wave!' : '', 1100);
  }

  update(_time: number, deltaMs: number) {
    const realDt = Math.min(deltaMs, 50) / 1000;
    let dt = realDt;
    if (this.slowLeft > 0) {
      this.slowLeft -= realDt;
      const f = this.slowLeft > 0 ? 0.3 : 1;
      dt *= f;
      this.physics.world.timeScale = 1 / f;
      this.tweens.timeScale = f;
    }
    const k = this.keys;
    const JD = Phaser.Input.Keyboard.JustDown;

    if (JD(k.esc)) {
      this.openPause();
      return;
    }
    if (JD(k.m)) sfx.toggleMute();
    this.hud.mute.setVisible(sfx.muted);

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      if (this.hitStop <= 0) this.physics.resume();
      return;
    }

    const input: PlayerInput = {
      // Arrows (+ Space) move, WASD fights: W / S swing, A / D guard.
      left: k.left.isDown,
      right: k.right.isDown,
      down: k.down.isDown,
      jumpPressed: JD(k.up) || JD(k.space),
      swingHigh: JD(k.w),
      swingLow: JD(k.s),
      block: k.a.isDown || k.d.isDown,
    };
    if (this.phase === 'over' || this.phase === 'enter') {
      input.left = input.right = input.down = input.jumpPressed = input.swingHigh = input.swingLow = input.block = false;
      if (this.phase === 'enter') input.right = this.player.x < ARENA_LEFT + 200;
    }
    this.player.update(dt, input);

    // Zombies queue up instead of standing inside each other.
    const alive = this.zombies.filter((z) => z.alive && z.state !== 'rising');
    for (const z of alive) {
      z.blocked = alive.some((o) => {
        if (o === z) return false;
        const towardPlayer = Math.sign(this.player.x - z.x);
        const ahead = (o.x - z.x) * towardPlayer;
        return ahead > 0 && ahead < (z.hurtbox().right - z.hurtbox().left) * 0.5 + 14 && o.state !== 'dying';
      });
    }
    for (const z of [...this.zombies]) z.update(dt, this.player);
    this.separatePlayer();

    this.ambient.update(dt);
    this.updateWaves(dt);
    this.checkTips();
    this.updateCombo(dt);
    this.updateHeads(dt);
    this.updateHearts(dt);
    this.drawHud();
    if (this.debugG) this.drawDebug();
  }

  /** The player can't walk through zombies – jump over them instead. */
  /** Distance to the nearest hittable zombie ahead (near edge), used for the lunge. */
  nearestAhead(x: number, dir: number): number | null {
    let best: number | null = null;
    for (const z of this.zombies) {
      if (!z.hittable) continue;
      const hb = z.hurtbox();
      const edge = dir > 0 ? hb.left : hb.right;
      const d = (edge - x) * dir;
      if (d > 0 && (best === null || d < best)) best = d;
    }
    return best;
  }

  private separatePlayer() {
    const p = this.player;
    if (p.dead || p.flipping) return; // a flip passes through zombies
    const pr = p.hurtbox();
    for (const z of this.zombies) {
      if (!z.alive || z.state === 'rising') continue;
      const zr = z.hurtbox();
      if (pr.bottom < zr.top + 18) continue; // above it: jumping over
      const minDist = (pr.right - pr.left) / 2 + ((zr.right - zr.left) / 2) * 0.7;
      const dx = p.x - z.x;
      const overlapX = minDist - Math.abs(dx);
      if (overlapX <= 0) continue;
      const dir = dx === 0 ? -z.facing : Math.sign(dx);
      const before = p.zone.x;
      p.zone.x = Phaser.Math.Clamp(p.zone.x + dir * overlapX, ARENA_LEFT + (pr.right - pr.left) / 2, ARENA_RIGHT - (pr.right - pr.left) / 2);
      const moved = Math.abs(p.zone.x - before);
      if (moved < overlapX - 0.5) z.zone.x -= dir * (overlapX - moved); // pinned to a wall: shove the zombie
    }
  }

  private openPause() {
    if (this.phase === 'over' || !this.scene.isActive()) return;
    this.scene.launch('Pause');
    this.scene.pause();
  }

  private updateWaves(dt: number) {
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 2.0) this.startWave();
        break;
      case 'wave': {
        const wave = this.level.waves[this.waveIdx];
        const aliveCount = this.zombies.filter((z) => z.alive).length + this.pending;
        this.spawnTimer -= dt;
        if (this.spawnQueue.length && this.spawnTimer <= 0 && aliveCount < wave.maxAlive) {
          this.spawnZombie(this.spawnQueue.shift()!);
          this.spawnTimer = (wave.spawnGapMs / 1000) * (0.75 + Math.random() * 0.5);
        }
        if (!this.spawnQueue.length && aliveCount === 0) {
          if (this.waveIdx < this.level.waves.length - 1) {
            this.phase = 'between';
            this.phaseT = 0;
            this.player.heal(10);
          } else {
            this.levelCleared();
          }
        }
        break;
      }
      case 'between':
        if (this.phaseT > 1.6) {
          this.waveIdx++;
          this.startWave();
        }
        break;
      case 'cleared':
        if (this.phaseT > 2.6) {
          if (this.levelIdx < CHAPTERS[this.chapter].levels - 1) this.openExit();
          else this.goNext();
        }
        break;
      case 'exit':
        // Walk into the opened exit to move on.
        if (this.player.x > ARENA_RIGHT - 70 && !this.player.dead) this.goNext();
        break;
      case 'over':
        if (this.phaseT > 2.6) {
          this.phase = 'cleared'; // prevent double trigger
          this.phaseT = -999;
          this.finish(false);
        }
        break;
    }
  }

  private pending = 0;

  private spawnZombie(size: ZombieSize) {
    const e = this.place.entrance;
    if (e === 'rise') return this.spawnRise(size, this.randomXAway());
    if (e === 'parachute') {
      // the giant is too heavy for a parachute
      if (size === 'giant') return this.spawnRise(size, this.randomXAway());
      const z = new Zombie(this, this, size, this.randomXAway(), this.level.strength, this.variantFor(), 'parachute', -40);
      this.zombies.push(z);
      return;
    }
    // spot / drop: use one of the place's spots, preferably away from the player
    const spots = [...this.place.spots].sort((a, b) => Math.abs(b.x - this.player.x) - Math.abs(a.x - this.player.x));
    const far = spots.filter((sp) => Math.abs(sp.x - this.player.x) > 200);
    const spot = Phaser.Utils.Array.GetRandom(far.length ? far : spots.slice(0, 1));
    if (spot.kind === 'edge') return this.spawnRise(size, spot.x);
    if (e === 'drop') {
      // a bit of dust falls first as a warning
      for (let k = 0; k < 6; k++) this.dust.emitParticleAt(spot.x + Phaser.Math.Between(-20, 20), spot.y);
      this.pending++;
      this.time.delayedCall(500, () => {
        this.pending--;
        if (this.phase === 'over') return;
        const z = new Zombie(this, this, size, spot.x + Phaser.Math.Between(-20, 20), this.level.strength, this.variantFor(), 'drop', spot.y);
        this.zombies.push(z);
      });
      return;
    }
    // A door / coffin / barrel / cabinet opens, the zombie steps out of the dark.
    const open = this.add.graphics().setDepth(9).setPosition(spot.x, GROUND_Y);
    const [w, h] = SPOT_SIZE[spot.kind] ?? [80, 150];
    open.fillStyle(0x1a1a1a, 1);
    if (spot.kind === 'coffin') open.fillEllipse(0, -6, w, 30);
    else open.fillRoundedRect(-w / 2, -h, w, h, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
    open.setScale(0.1, 1);
    this.tweens.add({ targets: open, scaleX: 1, duration: 300, ease: 'Cubic.Out' });
    this.dust.explode(8, spot.x, GROUND_Y - 10);
    sfx.door();
    this.pending++;
    this.time.delayedCall(380, () => {
      this.pending--;
      this.tweens.add({ targets: open, scaleX: 0.05, alpha: 0, delay: 900, duration: 300, onComplete: () => open.destroy() });
      if (this.phase === 'over') return;
      const z = new Zombie(this, this, size, spot.x, this.level.strength, this.variantFor(), 'emerge');
      z.facing = this.player.x >= spot.x ? 1 : -1;
      this.zombies.push(z);
      if (size === 'giant') this.cameras.main.shake(400, 0.008);
    });
  }

  private randomXAway() {
    let x = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = Phaser.Math.Between(ARENA_LEFT + 60, ARENA_RIGHT - 60);
      if (Math.abs(x - this.player.x) > 260) break;
    }
    return x;
  }

  private spawnRise(size: ZombieSize, x: number) {
    // The ground cracks first, so the player sees where a zombie will come out.
    const crack = this.add.graphics().setDepth(57).setPosition(x, 0);
    const w = size === 'giant' ? 70 : size === 'big' ? 50 : 34;
    crack.lineStyle(3, INK, 1);
    crack.beginPath();
    crack.moveTo(-w, GROUND_Y + 2);
    for (let i = 1; i <= 6; i++) crack.lineTo(-w + (2 * w * i) / 6, GROUND_Y + 2 + (i % 2 ? 7 : -1));
    crack.strokePath();
    crack.lineBetween(-6, GROUND_Y + 4, -12, GROUND_Y + 16);
    crack.lineBetween(8, GROUND_Y + 4, 14, GROUND_Y + 18);
    crack.setScale(0.2, 1);
    this.tweens.add({ targets: crack, scaleX: 1, duration: 450, ease: 'Cubic.Out' });
    this.dust.explode(6, x, GROUND_Y);
    this.pending++;
    this.time.delayedCall(650, () => {
      this.pending--;
      this.tweens.add({ targets: crack, alpha: 0, delay: 1200, duration: 800, onComplete: () => crack.destroy() });
      if (this.phase === 'over') return;
      const z = new Zombie(this, this, size, x, this.level.strength, this.variantFor());
      z.facing = this.player.x >= x ? 1 : -1;
      this.zombies.push(z);
      this.dust.explode(18, x, GROUND_Y);
      this.cameras.main.shake(size === 'giant' ? 400 : 120, size === 'giant' ? 0.008 : 0.002);
    });
  }

  // ---- hearts (health pick-ups) ------------------------------------------

  private spawnHeart(x: number, y: number, dropped: boolean) {
    const h = this.add.image(x, y, 'heart').setDepth(18);
    h.setData('born', this.time.now).setData('dropped', dropped).setData('baseY', y);
    if (dropped) {
      this.physics.add.existing(h);
      const b = h.body as Phaser.Physics.Arcade.Body;
      b.setCollideWorldBounds(true);
      b.setBounce(0.4, 0.35);
      b.setVelocity(Phaser.Math.Between(-80, 80), -360);
      b.setDrag(80, 0);
    }
    this.hearts.push(h);
  }

  private updateHearts(_dt: number) {
    const p = this.player;
    for (const h of this.hearts) {
      if (!h.active) continue;
      const age = (this.time.now - (h.getData('born') as number)) / 1000;
      if (!h.getData('dropped')) h.y = (h.getData('baseY') as number) + Math.sin(age * 3) * 5;
      h.setScale(1 + Math.sin(age * 6) * 0.06);
      if (h.getData('dropped') && age > 7) h.setAlpha(Math.floor(age * 8) % 2 ? 0.3 : 1);
      if (h.getData('dropped') && age > 10) { h.destroy(); continue; }
      const hb = p.hurtbox();
      if (!p.dead && h.x > hb.left - 24 && h.x < hb.right + 24 && h.y > hb.top - 24 && h.y < hb.bottom + 10) {
        const amount = 25;
        p.heal(amount);
        sfx.heal();
        this.popText(h.x, h.y - 20, `+${amount} ♥`);
        h.destroy();
      }
    }
    this.hearts = this.hearts.filter((h) => h.active);
  }

  // ---- moving on to the next place -----------------------------------------

  private openExit() {
    this.phase = 'exit';
    this.phaseT = 0;
    const x = ARENA_RIGHT - 20;
    const g = this.add.graphics();
    g.fillStyle(0x1a1a1a, 1);
    g.fillRoundedRect(-55, -175, 110, 175, { tl: 55, tr: 55, bl: 0, br: 0 });
    g.lineStyle(5, INK, 1);
    g.strokeRoundedRect(-55, -175, 110, 175, { tl: 55, tr: 55, bl: 0, br: 0 });
    g.setScale(0.1, 1);
    const arrow = this.add.text(-150, -120, 'GO  →', { fontFamily: FONT_IMPACT, fontSize: '54px', color: hex(INK) }).setOrigin(0.5);
    this.add.container(x, GROUND_Y, [g, arrow]).setDepth(12);
    this.tweens.add({ targets: g, scaleX: 1, duration: 500, ease: 'Cubic.Out' });
    this.tweens.add({ targets: arrow, x: -120, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    sfx.door();
    this.dust.explode(10, x, GROUND_Y - 10);
  }

  /** Camera slides from the previous place (left) to this one (right) while the player walks in. */
  private slideIn(from: string) {
    this.phase = 'enter';
    this.phaseT = 0;
    this.add.image(-WIDTH, 0, `bg-${from}`).setOrigin(0).setDepth(0);
    this.add.image(-WIDTH, 0, 'ground').setOrigin(0).setDepth(50);
    const cam = this.cameras.main;
    cam.setScroll(-WIDTH, 0);
    this.tweens.add({ targets: cam, scrollX: 0, duration: 1100, ease: 'Sine.InOut', onComplete: () => this.startIntro() });
  }

  private variantFor(): ZombieVariant {
    const r = Math.random();
    if (this.chapter === 0) return r < 0.25 ? 'bandage' : 'plain';
    if (this.chapter === 1) return r < 0.35 ? 'tophat' : r < 0.55 ? 'bandage' : 'plain';
    return r < 0.6 ? 'helmet' : r < 0.75 ? 'bandage' : 'plain';
  }

  /** Short beginner tips in chapter one, each shown once per browser. */
  private tip(id: string, text: string) {
    if (this.chapter !== 0 || this.tipsSeen.has(id)) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(window.localStorage.getItem('kristole.tips') ?? '[]');
    } catch {
      /* ignore */
    }
    this.tipsSeen.add(id);
    if (seen.includes(id)) return;
    seen.push(id);
    try {
      window.localStorage.setItem('kristole.tips', JSON.stringify(seen));
    } catch {
      /* ignore */
    }
    this.tipText?.destroy();
    const t = this.add
      .text(WIDTH / 2, 110, text, {
        fontFamily: FONT_HAND, fontSize: '28px', color: hex(INK), backgroundColor: '#ffffff',
        padding: { x: 16, y: 8 }, align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setScrollFactor(0);
    this.tipText = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 3800, duration: 600, onComplete: () => t.destroy() });
  }

  private levelCleared() {
    this.phase = 'cleared';
    this.phaseT = 0;
    const ch = CHAPTERS[this.chapter];
    const lastLevel = this.levelIdx === ch.levels - 1;
    const bonus = 500 * (this.levelIdx + 1) * (this.chapter + 1);
    this.score += bonus;
    sfx.levelComplete();
    this.banner(lastLevel ? 'CHAPTER COMPLETE!' : 'LEVEL COMPLETE', `+${bonus} bonus`, 2400);
  }

  private goNext() {
    const ch = CHAPTERS[this.chapter];
    if (this.levelIdx < ch.levels - 1) {
      this.scene.restart({
        chapter: this.chapter,
        level: this.levelIdx + 1,
        weapon: this.weaponId,
        score: this.score,
        hp: Math.min(100, this.player.hp + 35),
        kills: this.kills,
        fromPlace: this.place.id,
      } satisfies GameSceneData);
    } else {
      storage.unlockChapter(this.chapter + 1);
      this.finish(true);
    }
  }

  private finish(win: boolean) {
    this.scene.start('Result', {
      win,
      score: this.score,
      chapter: this.chapter,
      level: this.levelIdx,
      weapon: this.weaponId,
      kills: this.kills,
    });
  }

  // ---- combat callbacks -------------------------------------------------

  playerSwing(player: Player, kind: SwingKind, box: Rect, hitOnce: Set<unknown>) {
    const w = player.weapon;
    for (const z of this.zombies) {
      if (!z.hittable || hitOnce.has(z)) continue;
      if (!overlap(box, z.hurtbox())) continue;
      hitOnce.add(z);
      const dmg = Math.round(w.damage * (kind === 'high' ? 1.3 : 1));
      const killed = z.takeHit(dmg, kind, player.facing, w.knockback * (kind === 'high' ? 1.25 : 1));
      const hb = z.hurtbox();
      const hy = kind === 'high' ? hb.top + (hb.bottom - hb.top) * 0.25 : hb.top + (hb.bottom - hb.top) * 0.6;
      const hx = player.facing > 0 ? hb.left + 4 : hb.right - 4;
      const big = z.size === 'big' || z.size === 'giant';
      this.spill(hx, Math.max(hy, box.top), player.facing, killed ? 34 : 14);
      this.impact(hx, Math.max(hy, box.top), killed || w.id === 'axe' ? 1.3 : 1);
      if (killed && (big || Math.random() < 0.25)) this.lensBlood(big ? 4 : 1);
      sfx.hit(w.id === 'axe');
      this.cameras.main.shake(killed ? 140 : 70, killed ? 0.006 : 0.003);
      this.freeze(killed ? 0.07 : 0.035);
      if (killed) this.onKill(z, kind, big);
    }
  }

  private onKill(z: Zombie, kind: SwingKind, big: boolean) {
    this.kills++;
    const lastOne = this.phase === 'wave' && this.waveIdx === this.level.waves.length - 1 && !this.spawnQueue.length && this.pending === 0 && this.zombies.filter((o) => o.alive).length === 0;
    if (lastOne || z.size === 'giant') this.slowLeft = 0.9;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = 2.5;
    const mult = Math.min(this.combo, 5);
    const pts = z.def.points * mult;
    this.score += pts;
    sfx.zombieDie(big);
    const pts0 = z.lastPoints;
    const px = pts0 ? pts0.head.x : z.x;
    const py = pts0 ? pts0.head.y - 30 : z.footY - z.height;
    this.popText(px, py, mult > 1 ? `+${pts}  x${mult}` : `+${pts}`);
    const dropChance = { small: 0.08, medium: 0.12, big: 0.35, giant: 1 }[z.size];
    if (Math.random() < dropChance) this.spawnHeart(z.x, z.footY - z.height * 0.6, true);
    // A high swing knocks the head clean off (except the giant's – too thick).
    if (kind === 'high' && z.size !== 'giant' && pts0) {
      z.knockOffHead();
      this.flyHead(pts0.head.x, pts0.head.y, z.scale, this.player.facing);
      this.bloodUp.explode(30, pts0.shoulder.x, pts0.shoulder.y - 4);
    }
    for (let i = 0; i < (big ? 5 : 3); i++) this.splat(z.x + Phaser.Math.Between(-40, 40) + this.player.facing * 30, big ? 1.4 : 1);
  }

  zombieStrike(z: Zombie, band: Rect) {
    if (this.player.dead || this.phase === 'cleared') return;
    if (!overlap(band, this.player.hurtbox())) return;
    const res = this.player.damage(z.damage, z.facing);
    if (res === 'blocked') {
      const hb = this.player.hurtbox();
      this.impact(this.player.x + this.player.facing * 22 * FIG, hb.top + 30 * FIG, 1.1);
      this.dustAt(this.player.x + this.player.facing * 22 * FIG, hb.top + 35 * FIG, 5);
      this.cameras.main.shake(80, 0.003);
    } else if (res === 'hit') {
      const hb = this.player.hurtbox();
      this.spill(this.player.x, hb.top + 30, z.facing, 18);
      this.cameras.main.shake(160, 0.007);
      this.cameras.main.flash(90, 196, 0, 12, false);
      this.lensBlood(2);
      this.combo = 0;
      this.comboTimer = 0;
    }
  }

  zombieGone(z: Zombie) {
    z.destroy();
    this.zombies = this.zombies.filter((o) => o !== z);
  }

  playerDied() {
    this.phase = 'over';
    this.phaseT = 0;
    sfx.playMusic(null);
    sfx.gameOver();
    this.slowLeft = 1.2;
    this.spill(this.player.x, this.player.footY - 60, 0, 50);
    this.banner('YOU DIED', `Score ${this.score}`, 2200);
  }

  dustAt(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.dust.emitParticleAt(x + Phaser.Math.Between(-12, 12), y + Phaser.Math.Between(-6, 0));
  }

  // ---- juice ------------------------------------------------------------

  /** Comic-style ink impact lines. */
  private impact(x: number, y: number, s: number) {
    const g = this.add.graphics().setDepth(40).setPosition(x, y);
    const n = 9;
    const rot = Math.random() * Math.PI;
    g.lineStyle(4, INK, 1);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const r0 = 14 + (i % 2) * 6, r1 = r0 + 16 + (i % 3) * 8;
      g.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.setScale(0.5 * s);
    this.tweens.add({ targets: g, scale: 1.25 * s, alpha: 0, duration: 180, ease: 'Cubic.Out', onComplete: () => g.destroy() });
  }

  /** Blood splashed on the 'camera lens' – drips down and fades. */
  private lensBlood(n: number) {
    for (let i = 0; i < n; i++) {
      const edge = Math.random();
      const x = edge < 0.5 ? Phaser.Math.Between(20, 260) * (Math.random() < 0.5 ? 1 : -1) : Phaser.Math.Between(80, WIDTH - 80);
      const px = x < 0 ? WIDTH + x : x;
      const py = edge < 0.5 ? Phaser.Math.Between(100, HEIGHT - 200) : Phaser.Math.Between(90, 260);
      const d = this.add
        .image(px, py, 'drop')
        .setDepth(120)
        .setTint(Math.random() < 0.6 ? BLOOD : BLOOD_DARK)
        .setScale(Phaser.Math.FloatBetween(0.7, 1.6))
        .setAngle(Phaser.Math.Between(-15, 15))
        .setAlpha(0.9)
        .setScrollFactor(0);
      this.tweens.add({ targets: d, y: py + Phaser.Math.Between(30, 90), scaleY: d.scaleY * 1.25, duration: 2600, ease: 'Sine.In' });
      this.tweens.add({ targets: d, alpha: 0, delay: 1400, duration: 1400, onComplete: () => d.destroy() });
    }
  }

  private freeze(sec: number) {
    if (this.hitStop > 0) return;
    this.hitStop = sec;
    this.physics.pause();
  }

  private spill(x: number, y: number, dirX: number, n: number) {
    if (dirX > 0) this.bloodR.explode(n, x, y);
    else if (dirX < 0) this.bloodL.explode(n, x, y);
    else {
      this.bloodR.explode(n / 2, x, y);
      this.bloodL.explode(n / 2, x, y);
    }
    if (Math.random() < 0.7) this.splat(x + dirX * Phaser.Math.Between(20, 90), 0.8);
  }

  private splat(x: number, s: number) {
    const img = this.add
      .image(Phaser.Math.Clamp(x, ARENA_LEFT, ARENA_RIGHT), GROUND_Y + Phaser.Math.Between(1, 6), 'splat')
      .setDepth(56)
      .setTint(Math.random() < 0.5 ? BLOOD : BLOOD_DARK)
      .setScale(s * Phaser.Math.FloatBetween(0.5, 1.3), s * Phaser.Math.FloatBetween(0.6, 1))
      .setAlpha(0.95);
    this.splats.push(img);
    if (this.splats.length > 70) this.splats.shift()!.destroy();
    this.tweens.add({ targets: img, alpha: 0, delay: 20000, duration: 3000, onComplete: () => img.destroy() });
  }

  private flyHead(x: number, y: number, scale: number, dirX: number) {
    const head = this.add.image(x, y, 'zhead').setScale(scale).setDepth(25);
    this.physics.add.existing(head);
    const b = head.body as Phaser.Physics.Arcade.Body;
    b.setCircle(11);
    b.setCollideWorldBounds(true);
    b.setBounce(0.45, 0.4);
    b.setVelocity(dirX * Phaser.Math.Between(200, 380), -Phaser.Math.Between(420, 620));
    b.setAngularVelocity(dirX * Phaser.Math.Between(400, 800));
    b.setDrag(60, 0);
    head.setData('born', this.time.now);
    this.heads.push(head);
  }

  private updateHeads(_dt: number) {
    for (const h of this.heads) {
      const b = h.body as Phaser.Physics.Arcade.Body | null;
      if (!b) continue;
      if (b.blocked.down) {
        b.setAngularVelocity(b.angularVelocity * 0.9);
        b.setVelocityX(b.velocity.x * 0.96);
      }
      if (this.time.now - (h.getData('born') as number) > 300 && Math.random() < 0.25 && Math.abs(b.velocity.y) > 50) {
        this.bloodUp.emitParticleAt(h.x, h.y);
      }
      if (this.time.now - (h.getData('born') as number) > 6000 && !h.getData('fading')) {
        h.setData('fading', true);
        this.tweens.add({ targets: h, alpha: 0, duration: 800, onComplete: () => h.destroy() });
      }
    }
    this.heads = this.heads.filter((h) => h.active);
  }

  private popText(x: number, y: number, s: string) {
    const t = this.add
      .text(x, y, s, { fontFamily: FONT_IMPACT, fontSize: '26px', color: hex(INK), stroke: '#ffffff', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(90);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => t.destroy() });
  }

  private checkTips() {
    if (this.chapter !== 0) return;
    for (const z of this.zombies) {
      if (z.state !== 'windup') continue;
      if (z.size === 'small') this.tip('jump', 'Small zombies bite your legs — JUMP (↑)!\nOnly a DOWN swing (S) reaches them.');
      else this.tip('duck', 'This one swings high — DUCK (hold ↓) or BLOCK (hold A / D)!\nThe shield bar wears down and refills.');
    }
    if (this.zombies.some((z) => z.size === 'big' && z.state === 'walk')) this.tip('flip', 'Too big to jump over? Jump, then press ↑ again while holding ← or →\nto FLIP right through it!');
    if (this.zombies.some((z) => z.size === 'giant' && z.state === 'walk')) this.tip('giant', 'A GIANT! Duck its swing and keep hitting.\nSwing UP (W) does more damage.');
    if (this.levelIdx === 0 && this.phase === 'between' && this.waveIdx === 0) this.tip('wall', 'Tip: jump into a wall, then press ↑ again to bounce off it!');
  }

  private updateCombo(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  private drawHud() {
    const { hp, score, combo, wave } = this.hud;
    hp.clear();
    const x = 24, y = 46, w = 240, h = 18;
    const frac = this.player.hp / this.player.maxHp;
    hp.fillStyle(0xffffff, 1);
    hp.fillRect(x, y, w, h);
    // pulse when low on health
    const low = frac < 0.3 && !this.player.dead;
    hp.fillStyle(low && Math.floor(this.time.now / 250) % 2 ? BLOOD : INK, 1);
    hp.fillRect(x, y, w * frac, h);
    // hatch the empty part so it reads clearly in B&W
    hp.lineStyle(1, INK, 0.35);
    for (let i = x + w * frac; i < x + w; i += 6) hp.lineBetween(i, y + h, Math.min(i + 6, x + w), y);
    hp.lineStyle(3, INK, 1);
    hp.strokeRect(x, y, w, h);
    // Shield bar under the health bar: grey, hatched when empty, flashes red when broken.
    const sy = y + h + 6, sh = 10;
    const sf = this.player.shield / this.player.maxShield;
    const broke = !this.player.dead && this.player.shieldBrokenRecently;
    hp.fillStyle(0xffffff, 1);
    hp.fillRect(x, sy, w, sh);
    hp.fillStyle(this.player.blocking ? INK : 0x777777, 1);
    hp.fillRect(x, sy, w * sf, sh);
    hp.lineStyle(1, INK, 0.3);
    for (let i = x + w * sf; i < x + w; i += 5) hp.lineBetween(i, sy + sh, Math.min(i + 5, x + w), sy);
    hp.lineStyle(2, broke && Math.floor(this.time.now / 120) % 2 ? BLOOD : INK, 1);
    hp.strokeRect(x, sy, w, sh);
    score.setText(String(this.score).padStart(6, '0'));
    combo.setText(this.combo > 1 && this.comboTimer > 0 ? `COMBO x${Math.min(this.combo, 5)}` : '');
    const total = this.level.waves.length;
    if (this.phase === 'wave' || this.phase === 'between') {
      const left = this.spawnQueue.length + this.pending + this.zombies.filter((z) => z.alive).length;
      wave.setText(`WAVE ${this.waveIdx + 1}/${total}   ·   ZOMBIES LEFT: ${left}`);
    } else wave.setText('');
  }

  private drawDebug() {
    const g = this.debugG!;
    g.clear();
    g.lineStyle(1, 0x0000ff, 1);
    const r = this.player.hurtbox();
    g.strokeRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    for (const kind of ['high', 'low'] as SwingKind[]) {
      const b = this.player.swingBox(kind, this.player.crouching);
      g.lineStyle(1, kind === 'high' ? 0x00aa00 : 0xaa8800, 0.8);
      g.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    }
    g.lineStyle(1, 0xff00ff, 1);
    for (const z of this.zombies) {
      const zb = z.hurtbox();
      g.strokeRect(zb.left, zb.top, zb.right - zb.left, zb.bottom - zb.top);
    }
  }

  /** Data to restart the current level (used by the pause menu). */
  restartData(): GameSceneData {
    return { chapter: this.chapter, level: this.levelIdx, weapon: this.weaponId, score: this.levelStartScore, hp: this.startHp, kills: this.levelStartKills };
  }

  /** Test hook: state snapshot. */
  snapshot() {
    return {
      phase: this.phase,
      place: this.place.id,
      wave: this.waveIdx,
      level: this.levelIdx,
      chapter: this.chapter,
      hp: this.player.hp,
      score: this.score,
      zombies: this.zombies.map((z) => ({ size: z.size, state: z.state, x: Math.round(z.x), hp: z.hp })),
      kills: this.kills,
      queue: this.spawnQueue.length,
      player: { x: Math.round(this.player.x), y: Math.round(this.player.footY), crouch: this.player.crouching, facing: this.player.facing > 0 },
    };
  }
}
