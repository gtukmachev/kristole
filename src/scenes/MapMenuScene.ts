/**
 * v7 main menu: a scrolling world map (an old treasure map, seen from above).
 * Chapters are little landmarks on a winding trail; the hero stands on his chapter.
 * Passed chapters: happy people, smoke from chimneys. The others: zombies, broken huts.
 * Everything lives a little: day and night, lights in windows, animals in the groves.
 */
import Phaser from 'phaser';
import {
  ACCENTS, FONT_HAND, FONT_SLAB, HEIGHT, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH, hex,
} from '../game/constants';
import { CHAPTERS } from '../game/data';
import { storage } from '../game/storage';
import { sfx } from '../game/sfx';
import { GridNav, type NavItem } from '../game/ui';
import { drawFigure, lerpPose, pose, type Pose, type ZombieVariant } from '../game/figure';
import { penLine, rng, type G } from '../game/background';
import {
  LAMP, MAP_BROWN, MAP_PAPER, Pen, TITLE_BROWN, balloon, bird, bunny, duck, emptyFx, flag, flame, fox, glow, hut, jeep,
  landmark, plane, ship, squirrel, windmill, type Hut, type LandFx, type V, type Win,
} from '../game/mapArt';
import { drawLogo } from './MenuScene';
import { isDebug, setMenuKind } from '../game/menuChoice';

const TAU = Math.PI * 2;
const HEADER_H = 172;
const N = CHAPTERS.length;
const STEP = 300;
const WORLD_W = 200 + STEP * (N - 1) + 200;
const ART_S = 0.7;
const DAY_CYCLE = 150; // s: day, dusk, night, dawn

const NODES: V[] = CHAPTERS.map((_c, i) => ({ x: 200 + i * STEP, y: 470 + Math.sin(i * 1.35 + 0.4) * 120 }));
const ART: V[] = NODES.map((n) => ({ x: n.x + 4, y: n.y - 26 }));
const LABEL: V[] = NODES.map((n) => ({ x: n.x, y: n.y + 40 }));
const SHIP_I = CHAPTERS.findIndex((c) => c.bg === 'ship');
const SEA = { x: NODES[SHIP_I].x, y: NODES[SHIP_I].y + 44, rx: 250, ry: 125 };
const LAKE = { x: 1190, y: 625, rx: 92, ry: 36 };
const RIVER: V[] = [{ x: 935, y: 175 }, { x: 905, y: 250 }, { x: 965, y: 330 }, { x: 945, y: 420 }, { x: 1020, y: 505 }, { x: 1120, y: 600 }];
const SPECIAL = {
  mill: { x: 1510, y: 660 },
  well: { x: 640, y: 318 },
  fire: { x: 330, y: 258 },
  chest: { x: 2960, y: 650 },
  compass: { x: 110, y: 640 },
  signs: [{ x: 352, y: 610, t: ['CLIFF ←', '→ GRAVES'] }, { x: 1555, y: 520, t: ['← BASE', 'VILLAGE →'] }, { x: 2440, y: 470, t: ['← MALL', 'BURGERS →'] }],
};
const VARIANT: ZombieVariant[] = ['plain', 'bandage', 'helmet', 'football', 'soldier', 'farmer', 'pirate', 'cashier', 'cook', 'pilot'];

// key poses (facing right)
const P_IDLE = pose({ lean: 0.06, fThigh: 0.16, fShin: 0.04, bThigh: -0.18, bShin: -0.06, fUpper: 0.55, fFore: 1.45, bUpper: -0.25, bFore: 0.35, weapon: 2.55 });
const HIGH_A = pose({ lean: 0.18, fThigh: 0.4, fShin: 0.1, bThigh: -0.35, bShin: -0.15, fUpper: 0.2, fFore: 0.35, bUpper: -0.5, bFore: -0.2, weapon: 0.55 });
const HIGH_B = pose({ lean: -0.12, fThigh: 0.35, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.6, fFore: 2.85, bUpper: -0.9, bFore: -0.6, weapon: 3.0 });
const P_JUMP = pose({ lean: 0.12, fThigh: 1.0, fShin: -0.15, bThigh: 0.25, bShin: -0.7, fUpper: 1.0, fFore: 2.0, bUpper: -0.9, bFore: -0.4, weapon: 2.8, lift: 6 });
const P_TUCK = pose({ lean: 0.5, fThigh: 1.9, fShin: -0.6, bThigh: 1.7, bShin: -0.8, fUpper: 1.4, fFore: 2.0, bUpper: 0.9, bFore: 1.4, weapon: 2.2 });
const P_KICK = pose({ lean: -0.1, fThigh: 1.2, fShin: 0.6, bThigh: -0.1, bShin: 0, fUpper: -0.6, fFore: -0.3, bUpper: 0.6, bFore: 0.9 });

function walkPose(ph: number, zombie: boolean, run = false): Pose {
  const s = Math.sin(ph), c = Math.cos(ph);
  const k = run ? 0.75 : 0.42;
  return pose({
    lean: zombie ? 0.3 : run ? 0.25 : 0.05,
    head: zombie ? 0.2 + Math.sin(ph * 0.5) * 0.15 : 0,
    fThigh: k * s, fShin: k * s - 0.35 * Math.max(0, c), bThigh: -k * s, bShin: -k * s - 0.35 * Math.max(0, -c),
    fUpper: zombie ? 1.45 + 0.1 * s : run ? 1.0 - 0.6 * s : -0.35 * s, fFore: zombie ? 1.6 : run ? 1.9 : 0.3 - 0.3 * s,
    bUpper: zombie ? 1.3 - 0.1 * s : run ? -0.5 + 0.6 * s : 0.35 * s, bFore: zombie ? 1.5 : run ? 0.2 : 0.3 + 0.3 * s,
    weapon: 2.55,
  });
}

function nightOf(t: number) {
  const u = (t + 40) % DAY_CYCLE;
  if (u < 80) return 0;
  if (u < 95) return (u - 80) / 15;
  if (u < 135) return 1;
  return 1 - (u - 135) / 15;
}

const ellipseHas = (e: { x: number; y: number; rx: number; ry: number }, x: number, y: number, pad = 0) =>
  ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad)) ** 2 < 1;

function distToPolyline(pts: V[], x: number, y: number) {
  let best = 1e9;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Phaser.Math.Clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}

type Tree = { x: number; y: number; s: number };
type Grove = { x: number; y: number; r: number; trees: Tree[] };
type Actor = { ch: number; x: number; dir: number; speed: number; ph: number; zombie: boolean; fight: number; smash: number; hut?: Hut; seed: number };
type Puff = { x: number; y: number; t: number; life: number; dx: number; color: number; grow: number };
type Bunny = { x: number; y: number; from: V; to: V; t: number; dur: number; active: boolean; wait: number };
type Flock = { x: number; y: number; vx: number; birds: { dx: number; dy: number; ph: number; vx: number; vy: number }[]; scatter: boolean };

export class MapMenuScene extends Phaser.Scene {
  private unlocked = 0;
  private mapC!: Phaser.GameObjects.Container;
  private dyn!: G;
  private fogG!: G;
  private nightG!: G;
  private lampG!: G;
  private scrollX = 0;
  private spline!: Phaser.Curves.Spline;
  private fx: LandFx[] = [];
  private groves: Grove[] = [];
  private actors: Actor[] = [];
  private puffs: Puff[] = [];
  private bunnies: Bunny[] = [];
  private flocks: Flock[] = [];
  private flockT = 3;
  private squirrel = { tree: null as Tree | null, t: 0, wait: 2, dir: 1 };
  private foxRun = { active: false, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, t: 0, dur: 1, wait: 6 };
  private fish = { active: false, x: 0, y: 0, t: 0, wait: 2, dir: 1 };
  private owls: Tree[] = [];
  private neon: Phaser.GameObjects.Text[] = [];
  private heroPos = 0;
  private heroTarget = 0;
  private heroFacing = 1;
  private act: { kind: 'idle' | 'swing' | 'jump' | 'flip' | 'run'; t: number } = { kind: 'idle', t: 0 };
  private nextAct = 2;
  private startOnArrive = false;
  private starting = false;
  private mapFocused = true;
  private toast!: Phaser.GameObjects.Text;
  private t = 0;
  private dayT = 0;

  constructor() {
    super('MapMenu');
  }

