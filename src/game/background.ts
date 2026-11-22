import Phaser from 'phaser';
import { ARENA_LEFT, ARENA_RIGHT, GROUND_Y, HEIGHT, INK, INK_FAINT, INK_SOFT, PAPER, WIDTH } from './constants';
import type { BackgroundId } from './data';

type G = Phaser.GameObjects.Graphics;
const P = (pts: { x: number; y: number }[]) => pts as unknown as Phaser.Math.Vector2[];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A slightly wobbly "pen" line. */
function penLine(g: G, x1: number, y1: number, x2: number, y2: number, w: number, color: number, rand: () => number, alpha = 1) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(2, Math.floor(len / 40));
  g.lineStyle(w, color, alpha);
  g.beginPath();
  g.moveTo(x1, y1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const j = i === steps ? 0 : (rand() - 0.5) * 2.2;
    g.lineTo(x1 + (x2 - x1) * t + j, y1 + (y2 - y1) * t + j);
  }
  g.strokePath();
}

function hatch(g: G, poly: { x: number; y: number }[], spacing: number, color: number, alpha: number, w = 1.5) {
  // Diagonal hatching clipped to a polygon's bounding box, kept inside via point-in-polygon test per segment.
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const geom = new Phaser.Geom.Polygon(poly.map((p) => new Phaser.Math.Vector2(p.x, p.y)));
  g.lineStyle(w, color, alpha);
  for (let c = minX - (maxY - minY); c < maxX; c += spacing) {
    let inside = false;
    let sx = 0, sy = 0;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const x = c + t * (maxY - minY);
      const y = maxY - t * (maxY - minY);
      const ins = Phaser.Geom.Polygon.Contains(geom, x, y);
      if (ins && !inside) {
        sx = x;
        sy = y;
        inside = true;
      } else if (!ins && inside) {
        g.lineBetween(sx, sy, x, y);
        inside = false;
      }
    }
    if (inside) g.lineBetween(sx, sy, c + (maxY - minY), minY);
  }
}

