/**
 * Drawings for the v7 world map (main menu): a pen with local coordinates,
 * the ten chapter landmarks (static parts + the spots their animations use),
 * and the little animated things (flags, animals, vehicles...).
 */
import Phaser from 'phaser';
import { ACCENTS, INK, INK_SOFT, PAPER } from './constants';
import { CHAPTERS } from './data';
import { penLine, type G } from './background';

export type V = { x: number; y: number };
export const MAP_PAPER = 0xf1ead8;
export const MAP_BROWN = 0x6b4a1a;
export const TITLE_BROWN = 0x8f3a08;
export const LAMP = 0xffd36b;

// ---------- a little "pen" with local coordinates: x right, h up from the ground ----------
export class Pen {
  ox = 0;
  oy = 0;
  s = 1;
  rot = 0;
  ink = INK;
  alpha = 1;
  constructor(public g: G, public rand: () => number) {}
  at(x: number, y: number, s: number, rot = 0) {
    this.ox = x;
    this.oy = y;
    this.s = s;
    this.rot = rot;
    return this;
  }
  /** Local (x, h) → world point. */
  pt(x: number, h: number): V {
    if (!this.rot) return { x: this.ox + x * this.s, y: this.oy - h * this.s };
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    const lx = x * this.s, ly = -h * this.s;
    return { x: this.ox + lx * c - ly * sn, y: this.oy + lx * sn + ly * c };
  }
  X(x: number) { return this.ox + x * this.s; }
  Y(h: number) { return this.oy - h * this.s; }
  w(w: number) { return w * Math.max(0.55, this.s); }
  line(x1: number, h1: number, x2: number, h2: number, w = 2.4, color = this.ink) {
    const a = this.pt(x1, h1), b = this.pt(x2, h2);
    penLine(this.g, a.x, a.y, b.x, b.y, this.w(w), color, this.rand, this.alpha);
  }
  fill(pts: [number, number][], fill: number, fillA = 1) {
    this.g.fillStyle(fill, fillA * this.alpha);
    this.g.fillPoints(pts.map(([x, h]) => this.pt(x, h)) as unknown as Phaser.Math.Vector2[], true);
  }
  poly(pts: [number, number][], w = 2.4, fill?: number, fillA = 1) {
    if (fill !== undefined) this.fill(pts, fill, fillA);
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
    const c = this.pt(x, h);
    if (fill !== undefined) {
      this.g.fillStyle(fill, this.alpha);
      this.g.fillCircle(c.x, c.y, r * this.s);
    }
    if (lw > 0) {
      this.g.lineStyle(this.w(lw), color, this.alpha);
      this.g.strokeCircle(c.x, c.y, r * this.s);
    }
  }
  /** Simple parallel hatching inside an axis-aligned box. */
  hatchBox(x: number, h: number, w: number, hh: number, step = 9, color = INK_SOFT, a = 0.35) {
    this.g.lineStyle(this.w(1.2), color, a * this.alpha);
    for (let c = 0; c < w + hh; c += step) {
      const x1 = Math.max(0, c - hh), x2 = Math.min(w, c);
      const h1 = Math.min(hh, c), h2 = c - x2;
      const p = this.pt(x + x1, h + h1), q = this.pt(x + x2, h + h2);
      this.g.lineBetween(p.x, p.y, q.x, q.y);
    }
  }
}

// ---------- what a landmark leaves for the animations ----------
export interface Win {
  x: number; y: number; w: number; h: number;
  on: boolean;
  next: number;
  /** In a chapter not yet passed: a broken bulb that flickers. */
  broken: boolean;
  ch: number;
}
export interface Hut { x: number; y: number; w: number; h: number; broken: boolean; ch: number; win?: Win }
export interface LandFx {
  windows: Win[];
  candles: V[];
  chimneys: V[];
  huts: Hut[];
  /** Named spots for the chapter's own animations (world coordinates). */
  spot: Record<string, V>;
  /** Texts painted on the landmark (signs). */
  texts: { x: number; y: number; s: string; size: number; key: string }[];
}

export const emptyFx = (): LandFx => ({ windows: [], candles: [], chimneys: [], huts: [], spot: {}, texts: [] });

