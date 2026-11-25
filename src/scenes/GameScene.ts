import Phaser from 'phaser';
import {
  ACC, ACCENTS, ARENA_LEFT, ARENA_RIGHT, FIG, FONT_HAND, FONT_IMPACT, GROUND_Y, HEIGHT, INK, INK_SOFT, WIDTH, hex, rgbOf, setAccent,
} from '../game/constants';
import { CHAPTERS, buildLevel, type LevelDef, type ZombieSize } from '../game/data';
import { CAMP_PERK_SPOTS, chapterOfPlace, placeOf, type PlaceDef, type PlaceId, type SpotKind } from '../game/places';
import { PERKS, PERK_INDEX, PERK_MAX_STACK, freeChoice, randomPerk, type PerkId } from '../game/perks';
import { Angel, DawnFx, PerkBar, Spear, activationFx, perkTexture } from '../game/perkFx';
import { SECRETS, Secret, autoSecrets } from '../game/secrets';
import { keyLog } from '../keyDebug';
import type { AmbientMode } from '../game/ambient';
import { drawBackground, groundKey } from '../game/background';
import { Ambient } from '../game/ambient';
import { NO_PERKS, Player, type PlayerHost, type PlayerInput, type Rect, type SwingKind } from '../game/Player';
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
  /** Perks in the 10 slots (a game session keeps them from chapter to chapter until you die). */
  perks?: number[];
  /** Seconds left of perks that were working when the player walked into the next place. */
  perksLeft?: number[];
}

/** 'choose': level 0 of a chapter, pick one free perk. */
type Phase = 'enter' | 'intro' | 'choose' | 'wave' | 'between' | 'cleared' | 'exit' | 'over';

interface PerkPickup {
  img: Phaser.GameObjects.Image;
  id: PerkId;
  dropped: boolean;
  /** One of the three free perks of level 0. */
  choice: boolean;
  baseY: number;
  born: number;
}