function paper(g: G, rand: () => number) {
  g.fillStyle(PAPER, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);
  // paper grain
  for (let i = 0; i < 500; i++) {
    g.fillStyle(0x000000, 0.025 + rand() * 0.03);
    g.fillRect(rand() * WIDTH, rand() * HEIGHT, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function birds(g: G, rand: () => number, n: number) {
  g.lineStyle(2, INK_SOFT, 0.8);
  for (let i = 0; i < n; i++) {
    const x = 300 + rand() * 700, y = 80 + rand() * 140, s = 6 + rand() * 6;
    g.beginPath();
    g.moveTo(x - s, y - s * 0.4);
    g.lineTo(x, y);
    g.lineTo(x + s, y - s * 0.4);
    g.strokePath();
  }
}

function cliff(g: G) {
  const rand = rng(7);
  paper(g, rand);
  // sun
  g.lineStyle(2.5, INK_SOFT, 0.7);
  g.strokeCircle(980, 140, 46);
  // distant mountains
  const far = [{ x: 0, y: 430 }];
  for (let x = 0; x <= WIDTH; x += 80) far.push({ x, y: 360 + Math.sin(x * 0.011) * 50 + rand() * 40 });
  g.lineStyle(2, INK_FAINT, 1);
  g.strokePoints(P(far.slice(1)), false);
  const near: { x: number; y: number }[] = [];
  for (let x = 0; x <= WIDTH; x += 60) near.push({ x, y: 470 + Math.sin(x * 0.006 + 1) * 35 + rand() * 20 });
  g.lineStyle(2.5, INK_SOFT, 0.7);
  g.strokePoints(P(near), false);
  birds(g, rand, 4);
  // the big cliff on the left, like in the sketch
  const cliffPts = [
    { x: 0, y: 0 },
    { x: 170, y: 0 },
    { x: 150, y: 70 },
    { x: 120, y: 120 },
    { x: 135, y: 190 },
    { x: 95, y: 260 },
    { x: 110, y: 330 },
    { x: 80, y: 400 },
    { x: 95, y: 470 },
    { x: ARENA_LEFT, y: 540 },
    { x: ARENA_LEFT, y: GROUND_Y },
    { x: 0, y: GROUND_Y },
  ];
  g.fillStyle(0xe2e1db, 1);
  g.fillPoints(P(cliffPts), true);
  hatch(g, cliffPts, 12, INK, 0.35);
  g.lineStyle(4, INK, 1);
  g.strokePoints(P(cliffPts.slice(1, 11)), false);
  // a dead tree on top of the cliff edge / right rocks
  const rightPts = [
    { x: WIDTH, y: 260 },
    { x: 1240, y: 300 },
    { x: 1225, y: 370 },
    { x: 1235, y: 450 },
    { x: ARENA_RIGHT, y: 520 },
    { x: ARENA_RIGHT, y: GROUND_Y },
    { x: WIDTH, y: GROUND_Y },
  ];
  g.fillStyle(0xe2e1db, 1);
  g.fillPoints(P(rightPts), true);
  hatch(g, rightPts, 10, INK, 0.35);
  g.lineStyle(4, INK, 1);
  g.strokePoints(P(rightPts.slice(0, 6)), false);
  // grass tufts
  g.lineStyle(2, INK_SOFT, 0.9);
  for (let i = 0; i < 40; i++) {
    const x = ARENA_LEFT + 20 + rand() * (ARENA_RIGHT - ARENA_LEFT - 40);
    for (let k = -1; k <= 1; k++) g.lineBetween(x, GROUND_Y - 2, x + k * 4, GROUND_Y - 8 - rand() * 6);
  }
}

function deadTree(g: G, x: number, y: number, len: number, angle: number, depth: number, rand: () => number) {
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  penLine(g, x, y, x2, y2, Math.max(1.5, depth * 1.8), INK_SOFT, rand, 0.9);
  if (depth <= 0) return;
  const n = 2;
  for (let i = 0; i < n; i++) {
    deadTree(g, x2, y2, len * (0.6 + rand() * 0.2), angle + (i === 0 ? -1 : 1) * (0.35 + rand() * 0.4), depth - 1, rand);
  }
}

function graveyard(g: G) {
  const rand = rng(21);
  paper(g, rand);
  // moon
  g.fillStyle(0xffffff, 1);
  g.fillCircle(1020, 130, 50);
  g.lineStyle(2.5, INK_SOFT, 0.8);
  g.strokeCircle(1020, 130, 50);
  g.fillStyle(PAPER, 1);
  g.fillCircle(1045, 115, 44);
  // hills
  const hill: { x: number; y: number }[] = [];
  for (let x = 0; x <= WIDTH; x += 60) hill.push({ x, y: 470 + Math.sin(x * 0.008) * 30 + rand() * 10 });
  g.lineStyle(2, INK_FAINT, 1);
  g.strokePoints(P(hill), false);
  // fence
  g.lineStyle(2, INK_FAINT, 1);
  g.lineBetween(0, 500, WIDTH, 500);
  g.lineBetween(0, 530, WIDTH, 530);
  for (let x = 10; x < WIDTH; x += 26) {
    g.lineBetween(x, 488, x, 560);
    g.fillStyle(INK_FAINT, 1);
    g.fillTriangle(x - 4, 490, x + 4, 490, x, 480);
  }
  deadTree(g, 230, GROUND_Y, 110, -Math.PI / 2 - 0.1, 5, rand);
  deadTree(g, 1080, GROUND_Y, 95, -Math.PI / 2 + 0.15, 5, rand);
  // tombstones
  for (let i = 0; i < 9; i++) {
    const x = 140 + i * 120 + rand() * 40;
    const h = 40 + rand() * 30, w = 30 + rand() * 14;
    const y = GROUND_Y;
    g.fillStyle(0xe6e5df, 1);
    g.fillRoundedRect(x - w / 2, y - h, w, h + 4, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
    g.lineStyle(3, INK, 0.85);
    g.strokeRoundedRect(x - w / 2, y - h, w, h + 4, { tl: w / 2, tr: w / 2, bl: 0, br: 0 });
    if (rand() < 0.5) {
      g.lineStyle(2.5, INK, 0.8);
      g.lineBetween(x, y - h + 10, x, y - h + 30);
      g.lineBetween(x - 7, y - h + 17, x + 7, y - h + 17);
    } else {
      g.lineStyle(1.5, INK, 0.6);
      g.lineBetween(x - w / 4, y - h + 14, x + w / 4, y - h + 14);
      g.lineBetween(x - w / 4, y - h + 22, x + w / 4, y - h + 22);
    }
  }
  // crypt wall left, gate pillar right
  for (const [x0, x1] of [[0, ARENA_LEFT], [ARENA_RIGHT, WIDTH]]) {
    const pts = [{ x: x0, y: 120 }, { x: x1, y: 120 }, { x: x1, y: GROUND_Y }, { x: x0, y: GROUND_Y }];
    g.fillStyle(0xe2e1db, 1);
    g.fillPoints(P(pts), true);
    for (let y = 120; y < GROUND_Y; y += 28) {
      g.lineStyle(1.5, INK, 0.45);
      g.lineBetween(x0, y, x1, y);
      const off = ((y / 28) % 2) * 18;
      for (let x = x0 + off; x < x1; x += 36) g.lineBetween(x, y, x, y + 28);
    }
    g.lineStyle(4, INK, 1);
    g.lineBetween(x0 === 0 ? x1 : x0, 120, x0 === 0 ? x1 : x0, GROUND_Y);
    g.lineBetween(x0, 120, x1, 120);
  }
}

function castle(g: G) {
  const rand = rng(33);
  paper(g, rand);
  // distant towers
  for (let i = 0; i < 4; i++) {
    const x = 250 + i * 250 + rand() * 60, w = 70 + rand() * 30, top = 180 + rand() * 80;
    g.lineStyle(2, INK_FAINT, 1);
    g.strokeRect(x - w / 2, top, w, 460 - top);
    for (let c = 0; c < 4; c++) g.strokeRect(x - w / 2 + c * (w / 4), top - 14, w / 8, 14);
    g.fillStyle(INK_FAINT, 1);
    g.fillRect(x - 5, top + 40, 10, 22);
  }
  // inner brick wall
  g.fillStyle(0xe8e7e1, 1);
  g.fillRect(0, 380, WIDTH, GROUND_Y - 380);
  for (let y = 380; y < GROUND_Y; y += 22) {
    g.lineStyle(1.2, INK, 0.25);
    g.lineBetween(0, y, WIDTH, y);
    const off = ((y / 22) % 2) * 25;
    for (let x = off; x < WIDTH; x += 50) g.lineBetween(x, y, x, y + 22);
  }
  g.lineStyle(3, INK, 0.8);
  g.lineBetween(0, 380, WIDTH, 380);
  for (let x = 0; x < WIDTH; x += 60) {
    g.fillStyle(0xe8e7e1, 1);
    g.fillRect(x, 352, 32, 28);
    g.strokeRect(x, 352, 32, 28);
  }
  // torches
  for (const x of [330, 640, 950]) {
    // wall bracket + torch stick + flame
    g.lineStyle(3, INK, 1);
    g.lineBetween(x - 10, 482, x, 470);
    g.lineStyle(5, INK, 1);
    g.lineBetween(x, 488, x + 4, 446);
    g.fillStyle(INK, 1);
    g.fillEllipse(x + 4, 444, 14, 8);
    g.fillStyle(PAPER, 1);
    g.fillEllipse(x + 4, 430, 18, 26);
    g.lineStyle(2.5, INK, 1);
    g.beginPath();
    g.moveTo(x - 5, 440);
    g.lineTo(x - 7, 428);
    g.lineTo(x - 1, 432);
    g.lineTo(x + 3, 412);
    g.lineTo(x + 7, 428);
    g.lineTo(x + 11, 424);
    g.lineTo(x + 13, 440);
    g.strokePath();
  }
  // banners
  for (const x of [480, 800]) {
    const cloth = [{ x: x - 22, y: 398 }, { x: x + 22, y: 398 }, { x: x + 22, y: 500 }, { x, y: 480 }, { x: x - 22, y: 500 }];
    g.fillStyle(INK, 0.85);
    g.fillPoints(P(cloth), true);
    g.lineStyle(4, INK, 1);
    g.lineBetween(x - 30, 396, x + 30, 396);
    g.fillStyle(PAPER, 1);
    g.fillCircle(x, 435, 11);
    g.fillStyle(INK, 1);
    g.fillTriangle(x - 5, 441, x + 5, 441, x, 427);
  }
  // side pillars
  for (const [x0, x1] of [[0, ARENA_LEFT], [ARENA_RIGHT, WIDTH]]) {
    g.fillStyle(0xdedcd5, 1);
    g.fillRect(x0, 0, x1 - x0, GROUND_Y);
    for (let y = 0; y < GROUND_Y; y += 34) {
      g.lineStyle(1.5, INK, 0.5);
      g.lineBetween(x0, y, x1, y);
    }
    g.lineStyle(4, INK, 1);
    const edge = x0 === 0 ? x1 : x0;
    g.lineBetween(edge, 0, edge, GROUND_Y);
  }
}

/**
 * Draws once with Graphics, then bakes the result into a texture, so the thousands of
 * static pen strokes are not re-tessellated every frame.
 */
export function bake(scene: Phaser.Scene, key: string, draw: (g: G) => void, depth: number) {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, WIDTH, HEIGHT);
    g.destroy();
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(depth);
}

export function drawBackground(scene: Phaser.Scene, id: BackgroundId) {
  const bg = bake(scene, `bg-${id}`, (g) => {
    if (id === 'cliff') cliff(g);
    else if (id === 'graveyard') graveyard(g);
    else castle(g);
  }, 0);
  // Ground cover sits in front of the fighters so zombies can rise out of the earth.
  const ground = bake(scene, 'ground', (g) => {
    const rand = rng(99);
    g.fillStyle(PAPER, 1);
    g.fillRect(0, GROUND_Y + 3, WIDTH, HEIGHT - GROUND_Y);
    g.lineStyle(1.5, INK, 0.3);
    for (let i = 0; i < 90; i++) {
      const x = rand() * WIDTH, y = GROUND_Y + 14 + rand() * (HEIGHT - GROUND_Y - 20);
      g.lineBetween(x, y, x + 10 + rand() * 18, y);
    }
    for (let i = 0; i < 40; i++) {
      const x = rand() * WIDTH, y = GROUND_Y + 10 + rand() * (HEIGHT - GROUND_Y - 14);
      g.strokeCircle(x, y, 1.5 + rand() * 2.5);
    }
    penLine(g, 0, GROUND_Y + 1, WIDTH, GROUND_Y + 1, 4, INK, rand);
  }, 50);
  return { bg, ground };
}