function win(p: Pen, fx: LandFx, ch: number, broken: boolean, x: number, h: number, w: number, hh: number, lw = 1.6) {
  p.rect(x, h, w, hh, lw, 0xdedbd0);
  const tl = p.pt(x, h + hh);
  const o: Win = { x: tl.x, y: tl.y, w: w * p.s, h: hh * p.s, on: false, next: 0, broken, ch };
  fx.windows.push(o);
  return o;
}

export function hut(p: Pen, fx: LandFx, ch: number, x: number, broken: boolean) {
  const tl = p.pt(x - 22, 42);
  const box: Hut = { x: tl.x, y: tl.y, w: 44 * p.s, h: 42 * p.s, broken, ch };
  if (!broken) {
    p.rect(x - 16, 0, 32, 22, 2, PAPER);
    p.poly([[x - 21, 22], [x, 40], [x + 21, 22]], 2, ACCENTS[ch].soft);
    p.rect(x + 7, 28, 6, 12, 1.8, PAPER);
    p.rect(x + 2, 0, 9, 13, 1.6);
    box.win = win(p, fx, ch, false, x - 12, 8, 9, 8, 1.4);
    fx.chimneys.push(p.pt(x + 10, 42));
  } else {
    p.open([[x - 16, 0], [x - 16, 22], [x - 4, 22]], 2);
    p.open([[x + 16, 0], [x + 16, 12]], 2);
    p.poly([[x - 24, 18], [x - 2, 36], [x + 14, 10]], 2, PAPER); // roof slid down
    p.line(x - 6, 0, x + 22, 8, 2.2); // plank
    p.line(x + 8, 0, x + 24, 3, 1.6);
  }
  fx.huts.push(box);
}