const AMBIENT: Record<PlaceId, AmbientMode | undefined> = {
  cliffFoot: 'sky', caveDoor: 'sky', caveInside: 'none', cliffPath: 'sky', summit: 'sky',
  graveGates: 'night', crypts: 'night', chapel: 'night', openGraves: 'night', mausoleum: 'night',
  moat: 'sky', courtyard: 'torches', armory: 'none', ramparts: 'sky', throne: 'none',
  trailhead: 'sky', graveLane: 'night', castleRoad: 'sky',
  // v5: indoor places are quiet, outdoor ones get clouds and birds
  court: 'none', shuttleHall: 'none', hangar: 'none', barn: 'none', hold: 'none', cabin: 'none',
  mallDoors: 'none', escalators: 'none', shops: 'none', checkout: 'none', parking: 'none', mallCamp: 'none',
  counter: 'none', kitchen: 'none', playground: 'none', terminal: 'none', checkin: 'none', baggage: 'none', gates: 'none', airportCamp: 'none',
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
  // ---- perks
  private perkCounts: number[] = [];
  private perksAtStart: number[] = [];
  private perksLeftAtStart: number[] = [];
  /** Seconds left for each active perk (0 = off). */
  private perkLeft: number[] = [];
  private perkBar!: PerkBar;
  private pickups: PerkPickup[] = [];
  private secrets: Secret[] = [];
  private spears: Spear[] = [];
  private angel?: Angel;
  private dawn?: DawnFx;
  private ash!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Perk slots pressed since the last frame (by physical key, so any layout and the numpad work). */
  private perkPresses: number[] = [];
  // ---- v5: badminton shuttlecocks and the helicopter of the army base
  private shuttles: { g: Phaser.GameObjects.Graphics; x: number; y: number; vx: number; vy: number; dmg: number; dir: number }[] = [];
  private heli?: { g: Phaser.GameObjects.Graphics; x: number; dir: number; t: number };
  private heliQueue: ZombieSize[] = [];
  private heliDropT = 0;

  constructor() {
    super('Game');
  }

  init(data: GameSceneData) {
    this.chapter = data.chapter ?? 0;
    this.levelIdx = data.level ?? -1; // -1 = level 0 of the chapter (pick a perk)
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
    this.perkCounts = data.perks ? [...data.perks] : PERKS.map(() => 0);
    this.perksAtStart = [...this.perkCounts];
    this.perkLeft = data.perksLeft ? [...data.perksLeft] : PERKS.map(() => 0);
    this.perksLeftAtStart = [...this.perkLeft];
    this.pickups = [];
    this.secrets = [];
    this.spears = [];
    this.angel = undefined;
    this.dawn = undefined;
    this.shuttles = [];
    this.heli = undefined;
    this.heliQueue = [];
    this.heliDropT = 0;
  }

  private get isCamp() {
    return this.levelIdx < 0;
  }

  create() {
    setAccent(this.chapter);
    this.place = placeOf(this.chapter, this.levelIdx);
    this.level = this.isCamp ? { waves: [], strength: 1 } : buildLevel(this.chapter, this.levelIdx);
    this.physics.world.setBounds(ARENA_LEFT, -400, ARENA_RIGHT - ARENA_LEFT, GROUND_Y + 400);
    this.physics.world.gravity.y = 2000;
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    drawBackground(this, this.place);
    this.ambient = new Ambient(this, AMBIENT[this.place.id] ?? 'sky');

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
      // the ghost flies through ledges
      this.physics.add.collider(this.player.zone, zone, undefined, () => !this.player.fx.ghost);
    }
    this.player.hp = this.startHp;
    this.player.god = params.has('god');
    if (params.has('hitboxes')) this.debugG = this.add.graphics().setDepth(200);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      w: 'W', a: 'A', s: 'S', d: 'D',
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT',
      space: 'SPACE', esc: 'ESC', m: 'M',
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.perkPresses = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Digit1 / Numpad1 … ; fall back to the typed character
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '') ?? /^(\d)$/.exec(e.key ?? '');
      if (!m) return;
      const slot = PERKS.findIndex((p) => p.key === m[1]);
      keyLog(`  game: perk key ${m[1]} -> slot ${slot + 1}`);
      if (slot >= 0) this.perkPresses.push(slot);
    };
    kb.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', onKey));
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');

    const bloodCfg = (angle: { min: number; max: number }): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      speed: { min: 120, max: 420 },
      angle,
      gravityY: 1100,
      lifespan: { min: 500, max: 1000 },
      scale: { start: 1.1, end: 0.4 },
      tint: [ACC.main, ACC.dark],
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
    // Dawn: zombies crumble into ash that the wind carries away
    this.ash = this.add.particles(0, 0, 'dot', {
      speed: { min: 30, max: 140 },
      angle: { min: -110, max: -20 },
      gravityY: -60,
      lifespan: { min: 700, max: 1600 },
      scale: { start: 1.2, end: 0.3 },
      tint: [INK_SOFT, ACC.main, 0x888888],
      alpha: { start: 0.9, end: 0 },
      emitting: false,
    }).setDepth(56);

    this.createHud();
    for (const d of SECRETS[this.place.id] ?? (this.isCamp || this.chapter < 3 ? [] : autoSecrets(this.place, this.chapter))) {
      this.secrets.push(new Secret(this, d, (x, y) => {
        this.dustAt(x, y, 8);
        this.spawnPerk(randomPerk(), x, y, true);
      }));
    }

    // Lose focus (switch tab / window) -> pause, so you don't die while away.
    const onBlur = () => this.openPause();
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));

    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      // Don't let keys that were held while paused leak into the game.
      kb.resetKeys();
      this.perkPresses = [];
    });

    sfx.playMusic('game');
    if (this.place.heart) this.spawnHeart(this.place.heart.x, this.place.heart.y, false);
    if (this.place.entrance === 'heli') this.heli = { g: this.add.graphics().setDepth(12), x: -200, dir: 1, t: 0 };
    if (this.isCamp) {
      // level 0: three free perks, take one
      freeChoice().forEach((id, i) => this.spawnPerk(id, CAMP_PERK_SPOTS[i].x, CAMP_PERK_SPOTS[i].y, false, true));
    }
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
    const levelName = this.isCamp ? `${ch.title}  ·  ${this.place.name.toUpperCase()}` : `${ch.title}  ·  LEVEL ${this.levelIdx + 1}/${ch.levels}  ·  ${this.place.name.toUpperCase()}`;
    const level = txt(WIDTH / 2, 14, levelName, 22).setOrigin(0.5, 0);
    this.perkBar = new PerkBar(this);
    const wave = txt(WIDTH / 2, 42, '', 20).setOrigin(0.5, 0).setColor(hex(INK_SOFT));
    const score = txt(WIDTH - 24, 12, '', 34).setOrigin(1, 0);
    const combo = txt(WIDTH - 24, 52, '', 24).setOrigin(1, 0);
    const banner = txt(WIDTH / 2, 250, '', 84).setOrigin(0.5).setAlpha(0);
    const sub = txt(WIDTH / 2, 320, '', 30, FONT_HAND).setOrigin(0.5).setAlpha(0);
    const hint = txt(WIDTH / 2, HEIGHT - 42, '', 20, FONT_HAND).setOrigin(0.5).setAlpha(0);
    const mute = txt(WIDTH - 24, HEIGHT - 34, 'SOUND OFF (M)', 18).setOrigin(1, 0).setVisible(sfx.muted);
    this.hud = { hp, score, combo, level, wave, banner, sub, hint, mute };
    if (this.chapter === 0 && this.levelIdx <= 0) {
      hint.setText('← →  move    ↑ / Space  jump (again in air = flip)    ↓  duck    W  swing up    S  swing down    A / D  block    1…0  perks    Esc  pause');
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
    if (this.isCamp) {
      const ch = CHAPTERS[this.chapter];
      this.phase = 'choose';
      this.banner(ch.title, `${ch.name}  ·  pick ONE perk`, 2200);
      return;
    }
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

    for (const i of this.perkPresses.splice(0)) this.activatePerk(i);
    this.updatePerks(realDt);

    const input: PlayerInput = {
      // Arrows (+ Space) move, WASD fights: W / S swing, A / D guard.
      left: k.left.isDown,
      right: k.right.isDown,
      down: k.down.isDown,
      jumpPressed: JD(k.up) || JD(k.space),
      swingHigh: JD(k.w),
      swingLow: JD(k.s),
      block: k.a.isDown || k.d.isDown,
      up: k.up.isDown || k.space.isDown,
    };
    if (this.phase === 'over' || this.phase === 'enter') {
      input.left = input.right = input.down = input.jumpPressed = input.swingHigh = input.swingLow = input.block = false;
      if (this.phase === 'enter') input.right = this.player.x < ARENA_LEFT + 200;
    }
    this.player.update(dt, input);

    // Zombies queue up instead of standing inside each other.
    const alive = this.zombies.filter((z) => z.alive && z.state !== 'rising' && z.state !== 'falling');
    for (const z of alive) {
      z.blocked = alive.some((o) => {
        if (o === z) return false;
        const towardPlayer = Math.sign(this.player.x - z.x);
        const ahead = (o.x - z.x) * towardPlayer;
        return ahead > 0 && ahead < (z.hurtbox().right - z.hurtbox().left) * 0.5 + 14 && o.state !== 'dying';
      });
    }
    const invis = this.player.fx.invis;
    for (const z of [...this.zombies]) {
      z.ignorePlayer = invis;
      z.update(dt, this.player);
    }
    this.separatePlayer();
    this.updateSpears(dt);
    this.updateAngel(dt);
    for (const sc of this.secrets) {
      sc.update(dt);
      if (!this.player.dead) sc.playerNear(this.player.x, this.player.footY);
    }
    this.updatePickups();
    this.updateShuttles(dt);
    this.updateHeli(dt);

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
    if (p.dead || p.flipping || p.fx.ghost) return; // a flip (and the ghost) passes through zombies
    const pr = p.hurtbox();
    for (const z of this.zombies) {
      if (!z.alive || z.state === 'rising' || z.state === 'falling') continue;
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
          // v4: chapters run back to back – only the very last level ends the game
          const lastOfGame = this.levelIdx === CHAPTERS[this.chapter].levels - 1 && this.chapter === CHAPTERS.length - 1;
          if (!lastOfGame) this.openExit();
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
    if (e === 'heli') {
      // they drop out of the helicopter when it flies over
      this.heliQueue.push(size);
      this.pending++;
      return;
    }
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
    const h = this.add.image(x, y, 'heart').setDepth(18).setTint(ACC.main);
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
        p.heal(amount, true);
        sfx.heal();
        this.popText(h.x, h.y - 20, `+${amount} ♥`);
        h.destroy();
      }
    }
    this.hearts = this.hearts.filter((h) => h.active);
  }

  // ---- perks ----------------------------------------------------------------

  private activatePerk(i: number) {
    keyLog(`  game: slot ${PERKS[i].key} (${PERKS[i].name}) count=${this.perkCounts[i]} active=${this.perkLeft[i] > 0} phase=${this.phase}`);
    if (this.player.dead || this.phase === 'over' || this.perkCounts[i] <= 0 || this.perkLeft[i] > 0) {
      if (this.perkCounts[i] <= 0 && this.perkLeft[i] <= 0 && !this.player.dead) {
        // empty slot: say which keys do have a perk
        sfx.denied();
        this.perkBar.deny(i);
        const have = PERKS.filter((_p, j) => this.perkCounts[j] > 0).map((p) => `${p.key} – ${p.name}`);
        this.popText(this.player.x, this.player.hurtbox().top - 30, have.length ? `Slot ${PERKS[i].key} is empty. Press ${have.join(', ')}` : 'No perks yet');
      }
      return;
    }
    const def = PERKS[i];
    this.perkCounts[i]--;
    this.perkLeft[i] = def.durationMs / 1000;
    sfx.perkOn(i / 9);
    activationFx(this, def.id, this.player);
    this.tip('perkOn', `${def.name}: ${def.blurb.toLowerCase()} for ${Math.round(def.durationMs / 1000)} seconds!`);
  }

  /** Ticks active perks (real time, so slow motion doesn't stretch them) and applies their effects. */
  private updatePerks(dt: number) {
    const on = (id: PerkId) => this.perkLeft[PERK_INDEX[id]] > 0;
    for (let i = 0; i < this.perkLeft.length; i++) if (this.perkLeft[i] > 0) this.perkLeft[i] = Math.max(0, this.perkLeft[i] - dt);
    const fx = this.player.fx;
    const wasGhost = fx.ghost;
    Object.assign(fx, NO_PERKS, {
      sword: on('sword'), long: on('long'), spear: on('spear'), berserk: on('berserk'),
      invinc: on('invinc'), ghost: on('ghost'), invis: on('invis'), freeze: on('freeze'),
    });
    if (wasGhost && !fx.ghost) this.player.body.setAllowGravity(true);
    // angel: comes while the perk works, flies away after
    if (on('angel') && !this.angel) this.angel = new Angel(this, this.player.x);
    if (on('angel') && this.angel) this.angel.stay();
    if (!on('angel') && this.angel) this.angel.leave();
    // dawn: every zombie crumbles, new ones too (and it keeps working in the next place)
    if (on('dawn') && !this.dawn) this.dawn = new DawnFx(this);
    if (this.dawn) {
      const left = this.perkLeft[PERK_INDEX.dawn] / (PERKS[PERK_INDEX.dawn].durationMs / 1000);
      this.dawn.update(dt, left);
      if (this.dawn.lit && on('dawn')) {
        for (const z of this.zombies) {
          if (!z.alive || (z.state === 'rising' && !z.hittable)) continue;
          z.crumble();
          this.onKill(z, 'low', z.size === 'big' || z.size === 'giant');
        }
      }
      if (!on('dawn') && left <= 0) {
        this.dawn.destroy();
        this.dawn = undefined;
      }
    }
  }

  private spawnPerk(id: PerkId, x: number, y: number, dropped: boolean, choice = false) {
    const img = this.add.image(x, y, perkTexture(this, id)).setDepth(18);
    if (dropped) {
      this.physics.add.existing(img);
      const b = img.body as Phaser.Physics.Arcade.Body;
      b.setCollideWorldBounds(true);
      b.setBounce(0.45, 0.35);
      b.setVelocity(Phaser.Math.Between(-110, 110), -420);
      b.setDrag(90, 0);
      b.setCircle(22, 8, 8);
    } else if (choice) {
      // a little glow so the three free perks stand out
      const glow = this.add.circle(x, y, 40, ACC.main, 0.18).setDepth(17);
      this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.05, duration: 800, yoyo: true, repeat: -1 });
      img.setData('glow', glow);
    }
    this.pickups.push({ img, id, dropped, choice, baseY: y, born: this.time.now });
  }

  private pickupBox(pk: PerkPickup): Rect {
    return { left: pk.img.x - 24, right: pk.img.x + 24, top: pk.img.y - 24, bottom: pk.img.y + 24 };
  }

  private collectPerk(pk: PerkPickup) {
    if (!pk.img.active || pk.img.getData('taken')) return;
    if (this.perkCounts[PERK_INDEX[pk.id]] >= PERK_MAX_STACK) return; // slot full: leave it lying there
    pk.img.setData('taken', true);
    const i = PERK_INDEX[pk.id];
    (pk.img.getData('glow') as Phaser.GameObjects.Arc | undefined)?.destroy();
    if (pk.img.body) this.physics.world.disableBody(pk.img.body as Phaser.Physics.Arcade.Body);
    // flies up into its slot
    const slot = this.perkBar.slotPos(i);
    const target = { x: slot.x + this.cameras.main.scrollX, y: slot.y + this.cameras.main.scrollY };
    pk.img.setDepth(103);
    // counted right away (so it isn't lost if the level changes mid-flight), the slot pops on arrival
    this.perkCounts[i] = Math.min(PERK_MAX_STACK, this.perkCounts[i] + 1);
    sfx.perkPick();
    this.popText(pk.img.x, pk.img.y - 30, PERKS[i].name);
    this.tweens.add({
      targets: pk.img, x: target.x, y: target.y, scale: 0.65, duration: 650, ease: 'Cubic.In',
      onComplete: () => {
        pk.img.destroy();
        this.perkBar.pop(i);
      },
    });
    this.tip('perk', `You got a perk! Press ${PERKS[i].key} to use it.\nIt works for a few seconds.`);
    if (pk.choice) {
      // the other two free perks vanish, then the way on opens
      for (const o of this.pickups) {
        if (o === pk || !o.choice || o.img.getData('taken')) continue;
        o.img.setData('taken', true);
        (o.img.getData('glow') as Phaser.GameObjects.Arc | undefined)?.destroy();
        this.dustAt(o.img.x, o.img.y, 10);
        this.tweens.add({ targets: o.img, scale: 0, alpha: 0, angle: 180, duration: 400, onComplete: () => o.img.destroy() });
      }
      if (this.phase === 'choose') {
        this.phase = 'cleared';
        this.phaseT = 0;
        this.time.delayedCall(900, () => {
          if (this.phase === 'cleared') this.openExit();
        });
      }
    }
  }

  private updatePickups() {
    const p = this.player;
    const hb = p.hurtbox();
    for (const pk of this.pickups) {
      if (!pk.img.active || pk.img.getData('taken')) continue;
      const age = (this.time.now - pk.born) / 1000;
      if (!pk.dropped) pk.img.y = pk.baseY + Math.sin(age * 3 + pk.img.x) * 6;
      pk.img.setAngle(Math.sin(age * 2.5) * 8);
      if (!p.dead && pk.img.x > hb.left - 26 && pk.img.x < hb.right + 26 && pk.img.y > hb.top - 26 && pk.img.y < hb.bottom + 14 && age > 0.35) this.collectPerk(pk);
    }
    this.pickups = this.pickups.filter((pk) => pk.img.active);
  }

  throwSpear(player: Player, kind: SwingKind, x: number, y: number) {
    const sp = new Spear(this, x, y, player.facing, kind);
    sp.throwerFoot = player.onGround ? player.footY : Infinity; // a hit counts as "from the ledge" by where it was thrown
    this.spears.push(sp);
    sfx.spear();
  }

  private updateSpears(dt: number) {
    for (const sp of this.spears) {
      sp.update(dt);
      const box = sp.box();
      for (const sc of this.secrets) if (!sp.hit.has(sc) && sc.hit(box)) sp.hit.add(sc);
      for (const z of this.zombies) {
        if (!z.hittable || sp.hit.has(z) || !overlap(box, z.hurtbox())) continue;
        sp.hit.add(z); // pierces: keeps flying through
        const dmg = Math.round(45 * (this.player.fx.sword ? 1.6 : 1));
        if (this.fromLedge(z, sp.throwerFoot)) z.anger();
        this.hitZombie(z, dmg, sp.kind, sp.dir, 220, box.top, false, true);
      }
      if (sp.dead) sp.destroy();
    }
    this.spears = this.spears.filter((sp) => !sp.dead);
  }

  private updateAngel(dt: number) {
    const a = this.angel;
    if (!a) return;
    a.update(dt, this.zombies, this.player, (z) => {
      this.hitZombie(z, 30, 'high', z.x >= a.x ? 1 : -1, 140, 0, false, false);
    });
    if (a.done) {
      a.destroy();
      this.angel = undefined;
    }
  }

  // ---- v5: helicopter drops and shuttlecocks ----------------------------------

  private updateHeli(dt: number) {
    const h = this.heli;
    if (!h) return;
    h.t += dt;
    h.x += h.dir * 300 * dt;
    if (h.x > WIDTH + 220) h.dir = -1;
    if (h.x < -220) h.dir = 1;
    this.heliDropT -= dt;
    const over = h.x > ARENA_LEFT + 90 && h.x < ARENA_RIGHT - 90 && Math.abs(h.x - this.player.x) > 200;
    if (over && this.heliQueue.length && this.heliDropT <= 0 && this.phase === 'wave') {
      this.heliDropT = 0.7;
      const size = this.heliQueue.shift()!;
      this.pending--;
      // the giant is too heavy to jump out: it climbs out of the ground instead
      if (size === 'giant') return void this.spawnRise(size, this.randomXAway());
      const z = new Zombie(this, this, size, h.x, this.level.strength, this.variantFor(), 'drop', 190);
      this.zombies.push(z);
    }
    // draw: body, tail boom, spinning rotor, skids
    const g = h.g;
    g.clear();
    const y = 120 + Math.sin(h.t * 2) * 6, d = h.dir;
    g.fillStyle(0xe6e5df, 1);
    g.fillEllipse(h.x, y, 130, 56);
    g.lineStyle(4, INK, 1);
    g.strokeEllipse(h.x, y, 130, 56);
    g.lineStyle(9, INK, 1);
    g.lineBetween(h.x - d * 55, y - 4, h.x - d * 140, y - 14);
    g.lineStyle(4, INK, 1);
    g.lineBetween(h.x - d * 140, y - 34, h.x - d * 140, y + 6);
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(h.x + d * 34, y - 6, 40, 26);
    g.strokeEllipse(h.x + d * 34, y - 6, 40, 26);
    g.lineStyle(4, ACC.main, 1);
    g.lineBetween(h.x - 50, y + 10, h.x + 40, y + 10);
    g.lineStyle(4, INK, 1);
    g.lineBetween(h.x, y - 28, h.x, y - 40);
    const blade = Math.abs(Math.sin(h.t * 30)) * 120 + 20;
    g.lineBetween(h.x - blade, y - 40, h.x + blade, y - 40);
    g.lineBetween(h.x - 50, y + 44, h.x + 50, y + 44);
    g.lineBetween(h.x - 30, y + 24, h.x - 34, y + 44);
    g.lineBetween(h.x + 30, y + 24, h.x + 34, y + 44);
  }

  zombieShoot(z: Zombie) {
    const p = this.player;
    const hand = z.lastPoints?.hand ?? { x: z.x, y: z.footY - z.height * 0.7 };
    const hb = p.hurtbox();
    const tx = p.x, ty = (hb.top + hb.bottom) / 2;
    const dir = Math.sign(tx - hand.x) || 1;
    const vx = dir * 470;
    const t = Math.max(0.3, Math.abs(tx - hand.x) / 470);
    const y0 = hand.y - 20;
    const vy = (ty - y0 - 0.5 * 900 * t * t) / t;
    this.shuttles.push({ g: this.add.graphics().setDepth(22), x: hand.x, y: y0, vx, vy, dmg: Math.round(z.damage * 0.6), dir });
    sfx.swing(false);
  }

  private updateShuttles(dt: number) {
    const p = this.player;
    for (const s of this.shuttles) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 900 * dt;
      const a = Math.atan2(s.vy, s.vx);
      const g = s.g;
      g.clear();
      // feathered cone with a cork tip in the accent colour
      const c = Math.cos(a), sn = Math.sin(a);
      const back = { x: s.x - c * 18, y: s.y - sn * 18 };
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(s.x, s.y, back.x - sn * 9, back.y + c * 9, back.x + sn * 9, back.y - c * 9);
      g.lineStyle(2, INK, 1);
      g.strokeTriangle(s.x, s.y, back.x - sn * 9, back.y + c * 9, back.x + sn * 9, back.y - c * 9);
      g.fillStyle(ACC.main, 1);
      g.fillCircle(s.x, s.y, 4.5);
      const live = this.phase === 'wave' || this.phase === 'between';
      const hit = live && !p.dead && overlap({ left: s.x - 8, right: s.x + 8, top: s.y - 8, bottom: s.y + 8 }, p.hurtbox());
      if (hit) {
        const res = p.damage(s.dmg, s.dir);
        if (res === 'hit') {
          this.spill(p.x, s.y, s.dir, 10);
          this.cameras.main.shake(100, 0.004);
        } else if (res === 'blocked') this.impact(s.x, s.y, 0.8);
      }
      if (hit || s.y > GROUND_Y + 4 || s.x < ARENA_LEFT - 40 || s.x > ARENA_RIGHT + 40) {
        if (!hit) this.dustAt(s.x, GROUND_Y, 3);
        s.g.destroy();
        s.x = NaN;
      }
    }
    this.shuttles = this.shuttles.filter((s) => !Number.isNaN(s.x));
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
    const arrow = this.add.text(-150, -120, 'GO  →', { fontFamily: FONT_IMPACT, fontSize: '54px', color: hex(ACC.main), stroke: hex(INK), strokeThickness: 3 }).setOrigin(0.5);
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
    // the place being left keeps its own chapter's ground line (baked when it was shown)
    const oldGround = `ground-${ACCENTS[chapterOfPlace(from as PlaceId)].main.toString(16)}`;
    this.add.image(-WIDTH, 0, this.textures.exists(oldGround) ? oldGround : groundKey()).setOrigin(0).setDepth(50);
    const cam = this.cameras.main;
    cam.setScroll(-WIDTH, 0);
    this.tweens.add({ targets: cam, scrollX: 0, duration: 1100, ease: 'Sine.InOut', onComplete: () => this.startIntro() });
  }

  private variantFor(): ZombieVariant {
    const r = Math.random();
    if (this.chapter === 0) return r < 0.25 ? 'bandage' : 'plain';
    if (this.chapter === 1) return r < 0.35 ? 'tophat' : r < 0.55 ? 'bandage' : 'plain';
    if (this.chapter === 2) return r < 0.6 ? 'helmet' : r < 0.75 ? 'bandage' : 'plain';
    const own: ZombieVariant[][] = [
      ['football', 'basket', 'badminton'], ['soldier'], ['farmer', 'farmerHat'], ['pirate'], ['cashier'], ['cook'], ['pilot'],
    ];
    const pool = own[this.chapter - 3] ?? ['plain'];
    // the stadium: mostly the sport of the place
    if (this.chapter === 3) {
      const main = (['football', 'football', 'basket', 'badminton', 'football'] as ZombieVariant[])[Math.max(0, this.levelIdx)];
      return r < 0.6 ? main : pool[Math.floor(Math.random() * pool.length)];
    }
    return r < 0.85 ? pool[Math.floor(Math.random() * pool.length)] : r < 0.93 ? 'bandage' : 'plain';
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
      .text(WIDTH / 2, 170, text, {
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
    const carry = {
      weapon: this.weaponId,
      score: this.score,
      // the level bonus heals up to 100%; health overfilled by hearts carries over
      hp: Math.max(this.player.hp, Math.min(100, this.player.hp + (this.isCamp ? 0 : 35))),
      kills: this.kills,
      fromPlace: this.place.id,
      perks: this.perkCounts,
      perksLeft: this.perkLeft,
    };
    if (this.levelIdx < ch.levels - 1) {
      this.scene.restart({ chapter: this.chapter, level: this.levelIdx + 1, ...carry } satisfies GameSceneData);
    } else if (this.chapter < CHAPTERS.length - 1) {
      // straight on into the next chapter: its level 0 first
      storage.unlockChapter(this.chapter + 1);
      this.scene.restart({ chapter: this.chapter + 1, level: -1, ...carry } satisfies GameSceneData);
    } else {
      this.finish(true);
    }
  }

  private finish(win: boolean) {
    this.scene.start('Result', {
      win,
      score: this.score,
      chapter: this.chapter,
      level: Math.max(0, this.levelIdx),
      weapon: this.weaponId,
      kills: this.kills,
    });
  }

  // ---- combat callbacks -------------------------------------------------

  playerSwing(player: Player, kind: SwingKind, box: Rect, hitOnce: Set<unknown>) {
    const w = player.weapon;
    const fx = player.fx;
    for (const sc of this.secrets) if (!hitOnce.has(sc) && sc.hit(box)) hitOnce.add(sc);
    for (const pk of this.pickups) if (overlap(box, this.pickupBox(pk))) this.collectPerk(pk);
    // perk multipliers
    const mul = (fx.sword ? 1.6 : 1) * (fx.long ? 1.3 : 1) * (fx.ghost ? 2 : 1) * (fx.berserk ? 0.7 : 1);
    const knock = fx.long ? 2 : 1;
    for (const z of this.zombies) {
      if (!z.hittable || hitOnce.has(z)) continue;
      if (!overlap(box, z.hurtbox())) continue;
      hitOnce.add(z);
      const dir = fx.berserk ? Math.sign(z.x - player.x) || player.facing : player.facing;
      const dmg = Math.round(w.damage * (kind === 'high' ? 1.3 : 1) * mul);
      if (this.fromLedge(z)) z.anger();
      this.hitZombie(z, dmg, kind, dir, w.knockback * (kind === 'high' ? 1.25 : 1) * knock, box.top, !fx.berserk, w.id === 'axe');
    }
  }

  /** The player is standing on a ledge above this zombie (or was, at `footY`, when throwing a spear). */
  private fromLedge(z: Zombie, footY = this.player.onGround ? this.player.footY : Infinity) {
    return z.footY - footY > 20;
  }

  /** Shared by swings, spears and the angel. `heavyFx` = full hit-stop and shake (not for rapid hits). */
  private hitZombie(z: Zombie, dmg: number, kind: SwingKind, dir: number, knockback: number, minY: number, heavyFx: boolean, heavySound: boolean) {
    const killed = z.takeHit(dmg, kind, dir, knockback);
    if (this.player.fx.freeze && !killed) z.freeze(1.5);
    const hb = z.hurtbox();
    const hy = kind === 'high' ? hb.top + (hb.bottom - hb.top) * 0.25 : hb.top + (hb.bottom - hb.top) * 0.6;
    const hx = dir > 0 ? hb.left + 4 : hb.right - 4;
    const big = z.size === 'big' || z.size === 'giant';
    this.spill(hx, Math.max(hy, minY), dir, killed ? 34 : heavyFx ? 14 : 7);
    this.impact(hx, Math.max(hy, minY), killed || heavySound ? 1.3 : 1);
    if (killed && (big || Math.random() < 0.25)) this.lensBlood(big ? 4 : 1);
    sfx.hit(heavySound);
    if (heavyFx) {
      this.cameras.main.shake(killed ? 140 : 70, killed ? 0.006 : 0.003);
      this.freeze(killed ? 0.07 : 0.035);
    } else if (killed) this.cameras.main.shake(90, 0.004);
    if (killed) this.onKill(z, kind, big);
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
    // perks: never from small ones, rarely from medium, more often from big, three from the giant
    const perkCount = z.size === 'giant' ? 3 : Math.random() < { small: 0, medium: 0.05, big: 0.2, giant: 0 }[z.size] ? 1 : 0;
    for (let i = 0; i < perkCount; i++) this.spawnPerk(randomPerk(), z.x + (i - 1) * 30, z.footY - z.height * 0.7, true);
    if (z.ash) {
      sfx.crumble();
      const hb = z.hurtbox();
      for (let i = 0; i < 4; i++) this.ash.explode(14, z.x + Phaser.Math.Between(-12, 12), hb.top + (hb.bottom - hb.top) * (i / 4));
      return;
    }
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
      const [r, g, b] = rgbOf(ACC.main);
      this.cameras.main.flash(90, r, g, b, false);
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
        .setTint(Math.random() < 0.6 ? ACC.main : ACC.dark)
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
      .setTint(Math.random() < 0.5 ? ACC.main : ACC.dark)
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
    if (this.levelIdx === 0 && this.phase === 'wave' && this.phaseT > 9) this.tip('secret', 'Psst… things that wobble may hide a PERK.\nHit them, put out candles, scare the birds!');
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
    const frac = Math.min(1, this.player.hp / this.player.maxHp);
    // overfilled by hearts: 100…200% fills back from the right end, in the accent colour
    const over = Math.max(0, Math.min(1, this.player.hp / this.player.maxHp - 1));
    hp.fillStyle(0xffffff, 1);
    hp.fillRect(x, y, w, h);
    // pulse when low on health
    const low = frac < 0.3 && !this.player.dead;
    hp.fillStyle(low && Math.floor(this.time.now / 250) % 2 ? ACC.main : INK, 1);
    hp.fillRect(x, y, w * frac, h);
    // hatch the empty part so it reads clearly in B&W
    hp.lineStyle(1, INK, 0.35);
    for (let i = x + w * frac; i < x + w; i += 6) hp.lineBetween(i, y + h, Math.min(i + 6, x + w), y);
    if (over > 0) {
      hp.fillStyle(ACC.main, 1);
      hp.fillRect(x + w * (1 - over), y, w * over, h);
      hp.lineStyle(2, 0xffffff, 0.9);
      hp.lineBetween(x + w * (1 - over), y + 2, x + w * (1 - over), y + h - 2);
    }
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
    hp.lineStyle(2, broke && Math.floor(this.time.now / 120) % 2 ? ACC.main : INK, 1);
    hp.strokeRect(x, sy, w, sh);
    this.perkBar.draw(this.perkCounts, this.perkLeft.map((l, i) => (l > 0 ? l / (PERKS[i].durationMs / 1000) : 0)), this.time.now / 1000);
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
    return {
      chapter: this.chapter, level: this.levelIdx, weapon: this.weaponId, score: this.levelStartScore, hp: this.startHp, kills: this.levelStartKills,
      perks: this.perksAtStart, perksLeft: this.perksLeftAtStart,
    };
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
      zombies: this.zombies.map((z) => ({ size: z.size, state: z.state, x: Math.round(z.x), hp: z.hp, frozen: z.frozen, ash: z.ash })),
      spears: this.spears.length,
      angel: !!this.angel,
      kills: this.kills,
      queue: this.spawnQueue.length,
      player: { x: Math.round(this.player.x), y: Math.round(this.player.footY), crouch: this.player.crouching, facing: this.player.facing > 0 },
      perks: [...this.perkCounts],
      perksOn: PERKS.filter((_p, i) => this.perkLeft[i] > 0).map((p) => p.id),
      pickups: this.pickups.map((p) => ({ id: p.id, x: Math.round(p.img.x), y: Math.round(p.img.y), choice: p.choice })),
      secrets: this.secrets.map((sc) => ({ kind: sc.def.kind, x: sc.def.x, y: sc.def.y, x2: sc.def.x2, done: sc.done })),
    };
  }
}
