import { ACCENTS, ARENA_LEFT, ARENA_RIGHT, GROUND_Y, HEIGHT, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH } from './constants';
import { P, castle, cliff, deadTree, graveyard, hatch, paper, penLine, rng, type G } from './background';
import { CAMPS, PLACES, chapterOfPlace, type PlaceDef, type Platform } from './places';
import { paintV5 } from './placeArt5';

/** Accent of the place being painted (each chapter has its own colour). */
let ACCENT = ACCENTS[0].main;

const GY = GROUND_Y;
const STONE = 0xe2e1db;
const DARK = 0x5a5a5a;

// ---------------------------------------------------------------- shared props

export function sideWalls(g: G, style: 'rock' | 'stone' | 'none') {
  if (style === 'none') return;
  for (const [x0, x1] of [[0, ARENA_LEFT], [ARENA_RIGHT, WIDTH]]) {
    const pts = [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: GY }, { x: x0, y: GY }];
    g.fillStyle(style === 'rock' ? 0xdcdbd4 : STONE, 1);
    g.fillPoints(P(pts), true);
    if (style === 'rock') hatch(g, pts, 11, INK, 0.3);
    else for (let y = 0; y < GY; y += 30) { g.lineStyle(1.5, INK, 0.45); g.lineBetween(x0, y, x1, y); }
    g.lineStyle(4, INK, 1);
    const edge = x0 === 0 ? x1 : x0;
    g.lineBetween(edge, 0, edge, GY);
  }
}

export function ledge(g: G, p: Platform, style: 'rock' | 'stone' | 'wood') {
  const l = p.x - p.w / 2, r = p.x + p.w / 2;
  if (style === 'wood') {
    g.fillStyle(0xd8cfc0, 1);
    g.fillRect(l, p.y, p.w, 12);
    g.lineStyle(3, INK, 1);
    g.strokeRect(l, p.y, p.w, 12);
    g.lineStyle(2, INK, 0.8);
    g.lineBetween(l + 12, p.y + 12, l + 28, p.y + 40);
    g.lineBetween(r - 12, p.y + 12, r - 28, p.y + 40);
    for (let x = l + 30; x < r; x += 30) g.lineBetween(x, p.y + 2, x, p.y + 10);
    return;
  }
  const pts = [
    { x: l - 6, y: p.y }, { x: r + 6, y: p.y }, { x: r - 4, y: p.y + 14 }, { x: r - 18, y: p.y + 26 },
    { x: p.x + 10, y: p.y + 34 }, { x: l + 20, y: p.y + 24 }, { x: l, y: p.y + 12 },
  ];
  g.fillStyle(style === 'rock' ? 0xdcdbd4 : STONE, 1);
  g.fillPoints(P(pts), true);
  if (style === 'rock') hatch(g, pts, 8, INK, 0.35);
  else { g.lineStyle(1.2, INK, 0.4); g.lineBetween(l, p.y + 12, r, p.y + 12); }
  g.lineStyle(3.5, INK, 1);
  g.strokePoints(P(pts), true);
}

export function caveArch(g: G, x: number, w = 120, h = 170) {
  const pts: { x: number; y: number }[] = [{ x: x - w / 2, y: GY }];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (Math.PI * i) / 10;
    pts.push({ x: x + Math.cos(a) * (w / 2) + (i % 2 ? 4 : -3), y: GY - h + w / 2 + Math.sin(a) * (w / 2) + (i % 3) * 3 });
  }
  pts.push({ x: x + w / 2, y: GY });
  g.fillStyle(DARK, 1);
  g.fillPoints(P(pts), true);
  g.lineStyle(5, INK, 1);
  g.strokePoints(P(pts.slice(0, -1)), false);
}