/** Static part of a chapter's landmark (s ≈ 0.7 on the map). Animated parts are drawn every frame. */
export function landmark(p: Pen, ch: number, passed: boolean, fx: LandFx) {
  const acc = ACCENTS[ch];
  const sp = (k: string, x: number, h: number) => (fx.spot[k] = p.pt(x, h));
  switch (CHAPTERS[ch].bg) {
    case 'cliff': {
      const rock: [number, number][] = [[-95, 0], [-80, 50], [-62, 62], [-45, 112], [-10, 128], [18, 108], [44, 116], [70, 58], [92, 0]];
      p.poly(rock, 2.6, PAPER);
      p.hatchBox(-60, 10, 110, 70, 10);
      p.line(30, 112, 34, 140, 2.4); // dead tree
      p.line(33, 132, 18, 148, 1.8);
      p.line(34, 128, 48, 144, 1.8);
      p.line(-45, 112, -30, 92, 2, acc.main);
      p.line(44, 116, 60, 80, 2, acc.main);
      p.rect(-72, 0, 18, 26, 2, INK); // cave
      p.line(-10, 128, -10, 152, 2); // flag pole on the summit
      sp('flag', -10, 152);
      sp('eagle', 0, 200);
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
      for (const x of [-30, 22, 64]) {
        p.rect(x - 2, 0, 4, 8, 1.2, PAPER); // candles
        fx.candles.push(p.pt(x, 11));
      }
      sp('ghost', 44, 40);
      sp('hand', -22, 0);
      break;
    }
    case 'castle': {
      p.rect(-62, 0, 124, 62, 2.6, PAPER);
      for (let x = -62; x < 62; x += 18) p.rect(x, 62, 10, 10, 2, PAPER);
      p.rect(-94, 0, 32, 100, 2.6, PAPER); p.poly([[-100, 100], [-78, 140], [-56, 100]], 2.4, acc.soft);
      p.rect(62, 0, 32, 100, 2.6, PAPER); p.poly([[56, 100], [78, 140], [100, 100]], 2.4, acc.soft);
      p.poly([[-16, 0], [-16, 30], [0, 42], [16, 30], [16, 0]], 2.4, 0x2a2a2a);
      p.line(-78, 140, -78, 166, 2); p.line(78, 140, 78, 166, 2);
      win(p, fx, ch, !passed, -84, 60, 9, 14); win(p, fx, ch, false, 74, 60, 9, 14);
      win(p, fx, ch, false, -46, 30, 9, 12); win(p, fx, ch, false, 36, 30, 9, 12);
      for (const x of [-26, 26]) {
        p.line(x, 22, x, 32, 2);
        fx.candles.push(p.pt(x, 36));
      }
      sp('flagL', -78, 166); sp('flagR', 78, 166);
      sp('gate', 0, 0); sp('wallL', -55, 72); sp('wallR', 55, 72);
      break;
    }
    case 'stadium': {
      p.poly([[-98, 0], [-84, 60], [84, 60], [98, 0]], 2.6, PAPER);
      for (let h = 14; h < 60; h += 14) p.line(-98 + h * 0.23, h, 98 - h * 0.23, h, 1.4, INK_SOFT);
      for (let x = -70; x <= 70; x += 20) p.line(x, 60, x * 1.08, 0, 1.2, INK_SOFT);
      for (const x of [-90, 90]) {
        p.line(x, 60, x, 132, 2.4);
        p.rect(x - 14, 132, 28, 14, 2, 0xdedbd0);
      }
      p.line(0, 60, 0, 96, 2);
      p.rect(-30, 60, 60, 18, 2, PAPER); // scoreboard
      fx.texts.push({ ...p.pt(0, 69), s: '3 : 0', size: 11 * p.s, key: 'score' });
      sp('flag', 0, 96); sp('lampL', -90, 139); sp('lampR', 90, 139);
      sp('ballA', -60, 4); sp('ballB', 60, 4);
      break;
    }
    case 'army': {
      p.poly([[-96, 0], [-62, 52], [-28, 0]], 2.6, acc.soft);
      p.line(-62, 0, -62, 52, 1.6);
      p.open([[8, 0], [18, 92], [48, 92], [58, 0]], 2.4);
      p.line(10, 30, 56, 60, 1.4); p.line(56, 30, 10, 60, 1.4);
      p.rect(4, 92, 58, 16, 2.4, PAPER);
      win(p, fx, ch, !passed, 14, 95, 12, 9); win(p, fx, ch, false, 40, 95, 12, 9);
      p.poly([[0, 108], [33, 128], [66, 108]], 2.2, acc.soft);
      p.line(33, 128, 33, 152, 2);
      const wire: [number, number][] = [];
      for (let x = -96; x <= 96; x += 8) wire.push([x, 8 + ((x / 8) % 2 ? 6 : 0)]);
      p.open(wire, 1.3, INK_SOFT);
      for (const [x, h] of [[70, 6], [84, 6], [77, 18]]) p.circle(x, h, 7, 1.8, PAPER);
      sp('flag', 33, 152); sp('light', 33, 112); sp('jeepA', -80, -14); sp('jeepB', 60, -14);
      break;
    }
    case 'village': {
      for (const [x, w] of [[-52, 52], [34, 58]] as const) {
        p.rect(x - w / 2, 0, w, 40, 2.4, PAPER);
        p.poly([[x - w / 2 - 8, 40], [x, 74], [x + w / 2 + 8, 40]], 2.4, acc.soft);
        p.rect(x + w / 4 - 4, 52, 9, 20, 2, PAPER);
        if (passed) fx.chimneys.push(p.pt(x + w / 4, 74));
        p.rect(x - 7, 0, 14, 22, 1.8);
        win(p, fx, ch, !passed && x > 0, x - w / 2 + 6, 22, 9, 9, 1.4);
        win(p, fx, ch, false, x + w / 2 - 15, 22, 9, 9, 1.4);
      }
      // windmill (blades turn in the animation)
      p.poly([[-122, 0], [-114, 76], [-100, 76], [-92, 0]], 2.4, PAPER);
      p.rect(-111, 0, 8, 14, 1.6);
      sp('mill', -107, 80);
      // laundry line
      p.line(62, 0, 62, 34, 2); p.line(104, 0, 104, 34, 2);
      sp('lineA', 62, 32); sp('lineB', 104, 32);
      p.poly([[112, 0], [118, 30], [134, 30], [138, 0]], 2, acc.soft); // haystack
      p.line(-96, 12, 96, 12, 1.4, INK_SOFT);
      if (!passed) {
        p.line(-46, 18, -36, 34, 2); p.line(-36, 18, -46, 34, 2); // a hole
        p.line(60, 0, 90, 14, 2);
      }
      sp('hens', -6, -10);
      break;
    }
    case 'ship': {
      // drawn every frame (it rocks on the waves); only the pier is static
      p.open([[-150, -30], [-96, -30]], 3, MAP_BROWN);
      for (let x = -150; x <= -100; x += 10) p.line(x, -26, x, -34, 1.6, MAP_BROWN);
      sp('ship', 0, 0); sp('gulls', 0, 190);
      break;
    }
    case 'mall': {
      p.rect(-96, 0, 192, 82, 2.6, PAPER);
      for (let x = -80; x <= 80; x += 22) p.line(x, 8, x, 70, 1.2, INK_SOFT);
      p.line(-90, 40, 90, 40, 1.2, INK_SOFT);
      for (const x of [-86, -64, 46, 68]) win(p, fx, ch, !passed && x === 46, x + 3, 46, 14, 18, 1);
      p.rect(-46, 82, 92, 24, 2.4, PAPER);
      fx.texts.push({ ...p.pt(0, 94), s: 'MALL', size: 15 * p.s, key: 'neon' });
      p.rect(-18, 0, 36, 32, 2.4, PAPER); p.line(0, 0, 0, 32, 1.6);
      sp('sign', 0, 94); sp('signBox', -46, 106); sp('cartA', 30, 0); sp('cartB', 92, 0);
      break;
    }
    case 'burger': {
      p.rect(-74, 0, 148, 56, 2.6, PAPER);
      for (let x = -74; x < 74; x += 18.5) p.rect(x, 56, 18.5, 8, 1.2, Math.round(x / 18.5) % 2 ? PAPER : acc.soft);
      win(p, fx, ch, !passed, -56, 12, 40, 26, 2);
      p.rect(18, 0, 26, 40, 2, PAPER);
      win(p, fx, ch, false, 50, 22, 14, 14, 1.4);
      p.poly([[-44, 70], [44, 70], [40, 80], [-40, 80]], 2.2, acc.soft);
      p.poly([[-46, 80], [46, 80], [46, 90], [-46, 90]], 2.2, 0x6b4a1a, 0.8);
      const lettuce: [number, number][] = [];
      for (let x = -48; x <= 48; x += 8) lettuce.push([x, 92 + ((x / 8) % 2 ? 4 : 0)]);
      p.open(lettuce, 2, 0x2e9e3e);
      p.poly([[-44, 96], [-30, 120], [0, 128], [30, 120], [44, 96]], 2.4, acc.soft);
      for (const [x, h] of [[-16, 116], [6, 120], [22, 112]]) p.circle(x, h, 1.6, 0, INK);
      fx.texts.push({ ...p.pt(0, 146), s: 'BRAAAINS', size: 14 * p.s, key: 'neon' });
      sp('steam', 0, 130); sp('sign', 0, 146);
      break;
    }
    case 'airport': {
      p.rect(-78, 0, 18, 106, 2.4, PAPER);
      p.poly([[-90, 106], [-48, 106], [-54, 128], [-84, 128]], 2.4, PAPER);
      win(p, fx, ch, !passed, -82, 110, 26, 12, 1.4);
      p.line(-69, 128, -69, 142, 1.8);
      p.rect(-40, 0, 116, 42, 2.4, PAPER);
      for (let x = -30; x < 70; x += 16) win(p, fx, ch, false, x, 16, 10, 14, 1.4);
      p.line(-110, -14, 130, -14, 1.4, INK_SOFT);
      for (let x = -100; x < 120; x += 28) p.line(x, -20, x + 14, -20, 2, INK_SOFT);
      for (let x = -104; x <= 126; x += 23) fx.spot[`rl${Math.round(x)}`] = p.pt(x, -26);
      sp('runA', -100, -20); sp('runB', 130, -20); sp('beacon', -69, 144);
      break;
    }
  }
}

