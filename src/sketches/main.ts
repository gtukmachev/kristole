/**
 * v7 world-map menu: rough sketches for choosing an idea (dev only, not in the build).
 * Open http://localhost:5173/sketches.html — keys 1 / 2 / 3 switch the variant.
 */
import Phaser from 'phaser';
import {
  ACCENTS, FONT_HAND, FONT_SLAB, HEIGHT, INK, INK_FAINT, INK_SOFT, MENU_ORANGE, PAPER, WIDTH, hex,
} from '../game/constants';
import { CHAPTERS } from '../game/data';
import { drawLogo } from '../scenes/MenuScene';
import { drawFigure, lerpPose, pose, type Pose } from '../game/figure';
import { penLine, rng, type G } from '../game/background';

const TAU = Math.PI * 2;
const HEADER_H = 172;
const N = CHAPTERS.length;
const params = new URLSearchParams(location.search);
/** Demo progress: chapters 0..OPEN are open, 0..OPEN-1 are passed. */
const OPEN = Math.max(0, Math.min(N - 1, Number(params.get('open') ?? 3)));

// ---------- poses ----------
const P_IDLE = pose({ lean: 0.06, fThigh: 0.16, fShin: 0.04, bThigh: -0.18, bShin: -0.06, fUpper: 0.55, fFore: 1.45, bUpper: -0.25, bFore: 0.35, weapon: 2.55 });
const HIGH_A = pose({ lean: 0.18, fThigh: 0.4, fShin: 0.1, bThigh: -0.35, bShin: -0.15, fUpper: 0.2, fFore: 0.35, bUpper: -0.5, bFore: -0.2, weapon: 0.55 });
const HIGH_B = pose({ lean: -0.12, fThigh: 0.35, fShin: 0.05, bThigh: -0.3, bShin: -0.1, fUpper: 2.6, fFore: 2.85, bUpper: -0.9, bFore: -0.6, weapon: 3.0 });
const P_JUMP = pose({ lean: 0.12, fThigh: 1.0, fShin: -0.15, bThigh: 0.25, bShin: -0.7, fUpper: 1.0, fFore: 2.0, bUpper: -0.9, bFore: -0.4, weapon: 2.8, lift: 6 });
const P_TUCK = pose({ lean: 0.5, fThigh: 1.9, fShin: -0.6, bThigh: 1.7, bShin: -0.8, fUpper: 1.4, fFore: 2.0, bUpper: 0.9, bFore: 1.4, weapon: 2.2 });

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

// ---------- a little "pen" with local coordinates: x right, h up from the ground ----------
class Pen {
  ox = 0;
  oy = 0;
  s = 1;
  ink = INK;
  alpha = 1;
  constructor(public g: G, public rand: () => number) {}
  at(x: number, y: number, s: number) {
    this.ox = x;
    this.oy = y;
    this.s = s;
    return this;
  }
  X(x: number) { return this.ox + x * this.s; }
  Y(h: number) { return this.oy - h * this.s; }
  w(w: number) { return w * Math.max(0.55, this.s); }
  line(x1: number, h1: number, x2: number, h2: number, w = 2.4, color = this.ink) {
    penLine(this.g, this.X(x1), this.Y(h1), this.X(x2), this.Y(h2), this.w(w), color, this.rand, this.alpha);
  }
  poly(pts: [number, number][], w = 2.4, fill?: number, fillA = 1) {
    const v = pts.map(([x, h]) => new Phaser.Math.Vector2(this.X(x), this.Y(h)));
    if (fill !== undefined) {
      this.g.fillStyle(fill, fillA * this.alpha);
      this.g.fillPoints(v, true);
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], w);
    }
  }
  open(pts: [number, number][], w = 2.4, color = this.ink) {
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, color);
  }
  rect(x: number, h: number, w: number, hh: number, lw = 2.4, fill?: number) {
    this.poly([[x, h], [x + w, h], [x + w, h + hh], [x, h + hh]], lw, fill);
  }
  circle(x: number, h: number, r: number, lw = 2.2, fill?: number, color = this.ink) {
    if (fill !== undefined) {
      this.g.fillStyle(fill, this.alpha);
      this.g.fillCircle(this.X(x), this.Y(h), r * this.s);
    }
    this.g.lineStyle(this.w(lw), color, this.alpha);
    this.g.strokeCircle(this.X(x), this.Y(h), r * this.s);
  }
  /** Simple parallel hatching inside an axis-aligned box. */
  hatchBox(x: number, h: number, w: number, hh: number, step = 9, color = INK_SOFT, a = 0.35) {
    this.g.lineStyle(this.w(1.2), color, a * this.alpha);
    for (let c = 0; c < w + hh; c += step) {
      const x1 = Math.max(0, c - hh), x2 = Math.min(w, c);
      const h1 = Math.min(hh, c), h2 = c - x2;
      this.g.lineBetween(this.X(x + x1), this.Y(h + h1), this.X(x + x2), this.Y(h + h2));
    }
  }
}

// ---------- landmarks: each ~180 wide, ~140 high at s = 1; returns chimney points ----------
type Chimney = { x: number; y: number };

function hut(p: Pen, x: number, broken: boolean, chimneys: Chimney[]) {
  if (!broken) {
    p.rect(x - 16, 0, 32, 22, 2, PAPER);
    p.poly([[x - 21, 22], [x, 40], [x + 21, 22]], 2, PAPER);
    p.rect(x + 7, 28, 6, 12, 1.8, PAPER);
    p.rect(x - 5, 0, 10, 13, 1.6);
    chimneys.push({ x: p.X(x + 10), y: p.Y(42) });
  } else {
    p.open([[x - 16, 0], [x - 16, 22], [x - 4, 22]], 2);
    p.open([[x + 16, 0], [x + 16, 12]], 2);
    p.poly([[x - 24, 18], [x - 2, 36], [x + 14, 10]], 2, PAPER); // roof slid down
    p.line(x - 6, 0, x + 22, 8, 2.2); // plank
    p.line(x + 8, 0, x + 24, 3, 1.6);
  }
}