  create() {
    sfx.playMusic('menu');
    this.unlocked = Math.min(N - 1, storage.getProgress().unlockedChapter);
    const spot = storage.getSpot();
    this.heroPos = this.heroTarget = Phaser.Math.Clamp(spot?.chapter ?? this.unlocked, 0, this.unlocked);
    this.act = { kind: 'idle', t: 0 };
    this.actors = [];
    this.puffs = [];
    this.bunnies = [];
    this.flocks = [];
    this.neon = [];
    this.fx = CHAPTERS.map(() => emptyFx());
    this.starting = false;
    this.startOnArrive = false;
    this.t = 0;
    this.dayT = Math.random() * 20;

    this.mapC = this.add.container(0, 0);
    const pts = [new Phaser.Math.Vector2(NODES[0].x - 230, NODES[0].y + 50), ...NODES.map((n) => new Phaser.Math.Vector2(n.x, n.y)), new Phaser.Math.Vector2(NODES[N - 1].x + 230, NODES[N - 1].y - 20)];
    this.spline = new Phaser.Curves.Spline(pts);
    this.buildGroves();

    // The static map is painted once into a texture (thousands of pen strokes).
    const key = `worldmap-${this.unlocked}`;
    const g = this.make.graphics({}, false);
    this.paintStatic(g);
    if (this.textures.exists(key)) this.textures.remove(key);
    g.generateTexture(key, WORLD_W, HEIGHT);
    g.destroy();
    this.mapC.add(this.add.image(0, 0, key).setOrigin(0));

    // signs painted on landmarks (neon ones blink)
    this.fx.forEach((f, i) => {
      for (const tx of f.texts) {
        const t = this.add.text(tx.x, tx.y, tx.s, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: `${Math.round(tx.size)}px`, color: hex(tx.key === 'neon' ? ACCENTS[i].main : INK) })
          .setOrigin(0.5).setAlpha(i > this.unlocked ? 0.35 : 1);
        this.mapC.add(t);
        if (tx.key === 'neon' && i <= this.unlocked) this.neon.push(t);
      }
    });

    this.dyn = this.add.graphics();
    this.fogG = this.add.graphics();
    this.nightG = this.add.graphics();
    this.lampG = this.add.graphics();
    this.mapC.add([this.dyn, this.fogG, this.nightG, this.lampG]);
    this.paintFog();
    this.addLabels();

    // little people / zombies
    const rand = rng(31);
    CHAPTERS.forEach((_c, i) => {
      const passed = i < this.unlocked;
      for (let k = 0; k < 3; k++) {
        this.actors.push({
          ch: i, x: ART[i].x + (rand() - 0.5) * 140, dir: rand() < 0.5 ? -1 : 1, speed: 8 + rand() * 10,
          ph: rand() * 10, zombie: !passed, fight: 0, smash: 0, seed: i * 7 + k,
        });
      }
    });
    this.bunnies = [0, 1, 2, 3].map((k) => {
      const gr = this.groves[Math.floor((k + 0.5) * this.groves.length / 4)];
      return { x: gr.x, y: gr.y, from: gr, to: gr, t: 0, dur: 1, active: false, wait: 2 + k * 3 };
    });
    this.owls = this.groves.filter((_g, i) => i % 5 === 2).map((gr) => gr.trees[0]);