// ---------- animated bits (drawn every frame) ----------

export function flag(g: G, x: number, y: number, len: number, color: number, t: number, alpha = 1, dir = 1) {
  const pts: V[] = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push({ x: x + dir * k * len, y: y + Math.sin(t * 6 - k * 3) * 2.2 * k });
  }
  for (let i = n; i >= 0; i--) {
    const k = i / n;
    pts.push({ x: x + dir * k * len, y: y + len * 0.55 * (1 - k * 0.25) + Math.sin(t * 6 - k * 3) * 2.2 * k });
  }
  g.fillStyle(color, alpha);
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
  g.lineStyle(1.4, INK, alpha);
  g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true);
}

/** A flying bird as a little "V" with flapping wings. */
export function bird(g: G, x: number, y: number, s: number, flap: number, color = INK, alpha = 1) {
  const w = 7 * s, up = (2 + Math.sin(flap) * 4) * s;
  g.lineStyle(1.6 * Math.max(0.7, s), color, alpha);
  g.beginPath();
  g.moveTo(x - w, y - up);
  g.lineTo(x - w * 0.3, y - up * 0.2);
  g.lineTo(x, y);
  g.lineTo(x + w * 0.3, y - up * 0.2);
  g.lineTo(x + w, y - up);
  g.strokePath();
}