function landmark(p: Pen, ch: number, passed: boolean, labels: (x: number, y: number, s: string, size: number) => void): Chimney[] {
  const acc = ACCENTS[ch];
  const chim: Chimney[] = [];

  switch (CHAPTERS[ch].bg) {
    case 'cliff': {
      const rock: [number, number][] = [[-95, 0], [-80, 50], [-62, 62], [-45, 112], [-10, 128], [18, 108], [44, 116], [70, 58], [92, 0]];
      p.poly(rock, 2.6, PAPER);
      p.hatchBox(-60, 10, 110, 70, 10);
      p.line(-10, 128, -6, 160, 2.4); // dead tree
      p.line(-7, 150, -24, 168, 1.8);
      p.line(-6, 146, 10, 164, 1.8);
      p.line(-45, 112, -30, 92, 2, acc.main);
      p.line(44, 116, 60, 80, 2, acc.main);
      break;
    }
    case 'graveyard': {
      p.line(-95, 18, 95, 18, 1.8);
      for (let x = -90; x <= 90; x += 14) p.line(x, 0, x, 28, 1.6);
      p.rect(-66, 0, 26, 40, 2.4, PAPER);
      p.circle(-53, 40, 13, 2.4, PAPER);
      p.line(-60, 36, -46, 36, 1.4);
      p.line(0, 0, 0, 66, 3); p.line(-15, 48, 15, 48, 3);
      p.rect(32, 0, 24, 34, 2.4, PAPER);
      p.circle(44, 34, 12, 2.4, PAPER);
      p.line(78, 0, 80, 92, 2.6);
      p.line(79, 66, 60, 88, 1.8); p.line(80, 76, 96, 98, 1.8);
      p.circle(-78, 120, 14, 2, acc.soft, acc.main);
      break;
    }
    case 'castle': {
      p.rect(-62, 0, 124, 62, 2.6, PAPER);
      for (let x = -62; x < 62; x += 18) p.rect(x, 62, 10, 10, 2, PAPER);
      p.rect(-94, 0, 32, 100, 2.6, PAPER); p.poly([[-100, 100], [-78, 140], [-56, 100]], 2.4, acc.soft);
      p.rect(62, 0, 32, 100, 2.6, PAPER); p.poly([[56, 100], [78, 140], [100, 100]], 2.4, acc.soft);
      p.poly([[-16, 0], [-16, 30], [0, 42], [16, 30], [16, 0]], 2.4, INK, 0.85);
      p.line(-78, 140, -78, 166, 2); p.poly([[-78, 166], [-54, 159], [-78, 152]], 1.8, acc.main);
      p.line(78, 140, 78, 166, 2); p.poly([[78, 166], [102, 159], [78, 152]], 1.8, acc.main);
      p.rect(-86, 60, 8, 14, 1.6); p.rect(72, 60, 8, 14, 1.6);
      break;
    }
    case 'stadium': {
      p.poly([[-98, 0], [-84, 60], [84, 60], [98, 0]], 2.6, PAPER);
      for (let h = 14; h < 60; h += 14) p.line(-98 + h * 0.23, h, 98 - h * 0.23, h, 1.4, INK_SOFT);
      for (let x = -70; x <= 70; x += 20) p.line(x, 60, x * 1.08, 0, 1.2, INK_SOFT);
      for (const x of [-90, 90]) {
        p.line(x, 60, x, 132, 2.4);
        p.rect(x - 14, 132, 28, 14, 2, acc.soft);
      }
      p.line(0, 60, 0, 96, 2); p.poly([[0, 96], [24, 89], [0, 82]], 1.8, acc.main);
      p.circle(-40, 74, 7, 2, PAPER); // ball
      break;
    }
    case 'army': {
      p.poly([[-96, 0], [-62, 52], [-28, 0]], 2.6, acc.soft);
      p.line(-62, 0, -62, 52, 1.6);
      p.open([[8, 0], [18, 92], [48, 92], [58, 0]], 2.4);
      p.line(10, 30, 56, 60, 1.4); p.line(56, 30, 10, 60, 1.4);
      p.rect(4, 92, 58, 16, 2.4, PAPER);
      p.poly([[0, 108], [33, 128], [66, 108]], 2.2, acc.soft);
      p.line(33, 128, 33, 152, 2); p.poly([[33, 152], [54, 146], [33, 140]], 1.8, acc.main);
      const wire: [number, number][] = [];
      for (let x = -96; x <= 96; x += 8) wire.push([x, 8 + ((x / 8) % 2 ? 6 : 0)]);
      p.open(wire, 1.3, INK_SOFT);
      for (const x of [70, 84, 77]) p.circle(x, x === 77 ? 18 : 6, 7, 1.8, PAPER);
      break;
    }
    case 'village': {
      for (const [x, w] of [[-58, 52], [34, 58]] as const) {
        p.rect(x - w / 2, 0, w, 40, 2.4, PAPER);
        p.poly([[x - w / 2 - 8, 40], [x, 74], [x + w / 2 + 8, 40]], 2.4, acc.soft);
        p.rect(x + w / 4 - 4, 52, 9, 20, 2, PAPER);
        chim.push({ x: p.X(x + w / 4), y: p.Y(74) });
        p.rect(x - 7, 0, 14, 22, 1.8);
        p.rect(x - w / 2 + 6, 22, 9, 9, 1.4);
      }
      p.poly([[78, 0], [84, 32], [100, 32], [104, 0]], 2, acc.soft); // haystack
      p.line(-96, 12, 96, 12, 1.4, INK_SOFT);
      if (!passed) {
        // broken: a hole and a fallen fence
        p.line(-50, 18, -40, 34, 2); p.line(-40, 18, -50, 34, 2);
        p.line(60, 0, 90, 14, 2);
        chim.length = 0;
      }
      break;
    }
    case 'ship': {
      const wave: [number, number][] = [];
      for (let x = -110; x <= 110; x += 10) wave.push([x, Math.sin(x / 9) * 3 - 2]);
      p.open(wave, 1.8, acc.main);
      p.poly([[-96, 34], [96, 34], [74, 2], [-78, 2]], 2.6, PAPER);
      p.hatchBox(-70, 6, 140, 22, 10);
      for (let x = -50; x <= 50; x += 25) p.circle(x, 20, 4, 1.6, INK);
      p.line(0, 34, 0, 160, 3);
      p.poly([[4, 150], [60, 140], [56, 60], [4, 52]], 2.2, acc.soft);
      p.poly([[-4, 140], [-50, 120], [-46, 64], [-4, 56]], 2.2, acc.soft);
      p.rect(0, 160, 26, 16, 1.6, INK);
      p.circle(12, 168, 3.5, 1, PAPER, PAPER);
      break;
    }
    case 'mall': {
      p.rect(-96, 0, 192, 82, 2.6, PAPER);
      for (let x = -80; x <= 80; x += 22) p.line(x, 8, x, 70, 1.2, INK_SOFT);
      p.line(-90, 40, 90, 40, 1.2, INK_SOFT);
      p.rect(-46, 82, 92, 24, 2.4, acc.soft);
      labels(p.X(0), p.Y(94), 'MALL', 15 * p.s);
      p.rect(-18, 0, 36, 32, 2.4, PAPER); p.line(0, 0, 0, 32, 1.6);
      // shopping cart
      p.open([[56, 30], [62, 30], [68, 12], [88, 12], [92, 24], [64, 24]], 1.8);
      p.circle(70, 6, 3.5, 1.4); p.circle(86, 6, 3.5, 1.4);
      break;
    }
    case 'burger': {
      p.rect(-74, 0, 148, 56, 2.6, PAPER);
      for (let x = -74; x < 74; x += 18.5) p.rect(x, 56, 18.5, 8, 1.2, (x / 18.5) % 2 ? PAPER : acc.soft);
      p.rect(-56, 12, 40, 26, 2, PAPER); p.rect(18, 0, 26, 40, 2, PAPER);
      // giant burger on the roof
      p.poly([[-44, 70], [44, 70], [40, 80], [-40, 80]], 2.2, acc.soft);
      p.poly([[-46, 80], [46, 80], [46, 90], [-46, 90]], 2.2, INK_SOFT, 0.8);
      const lettuce: [number, number][] = [];
      for (let x = -48; x <= 48; x += 8) lettuce.push([x, 92 + ((x / 8) % 2 ? 4 : 0)]);
      p.open(lettuce, 2, acc.main);
      p.poly([[-44, 96], [-30, 120], [0, 128], [30, 120], [44, 96]], 2.4, acc.soft);
      labels(p.X(0), p.Y(28) , '', 1);
      break;
    }
    case 'airport': {
      p.rect(-78, 0, 18, 106, 2.4, PAPER);
      p.poly([[-90, 106], [-48, 106], [-54, 128], [-84, 128]], 2.4, acc.soft);
      p.line(-69, 128, -69, 142, 1.8);
      p.rect(-40, 0, 116, 42, 2.4, PAPER);
      for (let x = -30; x < 70; x += 16) p.rect(x, 16, 10, 14, 1.4);
      for (let x = -100; x < 110; x += 28) p.line(x, -6, x + 14, -6, 2, INK_SOFT);
      // plane taking off
      p.poly([[20, 96], [92, 116], [100, 124], [90, 126], [20, 104]], 2.2, PAPER);
      p.poly([[50, 106], [40, 84], [50, 84], [70, 110]], 1.8, acc.soft);
      p.poly([[24, 99], [16, 116], [24, 116], [32, 102]], 1.8, acc.soft);
      break;
    }
  }
  return chim;
}