    this.header();
    this.scrollTo(NODES[this.heroPos].x - WIDTH / 2, false);
    this.setupInput();
  }

  // ---------------------------------------------------------------- static map

  private buildGroves() {
    const rand = rng(2024);
    this.groves = [];
    const tries = 260;
    for (let k = 0; k < tries && this.groves.length < 46; k++) {
      const x = 40 + rand() * (WORLD_W - 80), y = HEADER_H + 40 + rand() * (HEIGHT - HEADER_H - 70);
      if (!this.free(x, y, 40)) continue;
      if (this.groves.some((g) => Math.hypot(g.x - x, g.y - y) < 95)) continue;
      const n = 3 + Math.floor(rand() * 5);
      const trees: Tree[] = [];
      for (let t = 0; t < n; t++) trees.push({ x: x + (rand() - 0.5) * 56, y: y + (rand() - 0.5) * 26, s: 0.85 + rand() * 0.45 });
      trees.sort((a, b) => a.y - b.y);
      this.groves.push({ x, y, r: 38, trees });
    }
  }

  /** Is this spot free of locations, labels, water and the special objects? */
  private free(x: number, y: number, pad = 0) {
    for (let i = 0; i < N; i++) {
      if (Math.abs(x - ART[i].x) < 120 + pad && y > ART[i].y - 140 - pad && y < LABEL[i].y + 22 + pad) return false;
    }
    if (ellipseHas(SEA, x, y, 30 + pad) || ellipseHas(LAKE, x, y, 26 + pad)) return false;
    if (distToPolyline(RIVER, x, y) < 26 + pad) return false;
    for (const s of [SPECIAL.mill, SPECIAL.well, SPECIAL.fire, SPECIAL.chest, SPECIAL.compass, ...SPECIAL.signs]) {
      if (Math.hypot(s.x - x, s.y - y) < 60 + pad) return false;
    }
    for (let t = 0; t <= 1; t += 0.01) {
      const p = this.spline.getPoint(t);
      if (Math.hypot(p.x - x, p.y - y) < 24 + pad * 0.6) return false;
    }
    return true;
  }

  private paintStatic(g: G) {
    const rand = rng(77);
    const pen = new Pen(g, rand);
    // parchment
    g.fillStyle(MAP_PAPER, 1);
    g.fillRect(0, 0, WORLD_W, HEIGHT);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle(0x6b4a1a, 0.03 + rand() * 0.04);
      g.fillRect(rand() * WORLD_W, HEADER_H + rand() * (HEIGHT - HEADER_H), 1 + rand() * 2, 1 + rand() * 2);
    }
    // stains
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0x9b7a3a, 0.035);
      g.fillCircle(rand() * WORLD_W, HEADER_H + rand() * (HEIGHT - HEADER_H), 30 + rand() * 70);
    }

    this.paintWater(g, pen, rand);

    // mountains (in the open land) and groves
    const mrand = rng(555);
    for (let k = 0; k < 200; k++) {
      const x = 30 + mrand() * (WORLD_W - 60), y = HEADER_H + 40 + mrand() * (HEIGHT - HEADER_H - 60);
      if (!this.free(x, y, 30) || this.groves.some((gr) => Math.hypot(gr.x - x, gr.y - y) < 70)) continue;
      if (mrand() < 0.55) {
        const w = 20 + mrand() * 20;
        pen.at(x, y, 1);
        pen.poly([[-w, 0], [0, w * 1.1], [w, 0]], 2, MAP_PAPER);
        pen.line(0, w * 1.1, w * 0.35, w * 0.55, 1.4, INK_SOFT);
        g.lineStyle(1.2, INK_SOFT, 0.4);
        for (let t = 4; t < w; t += 5) g.lineBetween(x + t * 0.2, y - t * 0.9, x + t, y);
        if (w > 32) pen.poly([[-w * 0.25, w * 0.8], [0, w * 1.1], [w * 0.25, w * 0.8]], 1.2, 0xffffff); // snow cap
      } else {
        // a few grass tufts / flowers
        for (let q = 0; q < 3; q++) {
          const fx = x + (mrand() - 0.5) * 30, fy = y + (mrand() - 0.5) * 14;
          g.lineStyle(1.2, INK_SOFT, 0.7);
          g.lineBetween(fx, fy, fx - 3, fy - 6); g.lineBetween(fx, fy, fx + 3, fy - 6);
          if (mrand() < 0.4) { g.fillStyle(ACCENTS[Math.floor(mrand() * 10)].main, 0.8); g.fillCircle(fx, fy - 7, 2); }
        }
      }
    }
    for (const gr of this.groves) {
      for (const t of gr.trees) {
        pen.at(t.x, t.y, t.s);
        pen.line(0, 0, 0, 8, 2, MAP_BROWN);
        pen.circle(0, 16, 9, 1.8, 0xdfe5bf);
        pen.line(-3, 18, 2, 21, 1, INK_SOFT);
      }
    }

    this.paintSpecials(g, pen, rand);
    this.paintPath(g);

    // locations
    for (let i = 0; i < N; i++) {
      const passed = i < this.unlocked, locked = i > this.unlocked;
      pen.alpha = locked ? 0.45 : 1;
      pen.at(ART[i].x, ART[i].y, ART_S);
      landmark(pen, i, passed, this.fx[i]);
      if (CHAPTERS[i].bg !== 'village' && CHAPTERS[i].bg !== 'ship') {
        pen.at(ART[i].x, ART[i].y, ART_S);
        hut(pen, this.fx[i], i, 122, !passed);
      }
      pen.alpha = 1;
    }

    // compass rose and frame
    const c = SPECIAL.compass;
    g.lineStyle(2, INK_SOFT, 1);
    g.strokeCircle(c.x, c.y, 34);
    g.strokeCircle(c.x, c.y, 28);
    pen.at(c.x, c.y, 1);
    pen.poly([[0, 48], [7, 0], [0, -48], [-7, 0]], 1.8, ACCENTS[3].soft);
    pen.poly([[48, 0], [0, 7], [-48, 0], [0, -7]], 1.8, MAP_PAPER);
    g.lineStyle(3, MAP_BROWN, 0.8);
    g.strokeRect(8, HEADER_H + 8, WORLD_W - 16, HEIGHT - HEADER_H - 16);
    g.lineStyle(1.2, MAP_BROWN, 0.6);
    g.strokeRect(16, HEADER_H + 16, WORLD_W - 32, HEIGHT - HEADER_H - 32);
  }

  private paintWater(g: G, _pen: Pen, rand: () => number) {
    // the sea (pirate ship)
    const sea: Phaser.Math.Vector2[] = [];
    for (let a = 0; a < TAU; a += 0.15) sea.push(new Phaser.Math.Vector2(SEA.x + Math.cos(a) * (SEA.rx + Math.sin(a * 3) * 26), SEA.y + Math.sin(a) * (SEA.ry + Math.cos(a * 4) * 14)));
    g.fillStyle(ACCENTS[6].soft, 0.6);
    g.fillPoints(sea, true);
    for (let i = 0; i < sea.length; i++) penLine(g, sea[i].x, sea[i].y, sea[(i + 1) % sea.length].x, sea[(i + 1) % sea.length].y, 2.2, INK_SOFT, rand);
    // a second, inner coast line, like on old maps
    g.lineStyle(1.2, INK_SOFT, 0.35);
    g.strokePoints(sea.map((p) => new Phaser.Math.Vector2(SEA.x + (p.x - SEA.x) * 0.9, SEA.y + (p.y - SEA.y) * 0.86)), true);
    for (let k = 0; k < 22; k++) {
      const wx = SEA.x - 200 + rand() * 400, wy = SEA.y - 90 + rand() * 180;
      if (!ellipseHas(SEA, wx, wy, -30) || Math.hypot(wx - ART[SHIP_I].x, wy - ART[SHIP_I].y + 40) < 110) continue;
      g.lineStyle(1.5, ACCENTS[6].main, 0.55);
      g.beginPath(); g.arc(wx, wy, 7, Math.PI, 0); g.arc(wx + 14, wy, 7, Math.PI, 0); g.strokePath();
    }
    // lake
    g.fillStyle(ACCENTS[6].soft, 0.6);
    g.fillEllipse(LAKE.x, LAKE.y, LAKE.rx * 2, LAKE.ry * 2);
    g.lineStyle(2.2, INK_SOFT, 1);
    g.strokeEllipse(LAKE.x, LAKE.y, LAKE.rx * 2, LAKE.ry * 2);
    for (const [dx, dy] of [[-40, -8], [10, 10], [44, -12]]) {
      g.lineStyle(1.2, ACCENTS[6].main, 0.5);
      g.lineBetween(LAKE.x + dx - 8, LAKE.y + dy, LAKE.x + dx + 8, LAKE.y + dy);
    }
    // reeds
    for (const dx of [-96, -88, 84, 92]) {
      g.lineStyle(1.4, 0x485210, 1);
      g.lineBetween(LAKE.x + dx, LAKE.y + 6, LAKE.x + dx + 2, LAKE.y - 14);
      g.fillStyle(0x5c3310, 1);
      g.fillEllipse(LAKE.x + dx + 2, LAKE.y - 15, 3, 7);
    }
    // the river into the lake
    const rs = new Phaser.Curves.Spline(RIVER.map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    const rp = rs.getPoints(80);
    g.lineStyle(14, ACCENTS[6].soft, 0.8);
    g.strokePoints(rp, false);
    for (const side of [-7, 7]) {
      const edge = rp.map((p, i) => {
        const q = rp[Math.min(rp.length - 1, i + 1)], o = rp[Math.max(0, i - 1)];
        const a = Math.atan2(q.y - o.y, q.x - o.x);
        return new Phaser.Math.Vector2(p.x - Math.sin(a) * side, p.y + Math.cos(a) * side);
      });
      g.lineStyle(1.8, INK_SOFT, 1);
      g.strokePoints(edge, false);
    }
  }

  private paintSpecials(g: G, pen: Pen, rand: () => number) {
    // windmill on a hill
    const m = SPECIAL.mill;
    pen.at(m.x, m.y, 0.8);
    pen.poly([[-14, 0], [-8, 64], [8, 64], [14, 0]], 2.4, PAPER);
    pen.poly([[-10, 64], [0, 78], [10, 64]], 2, ACCENTS[5].soft);
    pen.rect(-4, 0, 8, 12, 1.6);
    // well
    const w = SPECIAL.well;
    pen.at(w.x, w.y, 1);
    pen.rect(-14, 0, 28, 14, 2.2, PAPER);
    pen.hatchBox(-12, 2, 24, 10, 6);
    pen.line(-12, 14, -12, 36, 2); pen.line(12, 14, 12, 36, 2);
    pen.poly([[-18, 34], [0, 46], [18, 34]], 2, ACCENTS[5].soft);
    pen.line(0, 34, 0, 22, 1.2); pen.rect(-3, 16, 6, 6, 1.4, PAPER);
    // campfire base: logs and stones
    const f = SPECIAL.fire;
    pen.at(f.x, f.y, 1);
    pen.line(-12, 0, 12, 6, 3, MAP_BROWN); pen.line(-12, 6, 12, 0, 3, MAP_BROWN);
    for (let a = 0; a < TAU; a += TAU / 7) pen.circle(Math.cos(a) * 18, Math.sin(a) * 5 - 2, 3.5, 1.4, 0xdedbd0);
    pen.line(26, 0, 26, 12, 1.4); pen.line(36, 0, 36, 12, 1.4); pen.line(24, 12, 38, 12, 1.6); // a bench
    // signposts
    for (const s of SPECIAL.signs) {
      pen.at(s.x, s.y, 1);
      pen.line(0, 0, 0, 40, 2.4, MAP_BROWN);
      pen.poly([[-30, 36], [26, 36], [32, 31], [26, 26], [-30, 26]], 1.8, 0xead6c2);
      pen.poly([[30, 22], [-26, 22], [-32, 17], [-26, 12], [30, 12]], 1.8, 0xead6c2);
    }
    // the chest with an X
    const c = SPECIAL.chest;
    pen.at(c.x, c.y, 1);
    g.lineStyle(4, ACCENTS[0].main, 0.9);
    g.lineBetween(c.x - 40, c.y - 8, c.x - 20, c.y + 12);
    g.lineBetween(c.x - 20, c.y - 8, c.x - 40, c.y + 12);
    pen.rect(-8, 0, 34, 18, 2.2, 0xd99a00);
    pen.poly([[-8, 18], [-4, 28], [22, 28], [26, 18]], 2.2, 0xd99a00);
    pen.rect(6, 12, 6, 8, 1.4, INK);
    void rand;
  }

  private paintPath(g: G) {
    const steps = 1100;
    const tOpen = (this.unlocked + 1) / (N + 1);
    let prev = this.spline.getPoint(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = this.spline.getPoint(t);
      const open = t <= tOpen;
      const onSea = ellipseHas(SEA, pt.x, pt.y, -10);
      if (onSea) {
        // a wooden pier over the water
        g.lineStyle(9, 0xead6c2, 1);
        g.lineBetween(prev.x, prev.y, pt.x, pt.y);
        if (i % 6 === 0) {
          g.lineStyle(1.6, MAP_BROWN, 1);
          g.lineBetween(pt.x - 2, pt.y - 6, pt.x + 2, pt.y + 6);
        }
      } else if (i % 11 < (open ? 7 : 4)) {
        g.lineStyle(3.4, open ? TITLE_BROWN : INK_FAINT, 1);
        g.lineBetween(prev.x, prev.y, pt.x, pt.y);
      }
      prev = pt;
    }
    // bridge where the trail crosses the river
    let best = { d: 1e9, p: prev, a: 0 };
    for (let i = 0; i <= 400; i++) {
      const p = this.spline.getPoint(i / 400);
      const d = distToPolyline(RIVER, p.x, p.y);
      if (d < best.d) {
        const q = this.spline.getPoint(Math.min(1, i / 400 + 0.002));
        best = { d, p, a: Math.atan2(q.y - p.y, q.x - p.x) };
      }
    }
    const { p, a } = best;
    const nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9, tx = Math.cos(a) * 22, ty = Math.sin(a) * 22;
    g.fillStyle(0xead6c2, 1);
    g.fillPoints([new Phaser.Math.Vector2(p.x - tx + nx, p.y - ty + ny), new Phaser.Math.Vector2(p.x + tx + nx, p.y + ty + ny), new Phaser.Math.Vector2(p.x + tx - nx, p.y + ty - ny), new Phaser.Math.Vector2(p.x - tx - nx, p.y - ty - ny)], true);
    g.lineStyle(2.4, MAP_BROWN, 1);
    g.lineBetween(p.x - tx + nx, p.y - ty + ny, p.x + tx + nx, p.y + ty + ny);
    g.lineBetween(p.x - tx - nx, p.y - ty - ny, p.x + tx - nx, p.y + ty - ny);
    for (let k = -2; k <= 2; k++) {
      g.lineStyle(1.2, MAP_BROWN, 1);
      g.lineBetween(p.x + tx * k * 0.4 + nx, p.y + ty * k * 0.4 + ny, p.x + tx * k * 0.4 - nx, p.y + ty * k * 0.4 - ny);
    }
    // stops
    NODES.forEach((n, i) => {
      const locked = i > this.unlocked, passed = i < this.unlocked;
      const acc = ACCENTS[i];
      g.fillStyle(locked ? 0xe8e2d0 : acc.soft, 1);
      g.fillCircle(n.x, n.y, 15);
      g.lineStyle(3, locked ? INK_FAINT : TITLE_BROWN, 1);
      g.strokeCircle(n.x, n.y, 15);
      if (passed) {
        g.lineStyle(3, acc.main, 1);
        g.lineBetween(n.x - 7, n.y - 7, n.x + 7, n.y + 7);
        g.lineBetween(n.x + 7, n.y - 7, n.x - 7, n.y + 7);
      }
    });
  }

  /** "Here be zombies": fog over the chapters that are still locked. */
  private paintFog() {
    const g = this.fogG;
    g.clear();
    if (this.unlocked >= N - 1) return;
    const x0 = NODES[this.unlocked + 1].x - 150;
    const rand = rng(9);
    g.fillStyle(0xf7f4ec, 0.5);
    g.fillRect(x0 + 20, HEADER_H, WORLD_W - x0, HEIGHT - HEADER_H);
    for (let y = HEADER_H - 20; y < HEIGHT + 30; y += 34) {
      const x = x0 + 18 + Math.sin(y / 40) * 14;
      const r = 26 + rand() * 14;
      g.fillStyle(0xf7f4ec, 0.85);
      g.fillCircle(x, y, r);
      g.lineStyle(1.6, INK_FAINT, 0.9);
      g.beginPath(); g.arc(x, y, r, Math.PI * 0.55, Math.PI * 1.45); g.strokePath();
    }
    // puffs inside
    for (let k = 0; k < 40; k++) {
      const x = x0 + 60 + rand() * (WORLD_W - x0 - 60), y = HEADER_H + 20 + rand() * (HEIGHT - HEADER_H - 40);
      g.fillStyle(0xffffff, 0.2);
      g.fillCircle(x, y, 30 + rand() * 50);
    }
    const cx = Math.min(x0 + 330, WORLD_W - 260), cy = HEADER_H + 70;
    const t = this.add.text(cx, cy, 'Here be zombies', { fontFamily: FONT_HAND, fontSize: '30px', color: hex(INK_SOFT) }).setOrigin(0.5).setAngle(-4).setAlpha(0.8);
    this.mapC.add(t);
    // the monster of the old maps: a big zombie hand out of the fog
    const hx = cx + 150, hy = cy + 40;
    g.lineStyle(3, INK_SOFT, 0.7);
    g.fillStyle(0xdfe5bf, 0.7);
    g.fillRoundedRect(hx - 12, hy - 4, 24, 46, 6);
    g.strokeRoundedRect(hx - 12, hy - 4, 24, 46, 6);
    for (let k = 0; k < 4; k++) {
      g.fillRoundedRect(hx - 12 + k * 6.5, hy - 26 + Math.abs(k - 1.5) * 4, 5.5, 26, 2.5);
      g.strokeRoundedRect(hx - 12 + k * 6.5, hy - 26 + Math.abs(k - 1.5) * 4, 5.5, 26, 2.5);
    }
    g.fillRoundedRect(hx + 10, hy + 2, 12, 5, 2);
    g.strokeRoundedRect(hx + 10, hy + 2, 12, 5, 2);
  }

  private addLabels() {
    CHAPTERS.forEach((ch, i) => {
      const locked = i > this.unlocked;
      const t = this.add.text(LABEL[i].x, LABEL[i].y, `${i + 1}. ${ch.name}`, {
        fontFamily: FONT_HAND, fontStyle: 'bold', fontSize: '22px', color: hex(locked ? 0x8f8a7e : 0x4a2a08),
        stroke: hex(MAP_PAPER), strokeThickness: 4,
      }).setOrigin(0.5);
      this.mapC.add(t);
    });
  }

  // ---------------------------------------------------------------- header & input

  private header() {
    const g = this.add.graphics().setDepth(10);
    const rand = rng(5);
    g.fillStyle(PAPER, 1);
    g.fillRect(0, 0, WIDTH, HEADER_H);
    for (let i = 0; i < 300; i++) {
      g.fillStyle(0x000000, 0.02 + rand() * 0.03);
      g.fillRect(rand() * WIDTH, rand() * HEADER_H, 1 + rand() * 2, 1 + rand() * 2);
    }
    for (let x = 0; x < WIDTH; x += 40) penLine(g, x, HEADER_H, x + 40, HEADER_H, 3, INK, rand);
    g.fillStyle(0x000000, 0.06);
    g.fillRect(0, HEADER_H + 2, WIDTH, 5);
    drawLogo(this, WIDTH / 2, 12, 0.42, TITLE_BROWN).setDepth(11);

    const small = { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '15px', color: '#555555' };
    this.add.text(16, 14, `Hi, ${storage.getProfile().name}!`, { ...small, fontStyle: 'bold', color: hex(TITLE_BROWN) }).setDepth(11);
    this.add.text(16, 36, 'GAME DESIGN BY LEO T.', { ...small, fontSize: '13px' }).setDepth(11);
    this.add.text(WIDTH - 16, 14, `M — sound  ·  v${__APP_VERSION__}`, { ...small, fontSize: '13px', color: '#888888' }).setOrigin(1, 0).setDepth(11);

    const defs: { label: string; off?: boolean; act: () => void }[] = [
      { label: 'Play', act: () => this.go(this.heroTarget) },
      { label: 'Avatar', act: () => this.scene.start('Avatar') },
      { label: 'Leaderboard', act: () => this.scene.start('Leaderboard') },
      { label: 'Perks', act: () => this.scene.start('Perks', { from: 'menu' }) },
      { label: 'Events', off: true, act: () => this.say('Coming soon!') },
      { label: 'Rewards', off: true, act: () => this.say('Coming soon!') },
    ];
    const bw = 158, bh = 42, gap = 16;
    const x0 = WIDTH / 2 - ((bw + gap) * defs.length - gap) / 2;
    const frame = this.add.graphics().setDepth(11);
    const items: NavItem[] = defs.map((d, i) => {
      const x = x0 + i * (bw + gap), y = 104;
      for (const [ax, ay, bx, by] of [[x, y, x + bw, y], [x + bw, y, x + bw, y + bh], [x + bw, y + bh, x, y + bh], [x, y + bh, x, y]]) {
        penLine(g, ax, ay, bx, by, i === 0 ? 3.4 : 2.4, d.off ? INK_FAINT : INK, rand);
      }
      if (i === 0) {
        g.fillStyle(ACCENTS[this.heroPos].soft, 1);
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
      this.add.text(x + bw / 2, y + bh / 2, d.label, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '22px', color: d.off ? '#a6a6a0' : hex(INK) }).setOrigin(0.5).setDepth(11);
      const z = this.add.zone(x + bw / 2, y + bh / 2, bw, bh).setInteractive({ useHandCursor: true }).setDepth(12);
      const activate = () => {
        if (d.off) sfx.denied(); else sfx.click();
        d.act();
      };
      z.on('pointerup', activate);
      return {
        focus: (f: boolean) => {
          if (!f) return;
          frame.clear();
          frame.lineStyle(3, TITLE_BROWN, 1);
          frame.strokeRect(x - 5, y - 5, bw + 10, bh + 10);
        },
        activate,
        target: z,
      };
    });
    const mapItem: NavItem = {
      focus: (f) => {
        this.mapFocused = f;
        if (f) frame.clear();
      },
      activate: () => this.go(this.heroTarget),
      left: () => this.step(-1),
      right: () => this.step(1),
    };
    const nav = new GridNav(this, [items, [mapItem]], undefined, () => this.starting);
    nav.set(1, 0);

    if (isDebug()) {
      const t = this.add.text(WIDTH - 12, HEADER_H + 16, '⇄ classic menu', {
        fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '14px', color: '#ffffff', backgroundColor: '#8f3a08', padding: { x: 8, y: 5 },
      }).setOrigin(1, 0).setDepth(14).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        setMenuKind('classic');
        this.scene.start('Menu');
      });
    }

    this.toast = this.add.text(WIDTH / 2, HEADER_H + 40, '', {
      fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '24px', color: hex(INK), backgroundColor: '#fffdf5', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(13).setAlpha(0);
    this.input.keyboard!.on('keydown-M', () => sfx.toggleMute());
  }

  private setupInput() {
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => this.scrollTo(this.scrollX + dx + dy, false));
    let downX = 0, startScroll = 0, dragging = false, down = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < HEADER_H) return;
      down = true; dragging = false; downX = p.x; startScroll = this.scrollX;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!down) return;
      if (Math.abs(p.x - downX) > 8) dragging = true;
      if (dragging) this.scrollTo(startScroll - (p.x - downX), false);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!down) return;
      down = false;
      if (!dragging) this.clickMap(p.x + this.scrollX, p.y);
    });
  }

  private say(s: string) {
    this.toast.setText(s).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1300, duration: 500 });
  }

  private scrollTo(x: number, smooth: boolean) {
    const nx = Phaser.Math.Clamp(x, 0, WORLD_W - WIDTH);
    this.scrollX = smooth ? this.scrollX + (nx - this.scrollX) * 0.08 : nx;
    this.mapC.x = -this.scrollX;
  }

  private clickMap(wx: number, wy: number) {
    if (this.starting) return;
    // birds scatter
    for (const f of this.flocks) {
      if (!f.scatter && f.birds.some((b) => Math.hypot(f.x + b.dx - wx, f.y + b.dy - wy) < 40)) {
        this.scatter(f);
        return;
      }
    }
    // a house: lights on / off
    for (let i = 0; i <= this.unlocked; i++) {
      for (const h of this.fx[i].huts) {
        if (h.win && wx > h.x && wx < h.x + h.w && wy > h.y && wy < h.y + h.h) {
          h.win.on = !h.win.on;
          h.win.next = this.t + 20;
          sfx.click();
          return;
        }
      }
    }
    // a grove: a bunny jumps out
    const gr = this.groves.find((g) => Math.hypot(g.x - wx, (g.y - wy) * 1.4) < g.r + 10);
    if (gr) {
      const b = this.bunnies.find((q) => !q.active) ?? this.bunnies[0];
      this.hop(b, gr);
      return;
    }
    // a location
    let best = -1, bd = 1e9;
    NODES.forEach((n, i) => {
      const a = ART[i];
      const d = Math.min(Math.hypot(n.x - wx, n.y - wy), Math.hypot(a.x - wx, a.y - 50 - wy), Math.hypot(LABEL[i].x - wx, LABEL[i].y - wy));
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0 || bd > 110) return;
    if (best > this.unlocked) {
      sfx.denied();
      this.say('🔒 Finish the previous chapter to unlock');
      return;
    }
    this.go(best);
  }

  private step(d: number) {
    if (this.starting) return;
    const to = Phaser.Math.Clamp(this.heroTarget + d, 0, this.unlocked);
    if (to === this.heroTarget) return;
    sfx.click();
    this.heroTarget = to;
    this.startOnArrive = false;
    this.act = { kind: 'run', t: 0 };
  }

  /** Click on a location / Play: run there, then the game starts. */
  private go(i: number) {
    if (this.starting) return;
    this.heroTarget = i;
    if (i === this.heroPos && this.act.kind !== 'run') {
      this.start(i);
      return;
    }
    sfx.click();
    this.startOnArrive = true;
    this.act = { kind: 'run', t: 0 };
  }

  private start(i: number) {
    this.starting = true;
    sfx.click();
    this.say(`▶ ${CHAPTERS[i].title}: ${CHAPTERS[i].name}`);
    this.time.delayedCall(450, () => this.scene.start('Weapon', { chapter: i }));
  }

  private nodePoint(pos: number) {
    return this.spline.getPoint((pos + 1) / (N + 1));
  }

  // ---------------------------------------------------------------- animation

  update(_time: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.t += dt;
    this.dayT += dt;
    const t = this.t;
    const night = nightOf(this.dayT);
    const g = this.dyn;
    const L = this.lampG;
    g.clear();
    L.clear();
    const vx0 = this.scrollX - 160, vx1 = this.scrollX + WIDTH + 160;
    const vis = (x: number) => x > vx0 && x < vx1;

    // cloud shadows drifting over the land
    for (let k = 0; k < 6; k++) {
      const x = ((k * 620 + t * 9) % (WORLD_W + 400)) - 200, y = HEADER_H + 80 + ((k * 137) % 380);
      if (!vis(x)) continue;
      g.fillStyle(0x3a2a10, 0.028);
      g.fillEllipse(x, y, 260, 90);
      g.fillEllipse(x + 70, y - 20, 160, 70);
    }

    this.animWater(g, t, vis);
    this.animActors(g, t, dt, vis);
    for (let i = 0; i < N; i++) if (vis(ART[i].x)) this.animChapter(i, g, L, t, night);
    this.animSmoke(g, dt);
    this.animAnimals(g, L, t, dt, night, vis);
    this.updateHero(dt);
    this.animSky(g, t, dt);

    // fog sways a little
    this.fogG.x = Math.sin(t * 0.4) * 6;

    // night falls
    const ng = this.nightG;
    ng.clear();
    if (night > 0) {
      ng.fillStyle(0x0b1850, 0.45 * night);
      ng.fillRect(this.scrollX - 10, HEADER_H, WIDTH + 20, HEIGHT - HEADER_H);
      // stars over the sea and open land
      for (let k = 0; k < 40; k++) {
        const x = this.scrollX + ((k * 211) % WIDTH), y = HEADER_H + 20 + ((k * 97) % 470);
        L.fillStyle(0xffffff, night * (0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + k))));
        L.fillCircle(x, y, 1.2);
      }
    }
    this.animLights(L, t, dt, night, vis);
  }

  private animActors(g: G, t: number, dt: number, vis: (x: number) => boolean) {
    for (const a of this.actors) {
      const home = ART[a.ch].x;
      a.ph += dt * (a.zombie ? 4 : 6);
      if (a.fight > 0) a.fight -= dt;
      else if (a.smash > 0) {
        a.smash -= dt;
        if (a.hut && Math.random() < dt * 6) this.puffs.push({ x: a.hut.x + a.hut.w / 2 + (Math.random() - 0.5) * 16, y: a.hut.y + a.hut.h - 4, t: 0, life: 0.6, dx: (Math.random() - 0.5) * 30, color: 0xb8a888, grow: 5 });
      } else {
        const range = 80;
        a.x += a.dir * a.speed * dt;
        if (Math.abs(a.x - home) > range) {
          a.dir = Math.sign(home - a.x);
          a.x = home + Math.sign(a.x - home) * range;
        }
        if (a.zombie && Math.random() < dt * 0.06) {
          const huts = this.fx[a.ch].huts.filter((h) => h.broken);
          if (huts.length && Math.random() < 0.5) {
            // go and smash a hut
            a.hut = huts[0];
            a.x = a.hut.x - 6;
            a.dir = 1;
            a.smash = 2;
          } else {
            const other = this.actors.find((b) => b !== a && b.ch === a.ch && b.zombie && b.fight <= 0 && b.smash <= 0);
            if (other) {
              a.fight = other.fight = 1.6;
              other.x = a.x + 22 * (a.x < home ? 1 : -1);
              a.dir = Math.sign(other.x - a.x);
              other.dir = -a.dir;
            }
          }
        }
      }
      if (!vis(a.x)) continue;
      const y = ART[a.ch].y;
      const locked = a.ch > this.unlocked;
      let p: Pose;
      if (a.fight > 0 || a.smash > 0) {
        const s = Math.sin(a.ph * 3);
        p = pose({ lean: 0.25, fThigh: 0.3, bThigh: -0.3, fUpper: 1.5 + 0.7 * s, fFore: 1.6 + 0.6 * s, bUpper: 1.2 - 0.7 * s, bFore: 1.4 });
      } else {
        p = walkPose(a.ph, a.zombie);
        if (!a.zombie) p.lift = Math.max(0, Math.sin(a.ph * 0.5)) * 3;
      }
      drawFigure(g, a.x, y, a.dir, 0.22, p, a.zombie
        ? { kind: 'zombie', seed: a.seed, alpha: locked ? 0.35 : 1, variant: VARIANT[a.ch] }
        : { kind: 'player', weapon: null, seed: a.seed, time: t, headgear: (['hat', 'hood', 'none'] as const)[a.seed % 3] });
    }
  }

  private animSmoke(g: G, dt: number) {
    for (let i = 0; i < this.unlocked; i++) {
      for (const c of this.fx[i].chimneys) {
        if (Math.random() < dt * 1.4) this.puffs.push({ x: c.x, y: c.y, t: 0, life: 2.2 + Math.random(), dx: 16, color: 0x9a9a94, grow: 7 });
      }
    }
    const f = SPECIAL.fire;
    if (Math.random() < dt * 2.5) this.puffs.push({ x: f.x, y: f.y - 16, t: 0, life: 2.6, dx: 10, color: 0x8a8a84, grow: 8 });
    this.puffs = this.puffs.filter((p) => (p.t += dt) < p.life);
    for (const p of this.puffs) {
      const k = p.t / p.life;
      g.fillStyle(p.color, 0.45 * (1 - k));
      g.fillCircle(p.x + Math.sin(p.t * 2 + p.y) * 4 + k * p.dx, p.y - k * (p.grow * 6), 2.5 + k * p.grow);
    }
  }

  private animChapter(i: number, g: G, L: G, t: number, night: number) {
    const f = this.fx[i].spot;
    const s = ART_S;
    const passed = i < this.unlocked, locked = i > this.unlocked;
    const alpha = locked ? 0.45 : 1;
    const acc = ACCENTS[i];
    switch (CHAPTERS[i].bg) {
      case 'cliff': {
        const e = f.eagle;
        bird(g, e.x + Math.cos(t * 0.7) * 46, e.y + Math.sin(t * 0.7) * 12, 1.5, t * 5, INK, alpha);
        if (passed) flag(g, f.flag.x, f.flag.y, 16, acc.main, t, alpha);
        break;
      }
      case 'graveyard': {
        if (passed) {
          // a friendly ghost peeks out from behind a tombstone
          const u = (t % 7) / 7;
          const k = u < 0.15 ? u / 0.15 : u < 0.5 ? 1 : u < 0.65 ? 1 - (u - 0.5) / 0.15 : 0;
          if (k > 0) {
            const x = f.ghost.x + 6 + k * 10, y = f.ghost.y + 6 - k * 8;
            g.fillStyle(0xffffff, 0.9 * k);
            g.lineStyle(1.4, INK, 0.8 * k);
            g.fillRoundedRect(x - 7, y - 10, 14, 18, { tl: 7, tr: 7, bl: 2, br: 2 });
            g.strokeRoundedRect(x - 7, y - 10, 14, 18, { tl: 7, tr: 7, bl: 2, br: 2 });
            g.fillStyle(INK, k);
            g.fillCircle(x - 2.5, y - 4, 1.4);
            g.fillCircle(x + 2.5, y - 4, 1.4);
          }
        } else {
          // a zombie hand comes out of the ground
          const u = (t % 6) / 6;
          const k = u < 0.2 ? u / 0.2 : u < 0.5 ? 1 : u < 0.65 ? 1 - (u - 0.5) / 0.15 : 0;
          if (k > 0) {
            const x = f.hand.x, y = f.hand.y, h = 14 * k;
            g.lineStyle(2.2, INK, alpha);
            g.lineBetween(x, y, x, y - h);
            g.lineStyle(1.4, INK, alpha);
            for (const d of [-3, 0, 3]) g.lineBetween(x, y - h, x + d + Math.sin(t * 9 + d) * 1, y - h - 4);
            g.fillStyle(0x6b4a1a, 0.7);
            g.fillEllipse(x, y, 14, 4);
          }
        }
        break;
      }
      case 'castle': {
        flag(g, f.flagL.x, f.flagL.y, 16, acc.main, t, alpha);
        flag(g, f.flagR.x, f.flagR.y, 16, acc.main, t + 1, alpha);
        // the gate goes up and down
        const u = (t % 12) / 12;
        const open = u < 0.35 ? 0 : u < 0.43 ? (u - 0.35) / 0.08 : u < 0.85 ? 1 : 1 - (u - 0.85) / 0.08;
        const gx = f.gate.x, gy = f.gate.y, gh = 32 * s * (1 - Math.min(1, open));
        g.lineStyle(1.4, 0xdedbd0, alpha);
        for (let k = -3; k <= 3; k++) g.lineBetween(gx + k * 3.4, gy - 34 * s, gx + k * 3.4, gy - 34 * s + gh);
        for (let h = 6; h < gh; h += 6) g.lineBetween(gx - 11 * s, gy - 34 * s + h, gx + 11 * s, gy - 34 * s + h);
        if (passed) {
          // a guard walks along the wall
          const k = (Math.sin(t * 0.5) + 1) / 2;
          const x = f.wallL.x + (f.wallR.x - f.wallL.x) * k;
          drawFigure(g, x, f.wallL.y, Math.cos(t * 0.5) > 0 ? 1 : -1, 0.16, walkPose(t * 5, false), { kind: 'player', weapon: 'sword', seed: 3, headgear: 'hat', time: t });
        }
        break;
      }
      case 'stadium': {
        flag(g, f.flag.x, f.flag.y, 14, acc.main, t, alpha);
        // two players kick a ball across the field
        const per = 2.4, u = (t % (per * 2)) / per;
        const k = u < 1 ? u : 2 - u;
        const bx = f.ballA.x + (f.ballB.x - f.ballA.x) * k, by = f.ballA.y - Math.sin(Math.PI * (u % 1)) * 26;
        const kickA = u > 1.85 || u < 0.1, kickB = u > 0.85 && u < 1.1;
        for (const [x, dir, kick] of [[f.ballA.x - 8, 1, kickA], [f.ballB.x + 8, -1, kickB]] as const) {
          drawFigure(g, x, f.ballA.y + 2, dir, 0.2, kick ? P_KICK : walkPose(t * 3, !passed), passed
            ? { kind: 'player', weapon: null, seed: 5, time: t }
            : { kind: 'zombie', seed: 8, variant: 'football', alpha });
        }
        g.fillStyle(0xffffff, alpha);
        g.lineStyle(1.4, INK, alpha);
        g.fillCircle(bx, by, 3.6);
        g.strokeCircle(bx, by, 3.6);
        break;
      }
      case 'army': {
        flag(g, f.flag.x, f.flag.y, 15, acc.main, t, alpha);
        const k = (Math.sin(t * 0.35) + 1) / 2;
        const dir = Math.cos(t * 0.35) > 0 ? 1 : -1;
        jeep(g, f.jeepA.x + (f.jeepB.x - f.jeepA.x) * k, f.jeepA.y, dir, 0.9, t);
        // the searchlight sweeps
        const a = Math.PI / 2 + Math.sin(t * 0.6) * 0.9;
        const len = 150, w = 0.16;
        const o = f.light;
        L.fillStyle(0xfff2b0, (0.08 + 0.25 * night) * alpha);
        L.fillTriangle(o.x, o.y, o.x + Math.cos(a - w) * len, o.y + Math.sin(a - w) * len, o.x + Math.cos(a + w) * len, o.y + Math.sin(a + w) * len);
        L.fillStyle(0xfff2b0, 0.25 * night * alpha);
        L.fillEllipse(o.x + Math.cos(a) * len, o.y + Math.sin(a) * len, 46, 16);
        break;
      }
      case 'village': {
        windmill(g, f.mill.x, f.mill.y, s * 0.9, t * (passed ? 1.2 : 0.3), alpha);
        // laundry on the line
        const A = f.lineA, B = f.lineB;
        g.lineStyle(1.2, INK, alpha);
        g.beginPath(); g.moveTo(A.x, A.y);
        g.lineTo((A.x + B.x) / 2, (A.y + B.y) / 2 + 3); g.lineTo(B.x, B.y); g.strokePath();
        if (passed) {
          ([[0.25, 0xd12f86], [0.5, 0x2456c9], [0.75, 0xffffff]] as const).forEach(([k, c], j) => {
            const x = A.x + (B.x - A.x) * k, y = A.y + 2.4;
            const sw = Math.sin(t * 2.2 + j) * 2;
            g.fillStyle(c, 1);
            g.lineStyle(1, INK, 1);
            g.fillRect(x - 3 + sw * 0.3, y, 6, 8);
            g.strokeRect(x - 3 + sw * 0.3, y, 6, 8);
          });
        }
        // hens pecking
        for (let k = 0; k < 3; k++) {
          const x = f.hens.x + Math.sin(t * 0.4 + k * 2.1) * 26 + k * 10 - 10;
          const y = f.hens.y + (k % 2) * 4;
          const peck = Math.sin(t * 3 + k * 1.7) > 0.6;
          const dir = Math.cos(t * 0.4 + k * 2.1) > 0 ? 1 : -1;
          g.fillStyle(0xffffff, alpha);
          g.lineStyle(1.2, INK, alpha);
          g.fillEllipse(x, y - 3, 8, 6);
          g.strokeEllipse(x, y - 3, 8, 6);
          const hx = x + dir * 4, hy = y - (peck ? 2 : 7);
          g.fillCircle(hx, hy, 2.2);
          g.strokeCircle(hx, hy, 2.2);
          g.fillStyle(ACCENTS[0].main, alpha);
          g.fillCircle(hx, hy - 2.4, 1.2);
        }
        break;
      }
      case 'ship': {
        const pen = new Pen(g, rng(66));
        pen.alpha = alpha;
        pen.at(f.ship.x, f.ship.y + Math.sin(t * 1.5) * 2, s, Math.sin(t * 1.1) * 0.05);
        ship(pen, passed, t, i);
        for (let k = 0; k < 2; k++) bird(g, f.gulls.x + Math.cos(t * 0.9 + k * 3) * 60, f.gulls.y + Math.sin(t * 0.9 + k * 3) * 14 - k * 10, 1.1, t * 6 + k, INK_SOFT, alpha);
        break;
      }
      case 'mall': {
        const k = (Math.sin(t * 0.5) + 1) / 2;
        const x = f.cartA.x + (f.cartB.x - f.cartA.x) * k, y = f.cartA.y - 2;
        g.lineStyle(1.6, INK, alpha);
        g.strokeRect(x - 7, y - 10, 14, 7);
        g.lineBetween(x - 7, y - 10, x - 10, y - 13);
        g.strokeCircle(x - 4, y - 1.5, 1.8);
        g.strokeCircle(x + 4, y - 1.5, 1.8);
        break;
      }
      case 'burger': {
        if (Math.random() < 0.05) this.puffs.push({ x: f.steam.x + (Math.random() - 0.5) * 24, y: f.steam.y, t: 0, life: 1.4, dx: 6, color: 0xffffff, grow: 4 });
        break;
      }
      case 'airport': {
        // a plane takes off every 16 s
        const u = t % 16;
        const A = f.runA, B = f.runB;
        if (u < 7) {
          let x: number, y: number, tilt = 0;
          if (u < 4) {
            const k = (u / 4) ** 2;
            x = A.x + (B.x - A.x) * 0.7 * k;
            y = A.y - 4;
          } else {
            const k = (u - 4) / 3;
            x = A.x + (B.x - A.x) * (0.7 + k * 0.9);
            y = A.y - 4 - k * k * 110;
            tilt = -0.25 * Math.min(1, k * 3);
          }
          plane(g, x, y, 0.5, tilt);
        }
        // the beacon on the tower
        if (Math.sin(t * 4) > 0) {
          L.fillStyle(ACCENTS[0].main, alpha);
          L.fillCircle(f.beacon.x, f.beacon.y, 2.4);
          glow(L, f.beacon.x, f.beacon.y, 8, ACCENTS[0].main, 0.6 + night);
        }
        // runway lights chase each other
        const keys = Object.keys(f).filter((k2) => k2.startsWith('rl'));
        keys.forEach((k2, j) => {
          const on = Math.floor(t * 6) % keys.length === j;
          const p = f[k2];
          L.fillStyle(on ? LAMP : 0x8a8a84, alpha * (on ? 1 : 0.6));
          L.fillCircle(p.x, p.y, on ? 2.2 : 1.4);
          if (on) glow(L, p.x, p.y, 7, LAMP, 0.4 + night);
        });
        break;
      }
    }
  }

  private animLights(L: G, t: number, _dt: number, night: number, vis: (x: number) => boolean) {
    for (let i = 0; i <= Math.min(N - 1, this.unlocked); i++) {
      const f = this.fx[i];
      if (!vis(ART[i].x)) continue;
      const passed = i < this.unlocked;
      for (const w of f.windows) this.lamp(L, w, t, night, passed);
      for (const c of f.candles) {
        flame(L, c.x, c.y, 1, t);
        glow(L, c.x, c.y - 3, 9, LAMP, 0.15 + night * 0.8);
      }
      if (CHAPTERS[i].bg === 'stadium') {
        const on = night > 0.3 || Math.sin(t * 0.7) > 0.92;
        if (on) {
          for (const p of [f.spot.lampL, f.spot.lampR]) {
            L.fillStyle(0xffffff, 0.9);
            L.fillRect(p.x - 9, p.y - 4, 18, 8);
            L.fillStyle(0xfff2b0, 0.12 + 0.12 * night);
            L.fillTriangle(p.x - 8, p.y, p.x + 8, p.y, p.x - (p.x - ART[i].x) * 0.9, p.y + 90);
            glow(L, p.x, p.y, 14, 0xffffff, 0.5 + night);
          }
        }
      }
    }
    // neon signs blink
    this.neon.forEach((n, k) => n.setAlpha(Math.sin(t * 3 + k * 2) > -0.3 || Math.random() < 0.02 ? 1 : 0.25));
    // campfire
    const f = SPECIAL.fire;
    if (vis(f.x)) {
      flame(L, f.x - 4, f.y - 2, 2.2, t);
      flame(L, f.x + 4, f.y - 2, 1.8, t + 0.5);
      glow(L, f.x, f.y - 8, 22, 0xff9a1f, 0.12 + night);
    }
    // the chest sparkles now and then
    const c = SPECIAL.chest;
    if (vis(c.x) && Math.sin(t * 1.7) > 0.95) {
      L.lineStyle(1.6, 0xffe27a, 1);
      L.lineBetween(c.x + 18, c.y - 34, c.x + 18, c.y - 24);
      L.lineBetween(c.x + 13, c.y - 29, c.x + 23, c.y - 29);
    }
  }

  private lamp(L: G, w: Win, t: number, night: number, passed: boolean) {
    if (t > w.next) {
      const prob = passed ? 0.2 + 0.75 * night : 0.08 + 0.35 * night;
      w.on = Math.random() < prob;
      w.next = t + 3 + Math.random() * 9;
    }
    let on = w.on;
    if (w.broken && on) on = Math.sin(t * 23 + w.x) > 0.2 && Math.random() > 0.15; // a broken bulb flickers
    if (!on) return;
    L.fillStyle(LAMP, 0.6 + 0.4 * night);
    L.fillRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    glow(L, w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h), LAMP, 0.2 + 0.9 * night);
  }

  private animWater(g: G, t: number, vis: (x: number) => boolean) {
    // fish jump out of the sea
    const fi = this.fish;
    if (!fi.active) {
      fi.wait -= 1 / 60;
      if (fi.wait <= 0) {
        fi.active = true;
        fi.t = 0;
        fi.dir = Math.random() < 0.5 ? -1 : 1;
        for (let k = 0; k < 10; k++) {
          const x = SEA.x - 180 + Math.random() * 360, y = SEA.y - 60 + Math.random() * 130;
          if (ellipseHas(SEA, x, y, -40) && Math.abs(x - ART[SHIP_I].x) > 110) { fi.x = x; fi.y = y; break; }
        }
      }
    } else {
      fi.t += 1 / 60;
      const k = fi.t / 0.9;
      if (k >= 1) { fi.active = false; fi.wait = 2 + Math.random() * 4; }
      else if (vis(fi.x)) {
        const x = fi.x + fi.dir * k * 30, y = fi.y - Math.sin(Math.PI * k) * 26;
        const a = Math.atan2(-Math.cos(Math.PI * k) * 26 * Math.PI, fi.dir * 30) ;
        g.fillStyle(0x0e8f8f, 1);
        g.lineStyle(1.2, INK, 1);
        const c = Math.cos(a), s = Math.sin(a);
        const pts = [[-6, 0], [0, -3], [6, 0], [0, 3]].map(([lx, ly]) => new Phaser.Math.Vector2(x + lx * c - ly * s, y + lx * s + ly * c));
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
        g.fillTriangle(x - 6 * c, y - 6 * s, x - 10 * c - 3 * s, y - 10 * s + 3 * c, x - 10 * c + 3 * s, y - 10 * s - 3 * c);
        if (k < 0.15 || k > 0.85) {
          g.lineStyle(1.2, 0x0e8f8f, 0.7);
          g.strokeEllipse(k < 0.5 ? fi.x : fi.x + fi.dir * 30, fi.y, 14 + k * 6, 4);
        }
      }
    }
    // a whale comes up and blows
    const wx = SEA.x + 140, wy = SEA.y + 50;
    if (vis(wx)) {
      const u = t % 11;
      if (u < 4) {
        const k = u < 0.6 ? u / 0.6 : u > 3.4 ? (4 - u) / 0.6 : 1;
        g.fillStyle(0x3d5a6b, 1);
        g.lineStyle(1.6, INK, 1);
        g.beginPath();
        g.arc(wx, wy, 20, Math.PI, 0);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.fillStyle(MAP_PAPER, 0);
        g.lineStyle(1.4, ACCENTS[6].main, 0.7);
        g.lineBetween(wx - 26, wy, wx + 26, wy);
        if (k > 0.9 && u > 1 && u < 3) {
          g.lineStyle(1.8, 0x0e8f8f, 0.9);
          const h = 10 + Math.sin((u - 1) * 6) * 3;
          for (const d of [-6, 0, 6]) g.lineBetween(wx - 4, wy - 18, wx - 4 + d, wy - 18 - h);
        }
      }
    }
    // a sailing boat crosses the sea
    const bxk = (Math.sin(t * 0.12) + 1) / 2;
    const bx = SEA.x - 170 + bxk * 120, by = SEA.y + 62 + Math.sin(t * 1.6) * 1.5;
    if (vis(bx)) {
      const dir = Math.cos(t * 0.12) > 0 ? 1 : -1;
      g.fillStyle(0xead6c2, 1);
      g.lineStyle(1.6, INK, 1);
      g.fillPoints([new Phaser.Math.Vector2(bx - 14, by - 5), new Phaser.Math.Vector2(bx + 14, by - 5), new Phaser.Math.Vector2(bx + 9, by + 1), new Phaser.Math.Vector2(bx - 9, by + 1)], true);
      g.strokePoints([new Phaser.Math.Vector2(bx - 14, by - 5), new Phaser.Math.Vector2(bx + 14, by - 5), new Phaser.Math.Vector2(bx + 9, by + 1), new Phaser.Math.Vector2(bx - 9, by + 1)], true);
      g.lineBetween(bx, by - 5, bx, by - 28);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(bx + dir * 1, by - 27, bx + dir * 1, by - 8, bx + dir * 15, by - 8);
      g.strokeTriangle(bx + dir * 1, by - 27, bx + dir * 1, by - 8, bx + dir * 15, by - 8);
    }
    // ducks on the lake
    if (vis(LAKE.x)) {
      for (let k = 0; k < 3; k++) {
        const a = t * 0.25 + k * 2.1;
        const x = LAKE.x + Math.cos(a) * (LAKE.rx - 30 - k * 8), y = LAKE.y + Math.sin(a) * (LAKE.ry - 14);
        duck(g, x, y, -Math.sin(a) >= 0 ? 1 : -1, t + k);
      }
    }
  }

  private hop(b: Bunny, from: Grove) {
    const others = this.groves.filter((g) => g !== from && Math.hypot(g.x - from.x, g.y - from.y) < 380);
    const to = others.length ? others[Math.floor(Math.random() * others.length)] : from;
    b.from = { x: from.x, y: from.y + 10 };
    b.to = { x: to.x, y: to.y + 10 };
    b.t = 0;
    b.dur = Math.max(1.2, Math.hypot(to.x - from.x, to.y - from.y) / 70);
    b.active = true;
  }

  private animAnimals(g: G, L: G, t: number, dt: number, night: number, vis: (x: number) => boolean) {
    // bunnies hop from grove to grove
    for (const b of this.bunnies) {
      if (!b.active) {
        b.wait -= dt;
        if (b.wait <= 0) {
          const near = this.groves.filter((gr) => vis(gr.x));
          const pool = near.length ? near : this.groves;
          this.hop(b, pool[Math.floor(Math.random() * pool.length)]);
        }
        continue;
      }
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      const hops = Math.max(3, Math.round(b.dur * 2.4));
      const hk = (k * hops) % 1;
      b.x = b.from.x + (b.to.x - b.from.x) * k;
      b.y = b.from.y + (b.to.y - b.from.y) * k - Math.sin(Math.PI * hk) * 9;
      if (k >= 1) {
        b.active = false;
        b.wait = 5 + Math.random() * 8;
      }
      // hidden while still inside a grove
      const inside = k < 0.12 || k > 0.88;
      if (!inside && vis(b.x)) bunny(g, b.x, b.y, b.to.x >= b.from.x ? 1 : -1, 1);
    }
    // a squirrel peeks from behind a tree
    const sq = this.squirrel;
    if (!sq.tree) {
      sq.wait -= dt;
      if (sq.wait <= 0) {
        const near = this.groves.filter((gr) => vis(gr.x) && gr.x > this.scrollX + 60 && gr.x < this.scrollX + WIDTH - 60);
        if (near.length) {
          const gr = near[Math.floor(Math.random() * near.length)];
          sq.tree = gr.trees[gr.trees.length - 1];
          sq.t = 0;
          sq.dir = Math.random() < 0.5 ? -1 : 1;
        } else sq.wait = 1;
      }
    } else {
      sq.t += dt;
      const up = sq.t < 0.4 ? sq.t / 0.4 : sq.t < 2.6 ? 1 : 1 - (sq.t - 2.6) / 0.4;
      if (up <= 0 && sq.t > 1) {
        sq.tree = null;
        sq.wait = 3 + Math.random() * 6;
      } else {
        const tr = sq.tree;
        squirrel(g, tr.x + sq.dir * 9 * tr.s, tr.y - 2, sq.dir, 0.9, Math.max(0, up));
      }
    }
    // a fox runs across now and then
    const fo = this.foxRun;
    if (!fo.active) {
      fo.wait -= dt;
      if (fo.wait <= 0) {
        const near = this.groves.filter((gr) => vis(gr.x));
        if (near.length >= 2) {
          const a = near[Math.floor(Math.random() * near.length)];
          const others = near.filter((q) => q !== a && Math.hypot(q.x - a.x, q.y - a.y) > 150);
          if (others.length) {
            const b = others[Math.floor(Math.random() * others.length)];
            Object.assign(fo, { active: true, from: { x: a.x, y: a.y + 12 }, to: { x: b.x, y: b.y + 12 }, t: 0, dur: Math.hypot(b.x - a.x, b.y - a.y) / 110 });
          }
        }
        if (!fo.active) fo.wait = 3;
      }
    } else {
      fo.t += dt;
      const k = fo.t / fo.dur;
      if (k >= 1) {
        fo.active = false;
        fo.wait = 12 + Math.random() * 12;
      } else if (k > 0.08 && k < 0.92) {
        fox(g, fo.from.x + (fo.to.x - fo.from.x) * k, fo.from.y + (fo.to.y - fo.from.y) * k, fo.to.x >= fo.from.x ? 1 : -1, fo.t * 16, 1);
      }
    }
    // owls' eyes at night
    if (night > 0.4) {
      this.owls.forEach((tr, k) => {
        if (!vis(tr.x)) return;
        const blink = Math.sin(t * 0.9 + k * 2) > 0.95;
        if (blink) return;
        const x = tr.x, y = tr.y - 16 * tr.s;
        L.fillStyle(0xffe27a, night);
        L.fillCircle(x - 2.5, y, 1.8);
        L.fillCircle(x + 2.5, y, 1.8);
        L.fillStyle(INK, night);
        L.fillCircle(x - 2.5, y, 0.7);
        L.fillCircle(x + 2.5, y, 0.7);
      });
    }
    // the windmill on the hill
    const m = SPECIAL.mill;
    if (vis(m.x)) windmill(g, m.x, m.y - 64 * 0.8, 0.85, t * 0.9);
  }

  private scatter(f: Flock) {
    f.scatter = true;
    sfx.click();
    for (const b of f.birds) {
      const a = Math.random() * TAU;
      b.vx = Math.cos(a) * (140 + Math.random() * 120);
      b.vy = Math.sin(a) * 80 - 90;
    }
  }

  private animSky(g: G, t: number, dt: number) {
    // flocks of birds with their shadows on the ground
    this.flockT -= dt;
    if (this.flockT <= 0 && this.flocks.length < 2) {
      this.flockT = 9 + Math.random() * 8;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const n = 4 + Math.floor(Math.random() * 3);
      this.flocks.push({
        x: dir > 0 ? this.scrollX - 60 : this.scrollX + WIDTH + 60,
        y: HEADER_H + 50 + Math.random() * 200,
        vx: dir * (55 + Math.random() * 25),
        birds: Array.from({ length: n }, (_v, k) => ({ dx: -dir * Math.abs(k - (n - 1) / 2) * 0 - dir * k * 12, dy: (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 9, ph: Math.random() * 6, vx: 0, vy: 0 })),
        scatter: false,
      });
    }
    for (const f of this.flocks) {
      if (!f.scatter) f.x += f.vx * dt;
      for (const b of f.birds) {
        b.ph += dt * (f.scatter ? 22 : 9);
        if (f.scatter) {
          b.dx += b.vx * dt;
          b.dy += b.vy * dt;
        }
        const x = f.x + b.dx, y = f.y + b.dy;
        g.fillStyle(0x3a2a10, 0.1);
        g.fillEllipse(x + 26, y + 80, 9, 3);
        bird(g, x, y, 1, b.ph);
      }
    }
    this.flocks = this.flocks.filter((f) => {
      const x = f.x + (f.birds[0]?.dx ?? 0);
      if (f.scatter) return f.birds.some((b) => f.y + b.dy > HEADER_H - 40 && Math.abs(f.x + b.dx - this.scrollX - WIDTH / 2) < WIDTH);
      return x > this.scrollX - 400 && x < this.scrollX + WIDTH + 400;
    });
    // a hot-air balloon drifts over the whole map
    const bx = ((t * 14 + 300) % (WORLD_W + 300)) - 150, by = HEADER_H + 80 + Math.sin(t * 0.3) * 14;
    if (bx > this.scrollX - 100 && bx < this.scrollX + WIDTH + 100) {
      g.fillStyle(0x3a2a10, 0.08);
      g.fillEllipse(bx + 40, by + 190, 30, 10);
      balloon(g, bx, by);
    }
  }

  private updateHero(dt: number) {
    const act = this.act;
    act.t += dt;
    let p = P_IDLE;
    let lift = 0;
    if (act.kind === 'run') {
      const d = this.heroTarget - this.heroPos;
      if (Math.abs(d) < 0.02) {
        this.heroPos = this.heroTarget;
        this.act = { kind: 'idle', t: 0 };
        this.nextAct = 2;
        if (this.startOnArrive) this.start(this.heroPos);
      } else {
        const speed = Math.max(1.6, Math.abs(this.heroTarget - Math.round(this.heroPos)) / 1.1);
        this.heroPos += Math.sign(d) * Math.min(Math.abs(d), dt * speed);
        p = walkPose(act.t * 18, false, true);
        const a = this.nodePoint(this.heroPos - 0.01), b = this.nodePoint(this.heroPos + 0.01);
        this.heroFacing = Math.sign(d) * Math.sign(b.x - a.x || 1);
      }
      this.scrollTo(this.nodePoint(this.heroPos).x - WIDTH / 2, true);
    } else if (act.kind === 'idle') {
      if (act.t > this.nextAct && !this.starting) {
        const r = Math.random();
        this.act = { kind: r < 0.45 ? 'swing' : r < 0.75 ? 'jump' : 'flip', t: 0 };
        this.nextAct = 1.8 + Math.random() * 2.5;
        if (Math.random() < 0.3) this.heroFacing *= -1;
      }
    } else if (act.kind === 'swing') {
      p = act.t < 0.18 ? lerpPose(P_IDLE, HIGH_A, act.t / 0.18) : act.t < 0.36 ? lerpPose(HIGH_A, HIGH_B, (act.t - 0.18) / 0.18) : lerpPose(HIGH_B, P_IDLE, (act.t - 0.36) / 0.19);
      if (act.t > 0.55) this.act = { kind: 'idle', t: 0 };
    } else {
      const T = act.kind === 'flip' ? 0.75 : 0.55;
      const k = act.t / T;
      lift = Math.sin(Math.PI * Math.min(1, k)) * (act.kind === 'flip' ? 50 : 32);
      p = act.kind === 'flip' ? pose({ ...lerpPose(P_JUMP, P_TUCK, Math.min(1, k * 3)), rot: Math.min(1, k) * TAU }) : P_JUMP;
      if (k >= 1) this.act = { kind: 'idle', t: 0 };
    }
    const pt = this.nodePoint(this.heroPos);
    const prof = storage.getProfile();
    if (this.mapFocused && act.kind !== 'run') {
      this.dyn.lineStyle(2.4, TITLE_BROWN, 0.5 + 0.4 * Math.sin(this.t * 5));
      this.dyn.strokeEllipse(pt.x, pt.y, 54, 20);
    }
    drawFigure(this.dyn, pt.x, pt.y - lift - 2, this.heroFacing, 0.34, p, { kind: 'player', weapon: 'sword', headgear: prof.headgear, time: this.t });
    this.dyn.fillStyle(0xf08a1c, 1);
    const ty = pt.y - 112;
    this.dyn.fillTriangle(pt.x - 7, ty - 8, pt.x + 7, ty - 8, pt.x, ty);
  }
}