export function bunny(g: G, x: number, y: number, dir: number, s = 1, alpha = 1) {
  g.fillStyle(0xffffff, alpha);
  g.lineStyle(1.6, INK, alpha);
  g.fillEllipse(x, y - 5 * s, 14 * s, 9 * s);
  g.strokeEllipse(x, y - 5 * s, 14 * s, 9 * s);
  const hx = x + dir * 7 * s, hy = y - 10 * s;
  g.fillCircle(hx, hy, 4 * s);
  g.strokeCircle(hx, hy, 4 * s);
  g.lineBetween(hx - dir * 1 * s, hy - 3 * s, hx - dir * 3 * s, hy - 12 * s);
  g.lineBetween(hx + dir * 1 * s, hy - 3 * s, hx + dir * 2 * s, hy - 12 * s);
  g.fillStyle(INK, alpha);
  g.fillCircle(hx + dir * 1.6 * s, hy - 0.5 * s, 0.9 * s);
  g.fillStyle(0xffffff, alpha);
  g.fillCircle(x - dir * 7 * s, y - 6 * s, 2.4 * s);
  g.strokeCircle(x - dir * 7 * s, y - 6 * s, 2.4 * s);
}

export function squirrel(g: G, x: number, y: number, dir: number, s = 1, up = 1) {
  const c = 0x9b5a1f;
  const yy = y + (1 - up) * 10 * s;
  g.fillStyle(c, 1);
  g.lineStyle(1.4, INK, 1);
  g.fillCircle(x, yy - 4 * s, 4 * s);
  g.strokeCircle(x, yy - 4 * s, 4 * s);
  g.lineBetween(x - 2 * s, yy - 7 * s, x - 3 * s, yy - 10 * s);
  g.lineBetween(x + 2 * s, yy - 7 * s, x + 3 * s, yy - 10 * s);
  g.fillStyle(INK, 1);
  g.fillCircle(x + dir * 1.6 * s, yy - 4.5 * s, 0.9 * s);
  // bushy tail
  g.fillStyle(c, 1);
  g.fillEllipse(x - dir * 7 * s, yy - 7 * s, 6 * s, 11 * s);
  g.strokeEllipse(x - dir * 7 * s, yy - 7 * s, 6 * s, 11 * s);
}

export function fox(g: G, x: number, y: number, dir: number, ph: number, s = 1) {
  const c = 0xe0661b;
  const bob = Math.abs(Math.sin(ph)) * 2 * s;
  g.lineStyle(1.5, INK, 1);
  // legs
  for (const k of [-1, 1]) {
    const sw = Math.sin(ph + (k > 0 ? 0 : Math.PI)) * 3 * s;
    g.lineBetween(x + k * 5 * s, y - 4 * s - bob, x + k * 5 * s + sw, y);
  }
  g.fillStyle(c, 1);
  g.fillEllipse(x, y - 7 * s - bob, 18 * s, 7 * s);
  g.strokeEllipse(x, y - 7 * s - bob, 18 * s, 7 * s);
  const hx = x + dir * 10 * s, hy = y - 10 * s - bob;
  g.fillTriangle(hx - dir * 3 * s, hy - 3 * s, hx - dir * 3 * s, hy + 3 * s, hx + dir * 5 * s, hy + 1 * s);
  g.fillTriangle(hx - dir * 2 * s, hy - 2 * s, hx, hy - 7 * s, hx + dir * 1 * s, hy - 2 * s);
  g.strokeTriangle(hx - dir * 3 * s, hy - 3 * s, hx - dir * 3 * s, hy + 3 * s, hx + dir * 5 * s, hy + 1 * s);
  // tail with a white tip
  const tx = x - dir * 12 * s, ty = y - 8 * s - bob;
  g.fillStyle(c, 1);
  g.fillEllipse(tx, ty, 12 * s, 5 * s);
  g.strokeEllipse(tx, ty, 12 * s, 5 * s);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(tx - dir * 5 * s, ty, 2 * s);
}