// ---------- variants ----------
interface Layout {
  name: string;
  about: string;
  worldW: number;
  /** Path node = where the hero stands for chapter i. */
  nodes: { x: number; y: number }[];
  /** Ground anchor and scale for the landmark of chapter i. */
  art: { x: number; y: number; s: number }[];
  /** Where little people / zombies walk around chapter i. */
  actorY: (i: number, x: number) => number;
  actorRange: number;
  figScale: number;
  heroScale: number;
  titleColor: number;
  labelFont: string;
  background: (g: G, pen: Pen, L: Layout, rand: () => number) => void;
  pathStyle: 'ground' | 'trail' | 'road';
  labelAt: (i: number) => { x: number; y: number };
}

const STEP = 300;
const worldW = 200 + STEP * (N - 1) + 200;
const xs = Array.from({ length: N }, (_, i) => 200 + i * STEP);

const groundY = (x: number) => 560 + Math.sin(x / 210) * 14 + Math.sin(x / 77) * 4;

const LAYOUTS: Layout[] = [
  {
    name: '1 · Панорама',
    about: 'Вид сбоку, как в самой игре: все локации стоят на одной земле, тропинка идёт вдоль неё. Прокрутка влево-вправо.',
    worldW,
    nodes: xs.map((x) => ({ x: x - 100, y: groundY(x - 100) + 58 })),
    art: xs.map((x) => ({ x: x + 10, y: groundY(x) + 4, s: 1 })),
    actorY: (_i, x) => groundY(x) + 4,
    actorRange: 125,
    figScale: 0.3,
    heroScale: 0.48,
    titleColor: INK,
    labelFont: FONT_SLAB,
    pathStyle: 'ground',
    labelAt: (i) => ({ x: xs[i] + 10, y: groundY(xs[i]) + 104 }),
    background(g, pen, L, rand) {
      // distant hills
      pen.at(0, 0, 1);
      g.lineStyle(2, INK_FAINT, 1);
      g.beginPath();
      for (let x = 0; x <= L.worldW; x += 20) {
        const y = 430 + Math.sin(x / 260) * 34 + Math.sin(x / 90) * 8;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokePath();
      // clouds and birds
      for (let x = 120; x < L.worldW; x += 340 + rand() * 200) {
        const y = 230 + rand() * 90;
        g.lineStyle(2, INK_FAINT, 1);
        for (let k = 0; k < 4; k++) g.beginPath(), g.arc(x + k * 22, y - (k % 2) * 6, 16, Math.PI, 0), g.strokePath();
        g.lineBetween(x - 16, y, x + 82, y);
      }
      for (let i = 0; i < 14; i++) {
        const bx = rand() * L.worldW, by = 210 + rand() * 120;
        g.lineStyle(1.6, INK_SOFT, 0.8);
        g.lineBetween(bx - 7, by - 4, bx, by);
        g.lineBetween(bx, by, bx + 7, by - 4);
      }
      // ground + soil hatching; water under the ship
      const shipX = xs[CHAPTERS.findIndex((c) => c.bg === 'ship')];
      const pts: Phaser.Math.Vector2[] = [];
      for (let x = 0; x <= L.worldW; x += 12) pts.push(new Phaser.Math.Vector2(x, Math.abs(x - shipX - 10) < 150 ? groundY(shipX) + 4 : groundY(x)));
      g.fillStyle(0xe6e4dc, 1);
      g.fillPoints([...pts, new Phaser.Math.Vector2(L.worldW, HEIGHT), new Phaser.Math.Vector2(0, HEIGHT)], true);
      for (let i = 0; i + 1 < pts.length; i++) penLine(g, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 3, INK, rand);
      for (let x = 0; x < L.worldW; x += 14) {
        if (Math.abs(x - shipX - 10) < 150) continue;
        const y = groundY(x) + 20 + rand() * 80;
        g.lineStyle(1.2, INK_SOFT, 0.35);
        g.lineBetween(x, y, x + 10, y + 10);
      }
      const acc = ACCENTS[6];
      for (let y = groundY(shipX) + 18; y < HEIGHT; y += 16) {
        for (let x = shipX - 140; x < shipX + 160; x += 30) {
          g.lineStyle(1.6, acc.main, 0.5);
          g.beginPath(); g.arc(x + ((y / 16) % 2) * 15, y, 8, Math.PI, 0); g.strokePath();
        }
      }
      // grass tufts
      for (let x = 10; x < L.worldW; x += 22 + rand() * 30) {
        if (Math.abs(x - shipX - 10) < 160) continue;
        const y = groundY(x);
        g.lineStyle(1.4, INK_SOFT, 0.8);
        g.lineBetween(x, y, x - 3, y - 7); g.lineBetween(x, y, x + 1, y - 9); g.lineBetween(x, y, x + 5, y - 6);
      }
    },
  },
  {
    name: '2 · Карта сверху',
    about: 'Старая карта сокровищ: вид сверху, извилистая дорожка, горы, лес, море. Локации — маленькие картинки на карте.',
    worldW,
    nodes: xs.map((x, i) => ({ x, y: 470 + Math.sin(i * 1.35 + 0.4) * 120 })),
    art: xs.map((x, i) => ({ x: x + 4, y: 470 + Math.sin(i * 1.35 + 0.4) * 120 - 26, s: 0.62 })),
    actorY: (i) => 470 + Math.sin(i * 1.35 + 0.4) * 120 - 26,
    actorRange: 80,
    figScale: 0.2,
    heroScale: 0.34,
    titleColor: 0x8f3a08,
    labelFont: FONT_HAND,
    pathStyle: 'trail',
    labelAt: (i) => ({ x: xs[i], y: 470 + Math.sin(i * 1.35 + 0.4) * 120 + 40 }),
    background(g, pen, L, rand) {
      g.fillStyle(0xf1ead8, 1);
      g.fillRect(0, HEADER_H, L.worldW, HEIGHT - HEADER_H);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle(0x6b4a1a, 0.03 + rand() * 0.04);
        g.fillRect(rand() * L.worldW, HEADER_H + rand() * (HEIGHT - HEADER_H), 1 + rand() * 2, 1 + rand() * 2);
      }
      // sea in the lower middle (pirate ship) — a blob with wave marks
      const shipI = CHAPTERS.findIndex((c) => c.bg === 'ship');
      const sx = xs[shipI], sy = L.nodes[shipI].y;
      const sea: Phaser.Math.Vector2[] = [];
      for (let a = 0; a < TAU; a += 0.2) sea.push(new Phaser.Math.Vector2(sx + Math.cos(a) * (230 + Math.sin(a * 3) * 30), sy + 40 + Math.sin(a) * (120 + Math.cos(a * 4) * 16)));
      g.fillStyle(ACCENTS[6].soft, 0.55);
      g.fillPoints(sea, true);
      for (let i = 0; i < sea.length; i++) penLine(g, sea[i].x, sea[i].y, sea[(i + 1) % sea.length].x, sea[(i + 1) % sea.length].y, 2.2, INK_SOFT, rand);
      for (let k = 0; k < 16; k++) {
        const wx = sx - 180 + rand() * 360, wy = sy - 40 + rand() * 170;
        g.lineStyle(1.5, ACCENTS[6].main, 0.6);
        g.beginPath(); g.arc(wx, wy, 7, Math.PI, 0); g.arc(wx + 14, wy, 7, Math.PI, 0); g.strokePath();
      }
      // mountains, forest, a river
      const free = (x: number, y: number) => L.nodes.every((n) => Math.hypot(n.x - x, (n.y - 26 - y) * 1.3) > 105 && (Math.abs(n.x - x) > 150 || Math.abs(n.y + 40 - y) > 50)) && Math.hypot(x - sx, (y - sy - 40) * 1.6) > 250;
      for (let k = 0; k < 160; k++) {
        const x = rand() * L.worldW, y = HEADER_H + 30 + rand() * (HEIGHT - HEADER_H - 50);
        if (!free(x, y)) continue;
        const kind = rand();
        if (kind < 0.25) {
          const w = 22 + rand() * 18;
          pen.at(x, y, 1);
          pen.poly([[-w, 0], [0, w * 1.1], [w, 0]], 2, 0xf1ead8);
          pen.line(0, w * 1.1, w * 0.4, w * 0.6, 1.4, INK_SOFT);
          g.lineStyle(1.2, INK_SOFT, 0.4);
          for (let t = 4; t < w; t += 5) g.lineBetween(x + t * 0.2, y - t * 0.9, x + t, y);
        } else if (kind < 0.75) {
          pen.at(x, y, 1);
          // a small grove
          const n = 3 + Math.floor(rand() * 4);
          for (let t = 0; t < n; t++) {
            pen.at(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 24, 0.8 + rand() * 0.5);
            pen.line(0, 0, 0, 8, 2, 0x6b4a1a);
            pen.circle(0, 16, 9, 1.8, 0xdfe5bf);
          }
        } else {
          g.fillStyle(INK_SOFT, 0.5);
          g.fillCircle(x, y, 1.6);
        }
      }
      // compass rose
      const cx = 120, cy = HEIGHT - 90;
      g.lineStyle(2, INK_SOFT, 1);
      g.strokeCircle(cx, cy, 34);
      pen.at(cx, cy, 1);
      pen.poly([[0, 46], [7, 0], [0, -46], [-7, 0]], 1.8, ACCENTS[3].soft);
      pen.poly([[46, 0], [0, 7], [-46, 0], [0, -7]], 1.8, 0xf1ead8);
      // frame
      g.lineStyle(3, 0x6b4a1a, 0.8);
      g.strokeRect(8, HEADER_H + 8, L.worldW - 16, HEIGHT - HEADER_H - 16);
      g.lineStyle(1.2, 0x6b4a1a, 0.6);
      g.strokeRect(16, HEADER_H + 16, L.worldW - 32, HEIGHT - HEADER_H - 32);
    },
  },
  {
    name: '3 · Настольная игра',
    about: 'Как настольная игра: толстая дорога-змейка, кружки-остановки с номерами, у каждой главы — карточка с картинкой своего цвета.',
    worldW,
    nodes: xs.map((x, i) => ({ x, y: i % 2 ? 640 : 520 })),
    art: xs.map((x, i) => ({ x, y: (i % 2 ? 640 : 520) - 48, s: 0.78 })),
    actorY: (i) => (i % 2 ? 640 : 520) - 48,
    actorRange: 84,
    figScale: 0.21,
    heroScale: 0.36,
    titleColor: 0xc4000c,
    labelFont: FONT_SLAB,
    pathStyle: 'road',
    labelAt: (i) => ({ x: xs[i], y: (i % 2 ? 640 : 520) - 48 - 158 }),
    background(g, _pen, L, rand) {
      g.fillStyle(PAPER, 1);
      g.fillRect(0, HEADER_H, L.worldW, HEIGHT - HEADER_H);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle(0x000000, 0.02 + rand() * 0.03);
        g.fillRect(rand() * L.worldW, HEADER_H + rand() * (HEIGHT - HEADER_H), 1 + rand() * 2, 1 + rand() * 2);
      }
      // cards behind the landmarks
      L.art.forEach((a, i) => {
        const acc = ACCENTS[i];
        const locked = i > OPEN;
        const top = a.y - 138, h = 156, w = 262;
        g.fillStyle(locked ? 0xe4e3de : acc.soft, locked ? 1 : 0.45);
        g.fillRoundedRect(a.x - w / 2, top, w, h, 14);
        g.lineStyle(4, locked ? INK_FAINT : acc.main, 1);
        g.strokeRoundedRect(a.x - w / 2, top, w, h, 14);
        g.lineStyle(1.5, INK, 0.5);
        g.lineBetween(a.x - w / 2 + 12, a.y + 1, a.x + w / 2 - 12, a.y + 1);
      });
      // a few doodles between the cards
      for (let k = 0; k < 40; k++) {
        const x = rand() * L.worldW, y = HEADER_H + 20 + rand() * (HEIGHT - HEADER_H - 40);
        if (L.art.some((a) => Math.abs(a.x - x) < 140 && Math.abs(a.y - 60 - y) < 110)) continue;
        if (L.nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 70)) continue;
        g.lineStyle(1.4, INK_FAINT, 1);
        const kind = rand();
        if (kind < 0.5) g.strokeCircle(x, y, 3 + rand() * 4);
        else { g.lineBetween(x - 5, y, x + 5, y); g.lineBetween(x, y - 5, x, y + 5); }
      }
    },
  },
];