export function woodDoor(g: G, x: number, w: number, h: number) {
  g.fillStyle(0xd6cdbd, 1);
  g.fillRoundedRect(x - w / 2, GY - h, w, h, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(x - w / 2, GY - h, w, h, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
  g.lineStyle(1.5, INK, 0.6);
  for (let px = x - w / 2 + w / 4; px < x + w / 2; px += w / 4) g.lineBetween(px, GY - h + 12, px, GY);
  g.fillStyle(INK, 1);
  g.fillCircle(x + w * 0.3, GY - h * 0.45, 3.5);
}

function crypt(g: G, x: number) {
  const w = 170, h = 190;
  g.fillStyle(STONE, 1);
  g.fillRect(x - w / 2, GY - h, w, h);
  g.fillTriangle(x - w / 2 - 14, GY - h, x + w / 2 + 14, GY - h, x, GY - h - 60);
  g.lineStyle(4, INK, 1);
  g.strokeRect(x - w / 2, GY - h, w, h);
  g.strokeTriangle(x - w / 2 - 14, GY - h, x + w / 2 + 14, GY - h, x, GY - h - 60);
  g.lineStyle(2.5, INK, 0.8);
  g.lineBetween(x, GY - h - 50, x, GY - h - 20);
  g.lineBetween(x - 9, GY - h - 40, x + 9, GY - h - 40);
  for (const cx of [x - w / 2 + 16, x + w / 2 - 16]) { g.lineStyle(3, INK, 0.8); g.lineBetween(cx, GY - h, cx, GY); }
  woodDoor(g, x, 76, 120);
}

function coffinHole(g: G, x: number) {
  // dirt mound behind and a coffin lid leaning on it
  g.fillStyle(0xd9d6cc, 1);
  g.fillEllipse(x, GY - 6, 170, 46);
  g.lineStyle(3, INK, 0.9);
  g.strokeEllipse(x, GY - 6, 170, 46);
  g.lineStyle(1.5, INK, 0.4);
  for (let i = -3; i <= 3; i++) g.strokeCircle(x + i * 20, GY - 10 - Math.abs(i) * 2, 2);
  const lid = [{ x: x - 30, y: GY - 6 }, { x: x - 44, y: GY - 70 }, { x: x - 30, y: GY - 112 }, { x: x - 6, y: GY - 112 }, { x: x + 8, y: GY - 70 }, { x: x - 6, y: GY - 6 }];
  g.fillStyle(0xcfc6b4, 1);
  g.fillPoints(P(lid), true);
  g.lineStyle(3.5, INK, 1);
  g.strokePoints(P(lid), true);
  g.lineStyle(2.5, INK, 0.9);
  g.lineBetween(x - 18, GY - 90, x - 18, GY - 50);
  g.lineBetween(x - 30, GY - 78, x - 6, GY - 78);
}

export function barrel(g: G, x: number) {
  const w = 70, h = 92;
  g.fillStyle(0xd8cfc0, 1);
  g.fillEllipse(x, GY - h / 2, w, h);
  g.fillRect(x - w / 2 + 4, GY - h + 8, w - 8, h - 8);
  g.lineStyle(3.5, INK, 1);
  g.strokeRect(x - w / 2 + 4, GY - h + 8, w - 8, h - 8);
  g.strokeEllipse(x, GY - h + 8, w - 8, 16);
  g.lineStyle(3, INK, 0.9);
  for (const y of [GY - h + 26, GY - 22]) g.lineBetween(x - w / 2 + 4, y, x + w / 2 - 4, y);
  g.lineStyle(1.2, INK, 0.5);
  for (let px = x - 18; px <= x + 18; px += 12) g.lineBetween(px, GY - h + 16, px, GY - 4);
}

export function cabinet(g: G, x: number) {
  const w = 110, h = 200;
  g.fillStyle(0xd6cdbd, 1);
  g.fillRect(x - w / 2, GY - h, w, h);
  g.lineStyle(4, INK, 1);
  g.strokeRect(x - w / 2, GY - h, w, h);
  g.lineBetween(x, GY - h + 10, x, GY - 10);
  g.lineStyle(4, INK, 1);
  g.lineBetween(x - w / 2 - 8, GY - h, x + w / 2 + 8, GY - h);
  g.fillStyle(INK, 1);
  g.fillCircle(x - 8, GY - h / 2, 3);
  g.fillCircle(x + 8, GY - h / 2, 3);
  g.lineStyle(1.5, INK, 0.5);
  g.strokeRect(x - w / 2 + 10, GY - h + 14, w / 2 - 18, h - 28);
  g.strokeRect(x + 8, GY - h + 14, w / 2 - 18, h - 28);
}

function armorStand(g: G, x: number) {
  g.lineStyle(4, INK, 1);
  g.lineBetween(x, GY, x, GY - 120);
  g.lineBetween(x - 26, GY, x + 26, GY);
  // cuirass
  g.fillStyle(0xd0d0cc, 1);
  const body = [{ x: x - 24, y: GY - 120 }, { x: x + 24, y: GY - 120 }, { x: x + 18, y: GY - 70 }, { x: x - 18, y: GY - 70 }];
  g.fillPoints(P(body), true);
  g.lineStyle(3.5, INK, 1);
  g.strokePoints(P(body), true);
  g.lineBetween(x, GY - 118, x, GY - 74);
  // helmet
  g.fillStyle(0xd0d0cc, 1);
  g.fillCircle(x, GY - 138, 16);
  g.strokeCircle(x, GY - 138, 16);
  g.fillStyle(INK, 1);
  g.fillRect(x - 10, GY - 140, 20, 4);
  g.lineStyle(3, INK, 1);
  g.lineBetween(x, GY - 154, x - 10, GY - 170);
}

function throne(g: G, x: number) {
  g.fillStyle(STONE, 1);
  g.fillRect(x - 160, GY - 30, 320, 30);
  g.lineStyle(3, INK, 1);
  g.strokeRect(x - 160, GY - 30, 320, 30);
  g.strokeRect(x - 120, GY - 52, 240, 22);
  const back = [{ x: x - 60, y: GY - 52 }, { x: x - 60, y: GY - 240 }, { x: x - 30, y: GY - 270 }, { x: x, y: GY - 250 }, { x: x + 30, y: GY - 270 }, { x: x + 60, y: GY - 240 }, { x: x + 60, y: GY - 52 }];
  g.fillStyle(0x3a3a3a, 1);
  g.fillPoints(P(back), true);
  g.lineStyle(4, INK, 1);
  g.strokePoints(P(back), true);
  g.fillStyle(PAPER, 1);
  g.fillTriangle(x - 14, GY - 200, x + 14, GY - 200, x, GY - 228);
  g.fillCircle(x, GY - 180, 6);
}

function gothicWindow(g: G, x: number, y: number, w = 64, h = 130) {
  g.fillStyle(0x3a3a3a, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
  g.lineStyle(4, INK, 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
  g.lineStyle(2, PAPER, 0.5);
  g.lineBetween(x, y - h / 2 + 10, x, y + h / 2);
  g.lineBetween(x - w / 2, y + 6, x + w / 2, y + 6);
  g.lineStyle(4, INK, 1);
  g.lineBetween(x - w / 2 - 8, y + h / 2, x + w / 2 + 8, y + h / 2);
}

export function stoneWall(g: G, top: number, bottom: number, brickH = 26, alpha = 0.3) {
  g.fillStyle(0xe6e5df, 1);
  g.fillRect(0, top, WIDTH, bottom - top);
  for (let y = top; y < bottom; y += brickH) {
    g.lineStyle(1.2, INK, alpha);
    g.lineBetween(0, y, WIDTH, y);
    const off = ((Math.round((y - top) / brickH)) % 2) * 28;
    for (let x = off; x < WIDTH; x += 56) g.lineBetween(x, y, x, y + brickH);
  }
}

export function moon(g: G, x: number, y: number) {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x, y, 46);
  g.lineStyle(2.5, INK_SOFT, 0.8);
  g.strokeCircle(x, y, 46);
  g.fillStyle(PAPER, 1);
  g.fillCircle(x + 24, y - 14, 40);
  // a thin accent rim on the lit edge
  g.lineStyle(3, ACCENT, 0.8);
  g.beginPath();
  g.arc(x, y, 50, 1.9, 4.3, false);
  g.strokePath();
}

export function hills(g: G, rand: () => number, y0: number, amp: number, color = INK_FAINT) {
  const pts: { x: number; y: number }[] = [];
  for (let x = 0; x <= WIDTH; x += 60) pts.push({ x, y: y0 + Math.sin(x * 0.007) * amp + rand() * amp * 0.4 });
  g.lineStyle(2, color, 1);
  g.strokePoints(P(pts), false);
}

// ---------------------------------------------------------------- places

/** Level 0: a quiet place before the chapter, with a signpost. */
function camp(g: G, p: PlaceDef, scenery: (g: G) => void, style: 'rock' | 'stone') {
  scenery(g);
  for (const pl of p.platforms) ledge(g, pl, style);
  // signpost pointing on
  g.lineStyle(5, INK, 1);
  g.lineBetween(1110, GY, 1110, GY - 120);
  const sign = [{ x: 1060, y: GY - 120 }, { x: 1150, y: GY - 120 }, { x: 1172, y: GY - 102 }, { x: 1150, y: GY - 84 }, { x: 1060, y: GY - 84 }];
  g.fillStyle(0xf7f7f2, 1);
  g.fillPoints(P(sign), true);
  g.lineStyle(3.5, INK, 1);
  g.strokePoints(P(sign), true);
  g.lineStyle(3, ACCENT, 1);
  g.lineBetween(1080, GY - 102, 1140, GY - 102);
  g.lineBetween(1140, GY - 102, 1128, GY - 112);
  g.lineBetween(1140, GY - 102, 1128, GY - 92);
}

const painters: Record<string, (g: G, p: PlaceDef) => void> = {
  trailhead: (g, p) => camp(g, p, cliff, 'rock'),
  graveLane: (g, p) => camp(g, p, graveyard, 'stone'),
  castleRoad: (g, p) => camp(g, p, castle, 'stone'),
  cliffFoot: (g, p) => {
    cliff(g);
    ledge(g, p.platforms[0], 'rock');
  },
  caveDoor: (g, p) => {
    const rand = rng(41);
    paper(g, rand);
    hills(g, rand, 300, 40);
    // a big rock face fills the back, with two cave mouths
    const face = [{ x: 0, y: GY }, { x: 0, y: 200 }, { x: 180, y: 150 }, { x: 420, y: 190 }, { x: 640, y: 120 }, { x: 900, y: 170 }, { x: 1120, y: 140 }, { x: WIDTH, y: 190 }, { x: WIDTH, y: GY }];
    g.fillStyle(0xe0dfd8, 1);
    g.fillPoints(P(face), true);
    hatch(g, face, 14, INK, 0.22);
    g.lineStyle(4, INK, 1);
    g.strokePoints(P(face.slice(1, -1)), false);
    for (const s of p.spots) caveArch(g, s.x, 130, 180);
    sideWalls(g, 'rock');
    ledge(g, p.platforms[0], 'rock');
  },
  caveInside: (g, p) => {
    const rand = rng(43);
    g.fillStyle(0xd3d2cb, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 160; i++) {
      g.lineStyle(1.5, INK, 0.12 + rand() * 0.15);
      const x = rand() * WIDTH, y = rand() * GY;
      g.lineBetween(x, y, x + 10 + rand() * 30, y + (rand() - 0.5) * 12);
    }
    // stalactites
    for (let x = 90; x < WIDTH - 60; x += 46 + rand() * 40) {
      const h = 30 + rand() * 90;
      g.fillStyle(0xbdbcb5, 1);
      g.fillTriangle(x - 14, 0, x + 14, 0, x + (rand() - 0.5) * 8, h);
      g.lineStyle(3, INK, 1);
      g.strokeTriangle(x - 14, 0, x + 14, 0, x, h);
    }
    for (let x = 140; x < WIDTH - 100; x += 120 + rand() * 120) {
      g.fillStyle(0xbdbcb5, 1);
      g.fillTriangle(x - 16, GY, x + 16, GY, x, GY - 26 - rand() * 20);
      g.lineStyle(3, INK, 1);
      g.strokeTriangle(x - 16, GY, x + 16, GY, x, GY - 30);
    }
    sideWalls(g, 'rock');
    for (const pl of p.platforms) ledge(g, pl, 'rock');
  },
  cliffPath: (g, p) => {
    const rand = rng(47);
    paper(g, rand);
    g.lineStyle(2.5, INK_SOFT, 0.7);
    g.strokeCircle(260, 130, 40);
    // valley far below: tiny hills, trees and a river
    hills(g, rand, 520, 18);
    hills(g, rand, 555, 10, INK_SOFT);
    for (let i = 0; i < 26; i++) {
      const x = rand() * WIDTH, y = 535 + rand() * 40;
      g.lineStyle(1.5, INK_FAINT, 1);
      g.lineBetween(x, y, x, y - 8);
      g.strokeCircle(x, y - 11, 3);
    }
    // wooden railing along the path
    for (let x = ARENA_LEFT + 20; x < ARENA_RIGHT; x += 110) {
      g.lineStyle(5, INK, 1);
      g.lineBetween(x, GY, x, GY - 60);
    }
    g.lineStyle(3, INK, 0.9);
    for (let x = ARENA_LEFT + 20; x < ARENA_RIGHT - 110; x += 110) {
      g.beginPath();
      g.moveTo(x, GY - 52);
      g.lineTo(x + 55, GY - 40);
      g.lineTo(x + 110, GY - 52);
      g.strokePath();
    }
    // rock wall on the right with an outcrop (the heart ledge)
    const wall = [{ x: WIDTH, y: 60 }, { x: 1100, y: 140 }, { x: 1150, y: 300 }, { x: 1080, y: 420 }, { x: ARENA_RIGHT, y: GY }, { x: WIDTH, y: GY }];
    g.fillStyle(0xdcdbd4, 1);
    g.fillPoints(P(wall), true);
    hatch(g, wall, 11, INK, 0.3);
    g.lineStyle(4, INK, 1);
    g.strokePoints(P(wall.slice(0, 5)), false);
    sideWalls(g, 'none');
    ledge(g, p.platforms[0], 'rock');
  },
  summit: (g, p) => {
    const rand = rng(53);
    paper(g, rand);
    // lower peaks far away
    const peaks = [{ x: 0, y: 520 }, { x: 150, y: 430 }, { x: 300, y: 500 }, { x: 470, y: 400 }, { x: 640, y: 480 }, { x: 820, y: 390 }, { x: 1000, y: 470 }, { x: 1150, y: 420 }, { x: WIDTH, y: 500 }];
    g.lineStyle(2, INK_FAINT, 1);
    g.strokePoints(P(peaks), false);
    for (const pk of peaks.slice(1, -1)) g.lineBetween(pk.x, pk.y, pk.x - 12, pk.y + 16);
    // flag on the summit
    g.lineStyle(5, INK, 1);
    g.lineBetween(640, GY, 640, GY - 300);
    const flag = [{ x: 640, y: GY - 300 }, { x: 740, y: GY - 284 }, { x: 712, y: GY - 262 }, { x: 744, y: GY - 240 }, { x: 640, y: GY - 248 }];
    g.fillStyle(INK, 0.9);
    g.fillPoints(P(flag), true);
    // edges of the mountain on both sides
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? ARENA_LEFT : ARENA_RIGHT;
      const pts = [{ x: x0, y: GY }, { x: x0 - side * 0, y: GY + 4 }, { x: side < 0 ? 0 : WIDTH, y: GY + 120 }, { x: side < 0 ? 0 : WIDTH, y: GY }];
      g.fillStyle(0xdcdbd4, 1);
      g.fillPoints(P(pts), true);
    }
    sideWalls(g, 'none');
    ledge(g, p.platforms[0], 'rock');
  },
  graveGates: (g, p) => {
    graveyard(g);
    ledge(g, p.platforms[0], 'stone');
  },
  crypts: (g, p) => {
    const rand = rng(61);
    paper(g, rand);
    moon(g, 1060, 110);
    hills(g, rand, 430, 20);
    for (const s of p.spots) crypt(g, s.x);
    deadTree(g, 470, GY, 70, -Math.PI / 2 - 0.15, 4, rand);
    deadTree(g, 820, GY, 80, -Math.PI / 2 + 0.2, 4, rand);
    sideWalls(g, 'stone');
    ledge(g, p.platforms[0], 'stone');
  },
  chapel: (g, p) => {
    const rand = rng(67);
    paper(g, rand);
    // chapel wall with a bell tower in the middle
    g.fillStyle(0xe6e5df, 1);
    g.fillRect(150, 180, 980, GY - 180);
    g.fillTriangle(130, 180, 1150, 180, 640, 60);
    g.lineStyle(4, INK, 1);
    g.strokeRect(150, 180, 980, GY - 180);
    g.strokeTriangle(130, 180, 1150, 180, 640, 60);
    g.fillStyle(0xe6e5df, 1);
    g.fillRect(585, 20, 110, 160);
    g.strokeRect(585, 20, 110, 160);
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(605, 40, 70, 80, { tl: 35, tr: 35, bl: 0, br: 0 });
    g.fillStyle(PAPER, 1);
    g.fillTriangle(622, 100, 658, 100, 640, 62);
    for (const s of p.spots) gothicWindow(g, s.x, s.y + 20);
    woodDoor(g, 640, 90, 130);
    deadTree(g, 100, GY, 60, -Math.PI / 2, 3, rand);
    sideWalls(g, 'stone');
    ledge(g, p.platforms[0], 'wood');
    void rand;
  },
  openGraves: (g, p) => {
    const rand = rng(71);
    paper(g, rand);
    moon(g, 200, 120);
    hills(g, rand, 470, 25);
    deadTree(g, 655, GY - 180, 60, -Math.PI / 2, 3, rand);
    for (const s of p.spots) coffinHole(g, s.x);
    sideWalls(g, 'stone');
    ledge(g, p.platforms[0], 'stone');
  },
  mausoleum: (g, p) => {
    const rand = rng(73);
    paper(g, rand);
    moon(g, 1080, 100);
    const x = 640, w = 420, h = 260;
    g.fillStyle(0xe6e5df, 1);
    g.fillRect(x - w / 2, GY - h, w, h);
    g.fillTriangle(x - w / 2 - 30, GY - h, x + w / 2 + 30, GY - h, x, GY - h - 90);
    g.lineStyle(4, INK, 1);
    g.strokeRect(x - w / 2, GY - h, w, h);
    g.strokeTriangle(x - w / 2 - 30, GY - h, x + w / 2 + 30, GY - h, x, GY - h - 90);
    for (let i = 0; i < 6; i++) {
      const cx = x - w / 2 + 30 + i * ((w - 60) / 5);
      if (Math.abs(cx - x) < 60) continue;
      g.lineStyle(3, INK, 0.9);
      g.strokeRect(cx - 12, GY - h + 10, 24, h - 10);
    }
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(x - 55, GY - 170, 110, 170, { tl: 55, tr: 55, bl: 0, br: 0 });
    for (const pl of p.platforms) {
      // statue plinths under the ledges
      g.fillStyle(STONE, 1);
      g.fillRect(pl.x - 26, pl.y + 30, 52, GY - pl.y - 30);
      g.lineStyle(3, INK, 1);
      g.strokeRect(pl.x - 26, pl.y + 30, 52, GY - pl.y - 30);
      ledge(g, pl, 'stone');
    }
    sideWalls(g, 'stone');
    void rand;
  },
  moat: (g, p) => {
    const rand = rng(79);
    paper(g, rand);
    // castle wall and gate tower in the back
    stoneWall(g, 260, GY - 70, 26, 0.25);
    for (let x = 0; x < WIDTH; x += 60) {
      g.fillStyle(0xe6e5df, 1);
      g.fillRect(x, 232, 32, 28);
      g.lineStyle(3, INK, 0.8);
      g.strokeRect(x, 232, 32, 28);
    }
    g.fillStyle(DARK, 1);
    g.fillRoundedRect(1010, 330, 130, GY - 400, { tl: 65, tr: 65, bl: 0, br: 0 });
    // the moat: wavy water lines right above the ground line
    g.fillStyle(0xd7d6d0, 1);
    g.fillRect(0, GY - 70, WIDTH, 70);
    for (let y = GY - 60; y < GY; y += 14) {
      g.lineStyle(2, INK, 0.45);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= WIDTH; x += 30) g.lineTo(x, y + (x / 30) % 2 * 5);
      g.strokePath();
    }
    sideWalls(g, 'stone');
    ledge(g, p.platforms[0], 'stone');
  },
  courtyard: (g, p) => {
    castle(g);
    for (const s of p.spots) barrel(g, s.x);
    ledge(g, p.platforms[0], 'wood');
  },
  armory: (g, p) => {
    stoneWall(g, 0, GY);
    // weapon racks
    for (const rx of [360, 920]) {
      g.lineStyle(4, INK, 1);
      g.lineBetween(rx - 70, 230, rx + 70, 230);
      for (let i = -2; i <= 2; i++) {
        g.lineStyle(3, INK, 1);
        g.lineBetween(rx + i * 26, 190, rx + i * 26, 330);
        g.fillStyle(INK, 1);
        g.fillTriangle(rx + i * 26 - 6, 190, rx + i * 26 + 6, 190, rx + i * 26, 168);
      }
    }
    // a shield on the wall
    g.fillStyle(0xd0d0cc, 1);
    g.fillCircle(640, 160, 44);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(640, 160, 44);
    g.lineBetween(640, 118, 640, 202);
    g.lineBetween(598, 160, 682, 160);
    for (const s of p.spots) (s.kind === 'cabinet' ? cabinet : armorStand)(g, s.x);
    sideWalls(g, 'stone');
    ledge(g, p.platforms[0], 'wood');
  },
  ramparts: (g, p) => {
    const rand = rng(83);
    paper(g, rand);
    hills(g, rand, 440, 30);
    // towers left and right, walkway battlements behind
    for (const tx of [210, 1070]) {
      g.fillStyle(0xe6e5df, 1);
      g.fillRect(tx - 70, 120, 140, GY - 120);
      g.lineStyle(4, INK, 1);
      g.strokeRect(tx - 70, 120, 140, GY - 120);
      for (let c = 0; c < 4; c++) {
        g.fillStyle(0xe6e5df, 1);
        g.fillRect(tx - 70 + c * 40, 96, 22, 24);
        g.strokeRect(tx - 70 + c * 40, 96, 22, 24);
      }
      g.fillStyle(DARK, 1);
      g.fillRoundedRect(tx - 14, 180, 28, 48, { tl: 14, tr: 14, bl: 0, br: 0 });
    }
    for (let x = 0; x < WIDTH; x += 64) {
      g.fillStyle(0xe6e5df, 1);
      g.fillRect(x, GY - 70, 40, 70);
      g.lineStyle(3, INK, 0.9);
      g.strokeRect(x, GY - 70, 40, 70);
    }
    sideWalls(g, 'none');
    for (const pl of p.platforms) ledge(g, pl, 'stone');
  },
  throne: (g, p) => {
    stoneWall(g, 0, GY, 30, 0.22);
    // columns and long banners
    for (const cx of [160, 400, 880, 1120]) {
      g.fillStyle(0xe6e5df, 1);
      g.fillRect(cx - 24, 60, 48, GY - 60);
      g.lineStyle(3.5, INK, 1);
      g.strokeRect(cx - 24, 60, 48, GY - 60);
      g.strokeRect(cx - 34, 46, 68, 14);
    }
    for (const bx of [520, 760]) {
      const cloth = [{ x: bx - 30, y: 70 }, { x: bx + 30, y: 70 }, { x: bx + 30, y: 300 }, { x: bx, y: 270 }, { x: bx - 30, y: 300 }];
      g.fillStyle(INK, 0.85);
      g.fillPoints(P(cloth), true);
      g.fillStyle(PAPER, 1);
      g.fillCircle(bx, 130, 14);
    }
    // carpet stripes to the throne
    g.fillStyle(0xcfcfca, 1);
    g.fillRect(580, GY - 30, 120, 30);
    throne(g, 640);
    sideWalls(g, 'stone');
    for (const pl of p.platforms) ledge(g, pl, 'stone');
  },
};

export function drawPlace(g: G, place: PlaceDef) {
  const chapter = chapterOfPlace(place.id);
  ACCENT = ACCENTS[chapter].main;
  if (painters[place.id]) painters[place.id](g, place);
  else paintV5(g, place, chapter, CAMPS[chapter]?.id === place.id ? -1 : PLACES[chapter].findIndex((q) => q.id === place.id), ACCENT);
  // Accent touches: a thin coloured line along each ledge top, next to the ink outline.
  for (const pl of place.platforms) {
    g.lineStyle(2.5, ACCENT, 0.85);
    g.lineBetween(pl.x - pl.w / 2 + 4, pl.y + 4, pl.x + pl.w / 2 - 4, pl.y + 4);
  }
  // a little pen grain over everything so all places share the paper look
  const rand = rng(5);
  for (let i = 0; i < 120; i++) {
    g.fillStyle(0x000000, 0.03);
    g.fillRect(rand() * WIDTH, rand() * GY, 2, 2);
  }
  void penLine;
}