export function duck(g: G, x: number, y: number, dir: number, t: number) {
  const bob = Math.sin(t * 3) * 0.8;
  g.lineStyle(1.2, INK_SOFT, 0.5);
  g.beginPath(); g.arc(x - dir * 9, y + 2, 6, -0.3, 0.3 + Math.PI); g.strokePath();
  g.fillStyle(0xffffff, 1);
  g.lineStyle(1.4, INK, 1);
  g.fillEllipse(x, y - 2 + bob, 12, 6);
  g.strokeEllipse(x, y - 2 + bob, 12, 6);
  g.fillCircle(x + dir * 5, y - 7 + bob, 3);
  g.strokeCircle(x + dir * 5, y - 7 + bob, 3);
  g.fillStyle(0xd99a00, 1);
  g.fillTriangle(x + dir * 7.5, y - 8 + bob, x + dir * 7.5, y - 6 + bob, x + dir * 11, y - 7 + bob);
}

export function balloon(g: G, x: number, y: number) {
  g.fillStyle(0xd12f86, 0.9);
  g.lineStyle(2, INK, 1);
  g.fillCircle(x, y, 20);
  g.fillStyle(0xf3d36b, 1);
  g.fillEllipse(x, y, 14, 40);
  g.strokeCircle(x, y, 20);
  g.strokeEllipse(x, y, 14, 40);
  g.lineBetween(x - 15, y + 13, x - 6, y + 32);
  g.lineBetween(x + 15, y + 13, x + 6, y + 32);
  g.fillStyle(0x9b5a1f, 1);
  g.fillRect(x - 6, y + 32, 12, 9);
  g.strokeRect(x - 6, y + 32, 12, 9);
}

export function plane(g: G, x: number, y: number, s: number, tilt: number) {
  const c = Math.cos(tilt), sn = Math.sin(tilt);
  const P = (lx: number, ly: number) => new Phaser.Math.Vector2(x + (lx * c - ly * sn) * s, y + (lx * sn + ly * c) * s);
  const body = [P(-36, -3), P(30, -4), P(40, 0), P(30, 4), P(-36, 3)];
  const wing = [P(-4, 0), P(-14, 16), P(-6, 16), P(10, 0)];
  const tail = [P(-32, -2), P(-38, -14), P(-32, -14), P(-24, -2)];
  g.fillStyle(0xffffff, 1);
  g.lineStyle(1.8, INK, 1);
  for (const sh of [tail, body, wing]) {
    g.fillPoints(sh, true);
    g.strokePoints(sh, true);
  }
  g.fillStyle(0x2456c9, 1);
  for (let k = -24; k <= 18; k += 8) {
    const w = P(k, -1);
    g.fillCircle(w.x, w.y, 1.3 * s);
  }
}

export function jeep(g: G, x: number, y: number, dir: number, s: number, t: number) {
  const c = 0x7a8a1c;
  g.fillStyle(c, 1);
  g.lineStyle(1.6, INK, 1);
  g.fillRect(x - 13 * s, y - 11 * s, 26 * s, 7 * s);
  g.strokeRect(x - 13 * s, y - 11 * s, 26 * s, 7 * s);
  g.fillRect(x - dir * 6 * s - 5 * s, y - 16 * s, 10 * s, 5 * s);
  g.strokeRect(x - dir * 6 * s - 5 * s, y - 16 * s, 10 * s, 5 * s);
  for (const k of [-8, 8]) {
    g.fillStyle(INK, 1);
    g.fillCircle(x + k * s, y - 3 * s, 3.4 * s);
    g.lineStyle(1, 0xffffff, 1);
    g.lineBetween(x + k * s, y - 3 * s, x + k * s + Math.cos(t * 12) * 2.6 * s, y - 3 * s + Math.sin(t * 12) * 2.6 * s);
    g.lineStyle(1.6, INK, 1);
  }
}