// ---------- scene ----------
type Actor = { ch: number; x: number; dir: number; speed: number; ph: number; zombie: boolean; fight: number; seed: number };
type Puff = { x: number; y: number; t: number; life: number };

class SketchScene extends Phaser.Scene {
  private v = 0;
  private L!: Layout;
  private mapC!: Phaser.GameObjects.Container;
  private dyn!: G;
  private scrollX = 0;
  private spline!: Phaser.Curves.Spline;
  private actors: Actor[] = [];
  private chimneys: Chimney[] = [];
  private puffs: Puff[] = [];
  private heroPos = OPEN;
  private heroTarget = OPEN;
  private heroFacing = 1;
  private act: { kind: 'idle' | 'swing' | 'jump' | 'flip' | 'run'; t: number } = { kind: 'idle', t: 0 };
  private nextAct = 2;
  private toast!: Phaser.GameObjects.Text;
  private time0 = 0;

  constructor() {
    super('Sketch');
  }

  init(d: { v?: number }) {
    this.v = d?.v ?? 0;
    this.L = LAYOUTS[this.v];
    this.actors = [];
    this.chimneys = [];
    this.puffs = [];
    this.heroPos = this.heroTarget = OPEN;
    this.act = { kind: 'idle', t: 0 };
  }

  create() {
    const L = this.L;
    const rand = rng(11 + this.v);
    this.mapC = this.add.container(0, 0);
    const bg = this.add.graphics();
    this.mapC.add(bg);
    const pen = new Pen(bg, rand);
    if (L.pathStyle === 'ground') {
      bg.fillStyle(PAPER, 1);
      bg.fillRect(0, 0, L.worldW, HEIGHT);
    }
    L.background(bg, pen, L, rand);

    // path through the nodes, a bit past both ends
    const n0 = L.nodes[0], nl = L.nodes[N - 1];
    const pts = [new Phaser.Math.Vector2(n0.x - 220, n0.y + (L.pathStyle === 'ground' ? 0 : 40)), ...L.nodes.map((n) => new Phaser.Math.Vector2(n.x, n.y)), new Phaser.Math.Vector2(nl.x + 220, nl.y)];
    this.spline = new Phaser.Curves.Spline(pts);
    this.drawPath(bg, rand);

    // landmarks, huts, labels
    const labels = (x: number, y: number, s: string, size: number) => {
      if (s) this.mapC.add(this.add.text(x, y, s, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: `${size}px`, color: hex(INK) }).setOrigin(0.5));
    };
    L.art.forEach((a, i) => {
      const locked = i > OPEN, passed = i < OPEN;
      pen.alpha = locked ? 0.38 : 1;
      pen.at(a.x, a.y, a.s);
      const chim = landmark(pen, i, passed, labels);
      if (CHAPTERS[i].bg !== 'village' && CHAPTERS[i].bg !== 'ship') {
        pen.at(a.x, a.y, a.s);
        hut(pen, 118, !passed, chim);
      }
      pen.alpha = 1;
      if (passed) this.chimneys.push(...chim);
      if (locked) this.padlock(bg, a.x, a.y - 150 * a.s);
      const lab = L.labelAt(i);
      const t1 = this.add.text(lab.x, lab.y, `${i + 1}. ${CHAPTERS[i].name}`, {
        fontFamily: L.labelFont, fontStyle: 'bold', fontSize: L.pathStyle === 'trail' ? '22px' : '20px',
        color: hex(locked ? 0x9a9a94 : L.pathStyle === 'trail' ? 0x4a2a08 : INK),
      }).setOrigin(0.5);
      this.mapC.add(t1);
      if (L.pathStyle === 'ground') {
        // plaque on a post
        bg.lineStyle(2.4, locked ? INK_FAINT : INK, 1);
        bg.strokeRect(lab.x - t1.width / 2 - 12, lab.y - 16, t1.width + 24, 32);
        bg.fillStyle(ACCENTS[i].soft, locked ? 0.3 : 0.8);
        bg.fillRect(lab.x - t1.width / 2 - 11, lab.y - 15, t1.width + 22, 30);
      }
      // actors: zombies where the chapter is not passed, happy people where it is
      for (let k = 0; k < 3; k++) {
        this.actors.push({
          ch: i, x: a.x + (rand() - 0.5) * L.actorRange * 2, dir: rand() < 0.5 ? -1 : 1, speed: 10 + rand() * 12,
          ph: rand() * 10, zombie: !passed, fight: 0, seed: i * 7 + k,
        });
      }
    });
    if (L.pathStyle === 'ground') this.children.bringToTop(bg); // keep order simple
    this.mapC.sendToBack(bg);

    this.dyn = this.add.graphics();
    this.mapC.add(this.dyn);

    this.header();
    this.scrollTo(L.nodes[OPEN].x - WIDTH / 2, false);
    this.input.on('wheel', (_p: unknown, _o: unknown, dx: number, dy: number) => this.scrollTo(this.scrollX + dx + dy, false));
    let downX = 0, startScroll = 0, dragging = false, down = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < HEADER_H) return;
      down = true; dragging = false; downX = p.x; startScroll = this.scrollX;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!down) return;
      if (Math.abs(p.x - downX) > 6) dragging = true;
      if (dragging) this.scrollTo(startScroll - (p.x - downX), false);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!down) return;
      down = false;
      if (!dragging) this.clickMap(p.x + this.scrollX, p.y);
    });
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const k = Number(e.key);
      if (k >= 1 && k <= LAYOUTS.length) this.scene.restart({ v: k - 1 });
      if (e.key === 'ArrowLeft') this.go(Math.max(0, this.heroTarget - 1));
      if (e.key === 'ArrowRight') this.go(Math.min(OPEN, this.heroTarget + 1));
      if (e.key === 'Enter') this.go(this.heroTarget);
    });
  }

  private drawPath(g: G, rand: () => number) {
    const L = this.L;
    const steps = 900;
    const tOpen = (OPEN + 1) / (N + 1);
    let prev = this.spline.getPoint(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = this.spline.getPoint(t);
      const open = t <= tOpen;
      if (L.pathStyle === 'road') {
        g.lineStyle(30, open ? 0xd8d4c6 : 0xe6e4de, 1);
        g.lineBetween(prev.x, prev.y, pt.x, pt.y);
      } else if (L.pathStyle === 'ground') {
        g.lineStyle(14, 0xd9d5c8, 1);
        g.lineBetween(prev.x, prev.y, pt.x, pt.y);
      }
      prev = pt;
    }
    prev = this.spline.getPoint(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const pt = this.spline.getPoint(t);
      const open = t <= tOpen;
      if (L.pathStyle === 'road') {
        const a = Math.atan2(pt.y - prev.y, pt.x - prev.x);
        const nx = -Math.sin(a) * 15, ny = Math.cos(a) * 15;
        g.lineStyle(2.4, open ? INK : INK_FAINT, 1);
        g.lineBetween(prev.x + nx, prev.y + ny, pt.x + nx, pt.y + ny);
        g.lineBetween(prev.x - nx, prev.y - ny, pt.x - nx, pt.y - ny);
        if (i % 8 < 4) {
          g.lineStyle(2, open ? 0xffffff : 0xf4f4f0, 1);
          g.lineBetween(prev.x, prev.y, pt.x, pt.y);
        }
      } else if (i % 10 < (open ? 6 : 4)) {
        g.lineStyle(L.pathStyle === 'trail' ? 3.4 : 3, open ? (L.pathStyle === 'trail' ? 0x8f3a08 : INK) : INK_FAINT, 1);
        g.lineBetween(prev.x, prev.y, pt.x, pt.y);
      }
      prev = pt;
    }
    // stops
    L.nodes.forEach((n, i) => {
      const locked = i > OPEN, passed = i < OPEN;
      const acc = ACCENTS[i];
      if (L.pathStyle === 'road') {
        g.fillStyle(locked ? 0xe4e3de : acc.main, 1);
        g.fillCircle(n.x, n.y, 30);
        g.lineStyle(4, locked ? INK_FAINT : INK, 1);
        g.strokeCircle(n.x, n.y, 30);
        const t = this.add.text(n.x, n.y + 1, String(i + 1), { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '30px', color: locked ? '#a6a6a0' : '#ffffff' }).setOrigin(0.5);
        this.mapC.add(t);
        if (passed) this.star(g, n.x + 26, n.y - 26, 11, 0xf3d36b);
      } else if (L.pathStyle === 'trail') {
        g.fillStyle(locked ? 0xe8e2d0 : acc.soft, 1);
        g.fillCircle(n.x, n.y, 14);
        g.lineStyle(3, locked ? INK_FAINT : 0x8f3a08, 1);
        g.strokeCircle(n.x, n.y, 14);
        if (passed) {
          g.lineStyle(3, acc.main, 1);
          g.lineBetween(n.x - 7, n.y - 7, n.x + 7, n.y + 7);
          g.lineBetween(n.x + 7, n.y - 7, n.x - 7, n.y + 7);
        }
      } else {
        g.fillStyle(locked ? 0xe6e4de : acc.main, 1);
        g.fillEllipse(n.x, n.y, 46, 16);
        g.lineStyle(2.4, locked ? INK_FAINT : INK, 1);
        g.strokeEllipse(n.x, n.y, 46, 16);
      }
      void rand;
    });
  }

  private star(g: G, x: number, y: number, r: number, color: number) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr));
    }
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
    g.lineStyle(2, INK, 1);
    g.strokePoints(pts, true);
  }

  private padlock(g: G, x: number, y: number) {
    g.lineStyle(3, INK_SOFT, 1);
    g.beginPath();
    g.arc(x, y - 4, 9, Math.PI, 0);
    g.strokePath();
    g.fillStyle(INK_SOFT, 1);
    g.fillRoundedRect(x - 13, y - 4, 26, 20, 4);
    g.fillStyle(PAPER, 1);
    g.fillCircle(x, y + 5, 3);
  }

  private header() {
    const L = this.L;
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
    drawLogo(this, WIDTH / 2, 14, 0.42, L.titleColor).setDepth(11);
    const labels = ['Play', 'Avatar', 'Leaderboard', 'Perks', 'Events', 'Rewards'];
    const bw = 158, bh = 42, gap = 16;
    const x0 = WIDTH / 2 - ((bw + gap) * labels.length - gap) / 2;
    labels.forEach((s, i) => {
      const x = x0 + i * (bw + gap), y = 104;
      const off = i >= 4;
      for (const [ax, ay, bx, by] of [[x, y, x + bw, y], [x + bw, y, x + bw, y + bh], [x + bw, y + bh, x, y + bh], [x, y + bh, x, y]]) {
        penLine(g, ax, ay, bx, by, i === 0 ? 3.4 : 2.4, off ? INK_FAINT : INK, rand);
      }
      if (i === 0) {
        g.fillStyle(ACCENTS[OPEN].soft, 1);
        g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
      const t = this.add.text(x + bw / 2, y + bh / 2, s, { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '22px', color: off ? '#a6a6a0' : hex(INK) }).setOrigin(0.5).setDepth(11);
      const z = this.add.zone(x + bw / 2, y + bh / 2, bw, bh).setInteractive({ useHandCursor: true }).setDepth(12);
      z.on('pointerup', () => (i === 0 ? this.go(this.heroTarget) : this.say(off ? 'Coming soon!' : `${s} — как сейчас`)));
      void t;
    });
    // variant switcher (in the real game: only with ?debug=true)
    LAYOUTS.forEach((l, i) => {
      const t = this.add.text(14, 12 + i * 24, l.name, { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '15px', fontStyle: i === this.v ? 'bold' : 'normal', color: i === this.v ? hex(MENU_ORANGE) : '#777777' })
        .setDepth(12).setInteractive({ useHandCursor: true });
      t.on('pointerup', () => this.scene.restart({ v: i }));
    });
    this.add.text(14, 86, 'эскиз · клавиши 1 2 3 · тащи мышью', { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '12px', color: '#999999' }).setDepth(12);
    const about = this.add.text(WIDTH - 12, 10, L.about, { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: '13px', color: '#444444', wordWrap: { width: 280 } }).setOrigin(1, 0).setDepth(12);
    void about;
    this.toast = this.add.text(WIDTH / 2, HEADER_H + 40, '', { fontFamily: FONT_SLAB, fontStyle: 'bold', fontSize: '26px', color: hex(INK), backgroundColor: '#ffffffee', padding: { x: 16, y: 8 } }).setOrigin(0.5).setDepth(13).setAlpha(0);
  }

  private say(s: string) {
    this.toast.setText(s).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1300, duration: 500 });
  }

  private scrollTo(x: number, smooth: boolean) {
    const max = this.L.worldW - WIDTH;
    const nx = Phaser.Math.Clamp(x, 0, max);
    this.scrollX = smooth ? this.scrollX + (nx - this.scrollX) * 0.08 : nx;
    this.mapC.x = -this.scrollX;
  }

  private clickMap(wx: number, wy: number) {
    let best = -1, bd = 1e9;
    this.L.nodes.forEach((n, i) => {
      const a = this.L.art[i];
      const d = Math.min(Math.hypot(n.x - wx, n.y - wy), Math.hypot(a.x - wx, a.y - 60 * a.s - wy));
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0 || bd > 150) return;
    if (best > OPEN) return this.say('🔒 Locked — finish the previous chapter');
    this.go(best);
  }

  private go(i: number) {
    if (i === this.heroPos && this.act.kind !== 'run') {
      this.say(`▶ ${CHAPTERS[i].title}: ${CHAPTERS[i].name}`);
      return;
    }
    this.heroTarget = i;
    this.act = { kind: 'run', t: 0 };
  }

  private nodePoint(pos: number) {
    return this.spline.getPoint((pos + 1) / (N + 1));
  }

  update(time: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    const L = this.L;
    this.time0 += dt;
    const g = this.dyn;
    g.clear();

    // smoke over passed chapters
    for (const c of this.chimneys) {
      if (Math.random() < dt * 1.6) this.puffs.push({ x: c.x, y: c.y, t: 0, life: 2.2 + Math.random() });
    }
    this.puffs = this.puffs.filter((p) => (p.t += dt) < p.life);
    for (const p of this.puffs) {
      const k = p.t / p.life;
      g.fillStyle(0x9a9a94, 0.45 * (1 - k));
      g.fillCircle(p.x + Math.sin(p.t * 2 + p.y) * 5 + k * 16, p.y - k * 46, 3 + k * 8);
    }

    // little people and zombies
    for (const a of this.actors) {
      const home = L.art[a.ch].x;
      a.ph += dt * (a.zombie ? 4 : 6);
      if (a.fight > 0) {
        a.fight -= dt;
      } else {
        a.x += a.dir * a.speed * dt;
        if (Math.abs(a.x - home) > L.actorRange) {
          a.dir = Math.sign(home - a.x);
          a.x = home + Math.sign(a.x - home) * L.actorRange;
        }
        if (a.zombie && Math.random() < dt * 0.06) {
          // start a scuffle with a neighbour
          const other = this.actors.find((b) => b !== a && b.ch === a.ch && b.zombie && b.fight <= 0);
          if (other) {
            a.fight = other.fight = 1.6;
            other.x = a.x + 22 * (a.x < home ? 1 : -1);
            a.dir = Math.sign(other.x - a.x);
            other.dir = -a.dir;
          }
        }
      }
      const y = L.actorY(a.ch, a.x);
      const locked = a.ch > OPEN;
      const alpha = locked ? 0.4 : 1;
      let p: Pose;
      if (a.fight > 0) {
        const s = Math.sin(a.ph * 3);
        p = pose({ lean: 0.25, fThigh: 0.3, bThigh: -0.3, fUpper: 1.5 + 0.7 * s, fFore: 1.6 + 0.6 * s, bUpper: 1.2 - 0.7 * s, bFore: 1.4 });
      } else {
        p = walkPose(a.ph, a.zombie);
        if (!a.zombie) p.lift = Math.max(0, Math.sin(a.ph * 0.5)) * 3;
      }
      drawFigure(g, a.x, y, a.dir, L.figScale, p, a.zombie
        ? { kind: 'zombie', seed: a.seed, alpha, ink: locked ? 0x9a9a94 : INK }
        : { kind: 'player', weapon: null, seed: a.seed, time: time / 1000 });
    }

    this.updateHero(dt, time / 1000);
  }

  private updateHero(dt: number, time: number) {
    const L = this.L;
    const act = this.act;
    act.t += dt;
    let p = P_IDLE;
    let lift = 0;
    if (act.kind === 'run') {
      const d = this.heroTarget - this.heroPos;
      if (Math.abs(d) < 0.02) {
        this.heroPos = this.heroTarget;
        this.act = { kind: 'idle', t: 0 };
        this.say(`▶ ${CHAPTERS[this.heroPos].title}: ${CHAPTERS[this.heroPos].name}`);
      } else {
        this.heroPos += Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
        p = walkPose(act.t * 16, false, true);
        const a = this.nodePoint(this.heroPos - 0.01), b = this.nodePoint(this.heroPos + 0.01);
        this.heroFacing = Math.sign(d) * Math.sign(b.x - a.x || 1);
      }
      this.scrollTo(this.nodePoint(this.heroPos).x - WIDTH / 2, true);
    } else if (act.kind === 'idle') {
      if (act.t > this.nextAct) {
        const r = Math.random();
        this.act = { kind: r < 0.45 ? 'swing' : r < 0.75 ? 'jump' : 'flip', t: 0 };
        this.nextAct = 1.8 + Math.random() * 2.5;
        if (Math.random() < 0.3) this.heroFacing *= -1;
      }
    } else if (act.kind === 'swing') {
      const T = 0.55;
      p = act.t < 0.18 ? lerpPose(P_IDLE, HIGH_A, act.t / 0.18) : act.t < 0.36 ? lerpPose(HIGH_A, HIGH_B, (act.t - 0.18) / 0.18) : lerpPose(HIGH_B, P_IDLE, (act.t - 0.36) / 0.19);
      if (act.t > T) this.act = { kind: 'idle', t: 0 };
    } else {
      const T = act.kind === 'flip' ? 0.75 : 0.55;
      const k = act.t / T;
      lift = Math.sin(Math.PI * Math.min(1, k)) * (act.kind === 'flip' ? 70 : 46) * L.heroScale / 0.48;
      if (act.kind === 'flip') p = pose({ ...lerpPose(P_JUMP, P_TUCK, Math.min(1, k * 3)), rot: Math.min(1, k) * TAU });
      else p = P_JUMP;
      if (k >= 1) this.act = { kind: 'idle', t: 0 };
    }
    const pt = this.nodePoint(this.heroPos);
    drawFigure(this.dyn, pt.x, pt.y - lift - (L.pathStyle === 'road' ? 8 : 2), this.heroFacing, L.heroScale, p, { kind: 'player', weapon: 'sword', headgear: 'headband', time });
    // name tag over the hero
    this.dyn.fillStyle(MENU_ORANGE, 1);
    const ty = pt.y - 150 * L.heroScale / 0.48 - 4;
    this.dyn.fillTriangle(pt.x - 7, ty - 8, pt.x + 7, ty - 8, pt.x, ty);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: PAPER,
  antialias: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [SketchScene],
});