/** The pirate ship, rocking on the waves (s = scale, rock = angle). */
export function ship(p: Pen, passed: boolean, t: number, ch: number) {
  const acc = ACCENTS[ch];
  p.poly([[-96, 34], [96, 34], [74, 2], [-78, 2]], 2.6, PAPER);
  p.hatchBox(-70, 6, 140, 22, 10);
  for (let x = -50; x <= 50; x += 25) p.circle(x, 20, 4, 1.6, INK);
  p.line(0, 34, 0, 160, 3);
  const puff = Math.sin(t * 1.3) * 4;
  p.poly([[4, 150], [60 + puff, 140], [56 + puff, 60], [4, 52]], 2.2, acc.soft);
  p.poly([[-4, 140], [-50 - puff * 0.5, 120], [-46 - puff * 0.5, 64], [-4, 56]], 2.2, acc.soft);
  const top = p.pt(0, 160);
  if (passed) flag(p.g, top.x, top.y - 2, 22 * p.s, acc.main, t, p.alpha);
  else {
    flag(p.g, top.x, top.y - 2, 22 * p.s, INK, t, p.alpha);
    p.g.fillStyle(0xffffff, p.alpha);
    p.g.fillCircle(top.x + 9 * p.s, top.y + 3 * p.s, 2.6 * p.s);
  }
  const wv: [number, number][] = [];
  for (let x = -116; x <= 116; x += 10) wv.push([x, Math.sin(x / 9 + t * 2) * 3 + 2]);
  p.open(wv, 1.8, acc.main);
}

export function windmill(g: G, x: number, y: number, s: number, a: number, alpha = 1) {
  g.lineStyle(2 * s, INK, alpha);
  for (let k = 0; k < 4; k++) {
    const ang = a + (k * Math.PI) / 2;
    const ex = x + Math.cos(ang) * 34 * s, ey = y + Math.sin(ang) * 34 * s;
    g.lineBetween(x, y, ex, ey);
    const nx = -Math.sin(ang) * 6 * s, ny = Math.cos(ang) * 6 * s;
    const mx = x + Math.cos(ang) * 12 * s, my = y + Math.sin(ang) * 12 * s;
    g.fillStyle(0xffffff, 0.85 * alpha);
    g.fillPoints([new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(ex, ey), new Phaser.Math.Vector2(ex + nx, ey + ny), new Phaser.Math.Vector2(mx + nx, my + ny)], true);
    g.lineStyle(1.2 * s, INK, alpha);
    g.strokePoints([new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(ex, ey), new Phaser.Math.Vector2(ex + nx, ey + ny), new Phaser.Math.Vector2(mx + nx, my + ny)], true);
    g.lineStyle(2 * s, INK, alpha);
  }
  g.fillStyle(INK, alpha);
  g.fillCircle(x, y, 3 * s);
}

export function flame(g: G, x: number, y: number, s: number, t: number, alpha = 1) {
  const f = 1 + Math.sin(t * 17 + x) * 0.15 + Math.sin(t * 7.3 + y) * 0.1;
  g.fillStyle(0xff9a1f, 0.95 * alpha);
  g.fillEllipse(x, y - 4 * s * f, 5 * s, 9 * s * f);
  g.fillStyle(0xffe27a, alpha);
  g.fillEllipse(x, y - 3 * s * f, 2.4 * s, 5 * s * f);
}

export function glow(g: G, x: number, y: number, r: number, color: number, a: number) {
  if (a <= 0.01) return;
  for (let k = 3; k >= 1; k--) {
    g.fillStyle(color, a * (0.16 / k));
    g.fillCircle(x, y, r * (0.6 + k * 0.4));
  }
}
