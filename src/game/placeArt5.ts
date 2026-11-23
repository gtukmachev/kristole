import { ARENA_LEFT, ARENA_RIGHT, GROUND_Y, HEIGHT, INK, INK_FAINT, INK_SOFT, WIDTH } from './constants';
import { P, hatch, paper, penLine, rng, type G } from './background';
import { barrel, cabinet, caveArch, hills, ledge, sideWalls, stoneWall } from './placeArt';
import type { PlaceDef, Spot } from './places';

/**
 * Backgrounds of the v5 chapters: stadium, army base, village, pirate ship, mall, burger place, airport.
 * Each chapter has one painter; `lvl` (0..4, -1 = level 0 camp) picks the place inside the chapter.
 */
const GY = GROUND_Y;
const LIGHT = 0xe6e5df;
const MID = 0xd2d1ca;
const DARK = 0x5a5a5a;

const rect = (g: G, x: number, y: number, w: number, h: number, fill: number, lw = 3, a = 1) => {
  g.fillStyle(fill, a);
  g.fillRect(x, y, w, h);
  if (lw > 0) {
    g.lineStyle(lw, INK, 1);
    g.strokeRect(x, y, w, h);
  }
};
const poly = (g: G, pts: { x: number; y: number }[], fill: number, lw = 3) => {
  g.fillStyle(fill, 1);
  g.fillPoints(P(pts), true);
  if (lw > 0) {
    g.lineStyle(lw, INK, 1);
    g.strokePoints(P(pts), true);
  }
};

/** A plain door (steel / wood / glass) standing on the ground at x. */
function door(g: G, x: number, style: 'steel' | 'wood' | 'glass', accent: number, w = 84, h = 130) {
  rect(g, x - w / 2 - 8, GY - h - 8, w + 16, h + 8, MID, 3);
  if (style === 'glass') {
    rect(g, x - w / 2, GY - h, w / 2, h, 0xf4f4f0, 2.5);
    rect(g, x, GY - h, w / 2, h, 0xf4f4f0, 2.5);
    g.lineStyle(2, INK_FAINT, 1);
    g.lineBetween(x - w / 2 + 8, GY - h + 20, x - 12, GY - h + 50);
    g.lineBetween(x + 8, GY - h + 20, x + w / 2 - 12, GY - h + 50);
  } else {
    rect(g, x - w / 2, GY - h, w, h, style === 'wood' ? 0xd6cdbd : 0xcfd0cc, 3.5);
    g.lineStyle(1.5, INK, 0.5);
    if (style === 'wood') for (let px = x - w / 4; px < x + w / 2; px += w / 4) g.lineBetween(px, GY - h + 6, px, GY);
    else for (const yy of [GY - h + 30, GY - 40]) g.strokeRect(x - w / 2 + 10, yy - 14, w - 20, 26);
    g.fillStyle(INK, 1);
    g.fillCircle(x + w * 0.32, GY - h * 0.45, 4);
  }
  g.lineStyle(3, accent, 0.9);
  g.lineBetween(x - w / 2 - 8, GY - h - 14, x + w / 2 + 8, GY - h - 14);
}

function spots(_g: G, p: PlaceDef, f: (s: Spot) => void) {
  for (const s of p.spots) if (s.y === GY) f(s);
}

function sky(g: G, seed: number, hillsY = 420) {
  const rand = rng(seed);
  paper(g, rand);
  hills(g, rand, hillsY, 30);
  return rand;
}

function cloud(g: G, x: number, y: number, s = 1) {
  g.fillStyle(0xffffff, 0.8);
  for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 30], [58, 0, 24]] as const) g.fillCircle(x + dx * s, y + dy * s, r * s);
  g.lineStyle(2, INK_FAINT, 1);
  for (const [dx, dy, r] of [[0, 0, 26], [28, -10, 30], [58, 0, 24]] as const) g.strokeCircle(x + dx * s, y + dy * s, r * s);
}

// ---------------------------------------------------------------- stadium

function crowd(g: G, top: number, rows: number, rand: () => number) {
  for (let r = 0; r < rows; r++) {
    const y = top + r * 34;
    rect(g, 0, y, WIDTH, 34, r % 2 ? LIGHT : MID, 0);
    g.lineStyle(1.5, INK, 0.5);
    g.lineBetween(0, y + 34, WIDTH, y + 34);
    for (let x = 10 + (r % 2) * 14; x < WIDTH; x += 28) {
      if (rand() < 0.35) continue;
      g.fillStyle(INK_SOFT, 0.45);
      g.fillCircle(x, y + 12, 6);
      g.fillRect(x - 6, y + 18, 12, 14);
    }
  }
}

function floodlight(g: G, x: number, accent: number) {
  g.lineStyle(5, INK, 1);
  g.lineBetween(x, GY, x, 90);
  rect(g, x - 40, 50, 80, 44, 0xffffff, 3);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle(i === 1 && j === 0 ? accent : INK_FAINT, 1);
    g.fillCircle(x - 28 + i * 19, 62 + j * 20, 6);
  }
}

function stadium(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = sky(g, 300 + lvl, 380);
  if (lvl === 0 || lvl === -1) {
    // the stadium wall with its arch gates
    rect(g, 0, 170, WIDTH, GY - 170, LIGHT, 4);
    for (let x = 40; x < WIDTH; x += 120) {
      g.lineStyle(2, INK, 0.4);
      g.strokeRoundedRect(x, 200, 80, 90, { tl: 40, tr: 40, bl: 0, br: 0 });
    }
    g.lineStyle(4, accent, 1);
    g.lineBetween(0, 312, WIDTH, 312);
    floodlight(g, 160, accent);
    floodlight(g, 1120, accent);
    spots(g, p, (s) => door(g, s.x, 'steel', accent, 100, 150));
  } else {
    crowd(g, 120, lvl === 4 ? 9 : 6, rand);
    if (lvl !== 2 && lvl !== 3) {
      floodlight(g, 120, accent);
      floodlight(g, 1160, accent);
    }
    // board along the field
    rect(g, 0, GY - 70, WIDTH, 40, 0xffffff, 3);
    for (let x = 30; x < WIDTH; x += 200) {
      g.lineStyle(4, accent, 0.9);
      g.lineBetween(x, GY - 50, x + 120, GY - 50);
    }
  }
  if (lvl === 1) {
    // goals at both ends + pitch markings
    for (const [x, dir] of [[ARENA_LEFT + 10, 1], [ARENA_RIGHT - 10, -1]] as const) {
      g.lineStyle(6, INK, 1);
      g.lineBetween(x, GY, x, GY - 140);
      g.lineBetween(x, GY - 140, x + dir * 90, GY - 140);
      g.lineBetween(x + dir * 90, GY - 140, x + dir * 90, GY);
      g.lineStyle(1.2, INK, 0.5);
      for (let k = 10; k < 90; k += 12) g.lineBetween(x + dir * k, GY - 140, x + dir * k, GY);
      for (let k = GY - 130; k < GY; k += 12) g.lineBetween(x, k, x + dir * 90, k);
    }
    g.lineStyle(3, 0xffffff, 1);
    g.strokeEllipse(WIDTH / 2, GY - 6, 300, 14);
  }
  if (lvl === 2) {
    // hoops on both sides, balconies the zombies jump from
    for (const [x, dir] of [[ARENA_LEFT + 20, 1], [ARENA_RIGHT - 20, -1]] as const) {
      g.lineStyle(7, INK, 1);
      g.lineBetween(x, GY, x, GY - 300);
      g.lineBetween(x, GY - 300, x + dir * 50, GY - 300);
      rect(g, x + dir * 50 - (dir < 0 ? 12 : 0), GY - 350, 12, 80, 0xffffff, 3);
      g.lineStyle(4, accent, 1);
      g.strokeEllipse(x + dir * 84, GY - 290, 56, 12);
      g.lineStyle(1.5, INK, 0.7);
      for (let k = -24; k <= 24; k += 12) g.lineBetween(x + dir * 84 + k, GY - 288, x + dir * 84 + k * 0.6, GY - 250);
    }
    for (const s of p.spots) rect(g, s.x - 70, s.y, 140, 10, MID, 3);
  }
  if (lvl === 3) {
    // badminton net + locker doors
    g.lineStyle(5, INK, 1);
    g.lineBetween(WIDTH / 2 - 160, GY, WIDTH / 2 - 160, GY - 150);
    g.lineBetween(WIDTH / 2 + 160, GY, WIDTH / 2 + 160, GY - 150);
    rect(g, WIDTH / 2 - 160, GY - 150, 320, 46, 0xffffff, 3);
    g.lineStyle(1.2, INK, 0.5);
    for (let x = WIDTH / 2 - 150; x < WIDTH / 2 + 160; x += 12) g.lineBetween(x, GY - 150, x, GY - 104);
    spots(g, p, (s) => door(g, s.x, 'steel', accent));
  }
  if (lvl === 4) for (const s of p.spots) rect(g, s.x - 60, s.y - 40, 120, 40, DARK, 3);
  sideWalls(g, lvl === 0 || lvl === -1 ? 'none' : 'stone');
  for (const pl of p.platforms) ledge(g, pl, 'stone');
  void penLine;
}

// ---------------------------------------------------------------- army base

function fence(g: G, y: number) {
  for (let x = 20; x < WIDTH; x += 110) {
    g.lineStyle(4, INK, 1);
    g.lineBetween(x, GY, x, y);
  }
  g.lineStyle(1.5, INK, 0.7);
  for (let k = 0; k < 4; k++) g.lineBetween(0, y + 12 + k * 30, WIDTH, y + 12 + k * 30);
  // barbed wire coil on top
  g.lineStyle(1.5, INK, 0.8);
  for (let x = 0; x < WIDTH; x += 14) g.strokeCircle(x, y - 4, 7);
}

function army(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = sky(g, 400 + lvl, 400);
  if (lvl !== 4) {
    // watch tower + fence behind
    fence(g, 380);
    g.lineStyle(5, INK, 1);
    g.lineBetween(1060, GY, 1090, 200);
    g.lineBetween(1180, GY, 1150, 200);
    rect(g, 1070, 160, 100, 50, LIGHT, 4);
    poly(g, [{ x: 1060, y: 160 }, { x: 1180, y: 160 }, { x: 1120, y: 120 }], DARK, 3);
    g.lineStyle(3, accent, 1);
    g.lineBetween(1075, 200, 1165, 200);
  }
  if (lvl === 0 || lvl === -1) {
    // barrier gate with striped boom
    rect(g, 560, GY - 120, 50, 120, LIGHT, 3);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(i % 2 ? 0xffffff : accent, 1);
      g.fillRect(610 + i * 50, GY - 100, 50, 14);
    }
    g.lineStyle(3, INK, 1);
    g.strokeRect(610, GY - 100, 300, 14);
    spots(g, p, (s) => {
      rect(g, s.x - 70, GY - 170, 140, 170, LIGHT, 4);
      poly(g, [{ x: s.x - 80, y: GY - 170 }, { x: s.x + 80, y: GY - 170 }, { x: s.x + 60, y: GY - 190 }, { x: s.x - 60, y: GY - 190 }], DARK, 3);
      door(g, s.x, 'steel', accent, 70, 120);
    });
  }
  if (lvl === 1) {
    // long barracks huts with doors + a flag
    for (const s of p.spots) {
      poly(g, [{ x: s.x - 130, y: GY }, { x: s.x - 130, y: GY - 150 }, { x: s.x, y: GY - 210 }, { x: s.x + 130, y: GY - 150 }, { x: s.x + 130, y: GY }], LIGHT, 4);
      door(g, s.x, 'steel', accent, 70, 120);
    }
    g.lineStyle(4, INK, 1);
    g.lineBetween(640, GY - 210, 640, 60);
    poly(g, [{ x: 640, y: 62 }, { x: 720, y: 80 }, { x: 640, y: 100 }], accent, 2.5);
  }
  if (lvl === 2) {
    // helipad: the big H
    g.lineStyle(5, INK, 1);
    g.strokeEllipse(WIDTH / 2, GY + 2, 420, 20);
    g.lineStyle(6, accent, 1);
    g.lineBetween(WIDTH / 2 - 30, GY - 4, WIDTH / 2 - 40, GY + 8);
    g.lineBetween(WIDTH / 2 + 30, GY - 4, WIDTH / 2 + 20, GY + 8);
    // windsock
    g.lineStyle(4, INK, 1);
    g.lineBetween(170, GY, 170, GY - 220);
    for (let i = 0; i < 4; i++) {
      g.fillStyle(i % 2 ? 0xffffff : accent, 1);
      g.fillRect(170 + i * 22, GY - 220 + i * 3, 22, 30 - i * 5);
    }
  }
  if (lvl === 3) {
    // sandbag walls and a climbing wall
    for (const x0 of [200, 1000]) {
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
        g.fillStyle(0xe2dccb, 1);
        g.fillEllipse(x0 + i * 44 + r * 22, GY - 14 - r * 24, 46, 26);
        g.lineStyle(2.5, INK, 1);
        g.strokeEllipse(x0 + i * 44 + r * 22, GY - 14 - r * 24, 46, 26);
      }
    }
    rect(g, 560, GY - 260, 160, 260, MID, 4);
    for (let i = 0; i < 12; i++) {
      g.fillStyle(i % 3 ? INK : accent, 1);
      g.fillCircle(580 + rand() * 120, GY - 240 + rand() * 220, 5);
    }
  }
  if (lvl === 4) {
    // hangar inside: arched roof beams, a parked plane
    g.fillStyle(MID, 1);
    g.fillRect(0, 0, WIDTH, GY);
    for (let i = 0; i < 6; i++) {
      g.lineStyle(4, INK, 0.7);
      g.beginPath();
      g.arc(WIDTH / 2, GY + 200, 820 - i * 30, Math.PI + 0.25, -0.25, false);
      g.strokePath();
    }
    g.fillStyle(0xf0efe9, 1);
    g.fillRect(0, 150, WIDTH, 16);
    poly(g, [{ x: 380, y: GY - 60 }, { x: 900, y: GY - 80 }, { x: 960, y: GY - 120 }, { x: 900, y: GY - 120 }, { x: 860, y: GY - 100 }, { x: 420, y: GY - 100 }], LIGHT, 3.5);
    poly(g, [{ x: 600, y: GY - 90 }, { x: 700, y: GY - 90 }, { x: 640, y: GY - 30 }], LIGHT, 3);
    g.lineStyle(3, accent, 1);
    g.lineBetween(430, GY - 85, 860, GY - 92);
    sideWalls(g, 'stone');
  }
  for (const pl of p.platforms) ledge(g, pl, lvl === 4 ? 'stone' : 'wood');
}

// ---------------------------------------------------------------- village

function house(g: G, x: number, w: number, h: number, accent: number, withDoor = true) {
  rect(g, x - w / 2, GY - h, w, h, 0xf3efe4, 4);
  poly(g, [{ x: x - w / 2 - 14, y: GY - h }, { x: x + w / 2 + 14, y: GY - h }, { x: x, y: GY - h - w * 0.45 }], 0xd9cdb6, 4);
  g.lineStyle(1.5, INK, 0.5);
  for (let k = 1; k < 5; k++) g.lineBetween(x - w / 2 - 14 + k * 10, GY - h - k * 8, x + w / 2 + 14 - k * 10, GY - h - k * 8);
  rect(g, x - w / 2 + 14, GY - h + 18, 30, 28, 0xffffff, 3);
  g.lineStyle(2, INK, 1);
  g.lineBetween(x - w / 2 + 29, GY - h + 18, x - w / 2 + 29, GY - h + 46);
  g.fillStyle(accent, 1);
  g.fillRect(x - w / 2 + 10, GY - h + 46, 38, 6);
  if (withDoor) door(g, x + w / 4, 'wood', accent, 50, 80);
}

function cow(g: G, x: number, s = 1) {
  const y = GY - 6;
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(x - 40 * s, y - 50 * s, 80 * s, 34 * s, 10 * s);
  g.lineStyle(3, INK, 1);
  g.strokeRoundedRect(x - 40 * s, y - 50 * s, 80 * s, 34 * s, 10 * s);
  g.fillStyle(INK, 1);
  g.fillEllipse(x - 10 * s, y - 38 * s, 20 * s, 14 * s);
  g.fillEllipse(x + 20 * s, y - 44 * s, 14 * s, 10 * s);
  g.fillEllipse(x + 52 * s, y - 50 * s, 22 * s, 16 * s);
  g.lineStyle(3, INK, 1);
  for (const lx of [-30, -14, 18, 32]) g.lineBetween(x + lx * s, y - 16 * s, x + lx * s, y);
  g.lineBetween(x + 46 * s, y - 60 * s, x + 50 * s, y - 66 * s);
}

function sheep(g: G, x: number) {
  const y = GY - 6;
  g.fillStyle(0xffffff, 1);
  g.lineStyle(2.5, INK, 1);
  for (const [dx, dy] of [[-14, -26], [0, -32], [14, -26], [-6, -20], [8, -20]]) {
    g.fillCircle(x + dx, y + dy, 12);
    g.strokeCircle(x + dx, y + dy, 12);
  }
  g.fillStyle(INK, 1);
  g.fillEllipse(x + 26, y - 30, 14, 11);
  g.lineStyle(2.5, INK, 1);
  for (const lx of [-12, -4, 6, 14]) g.lineBetween(x + lx, y - 12, x + lx, y);
}

function chicken(g: G, x: number, accent: number) {
  const y = GY - 2;
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(x, y - 14, 22, 16);
  g.fillCircle(x + 10, y - 24, 6);
  g.lineStyle(2, INK, 1);
  g.strokeEllipse(x, y - 14, 22, 16);
  g.strokeCircle(x + 10, y - 24, 6);
  g.fillStyle(accent, 1);
  g.fillTriangle(x + 9, y - 31, x + 13, y - 31, x + 11, y - 35);
  g.lineBetween(x - 2, y - 6, x - 2, y);
  g.lineBetween(x + 3, y - 6, x + 3, y);
}

function woodFence(g: G, x0: number, x1: number) {
  for (let x = x0; x <= x1; x += 40) {
    g.lineStyle(4, INK, 1);
    g.lineBetween(x, GY, x, GY - 60);
  }
  g.lineStyle(4, INK, 1);
  g.lineBetween(x0, GY - 45, x1, GY - 45);
  g.lineBetween(x0, GY - 22, x1, GY - 22);
}

function village(g: G, p: PlaceDef, lvl: number, accent: number) {
  sky(g, 500 + lvl, 380);
  if (lvl !== 2) {
    cloud(g, 300, 110);
    cloud(g, 860, 80, 0.8);
    g.lineStyle(3, accent, 0.8);
    g.strokeCircle(1100, 90, 36);
  }
  if (lvl === 0 || lvl === -1) {
    // fields with crop rows, a scarecrow, animals
    for (let k = 0; k < 6; k++) {
      g.lineStyle(2, INK_SOFT, 0.6);
      g.lineBetween(0, 440 + k * 26, WIDTH, 430 + k * 28);
    }
    g.lineStyle(4, INK, 1);
    g.lineBetween(520, GY, 520, GY - 170);
    g.lineBetween(470, GY - 130, 570, GY - 130);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(520, GY - 185, 16);
    g.strokeCircle(520, GY - 185, 16);
    poly(g, [{ x: 490, y: GY - 196 }, { x: 550, y: GY - 196 }, { x: 520, y: GY - 222 }], 0xf2e6c4, 3);
    cow(g, 760, 0.9);
    sheep(g, 300);
    chicken(g, 950, accent);
    chicken(g, 990, accent);
    woodFence(g, 120, 400);
  }
  if (lvl === 1) {
    // barn and farmhouse with doors, fence, animals
    rect(g, p.spots[0].x - 110, GY - 220, 220, 220, 0xe7d9c3, 4);
    poly(g, [{ x: p.spots[0].x - 130, y: GY - 220 }, { x: p.spots[0].x + 130, y: GY - 220 }, { x: p.spots[0].x, y: GY - 310 }], 0xd9cdb6, 4);
    g.lineStyle(2, accent, 1);
    g.lineBetween(p.spots[0].x - 110, GY - 160, p.spots[0].x + 110, GY - 160);
    door(g, p.spots[0].x, 'wood', accent, 100, 140);
    house(g, p.spots[1].x - 30, 230, 170, accent, false);
    door(g, p.spots[1].x, 'wood', accent, 60, 100);
    woodFence(g, 420, 860);
    sheep(g, 560);
    chicken(g, 760, accent);
  }
  if (lvl === 2) {
    // barn inside: planks, hay bales, hayloft beams
    g.fillStyle(0xe7d9c3, 1);
    g.fillRect(0, 0, WIDTH, GY);
    g.lineStyle(1.5, INK, 0.35);
    for (let x = 0; x < WIDTH; x += 40) g.lineBetween(x, 0, x, GY);
    g.lineStyle(6, INK, 1);
    for (const x of [140, 640, 1140]) g.lineBetween(x, 0, x, GY);
    for (const x of [400, 880]) {
      rect(g, x - 60, GY - 70, 120, 70, 0xf2e6c4, 3);
      g.lineStyle(1.5, INK, 0.6);
      for (let k = 0; k < 5; k++) g.lineBetween(x - 55, GY - 60 + k * 13, x + 55, GY - 58 + k * 13);
    }
    sideWalls(g, 'stone');
  }
  if (lvl === 3) {
    for (const s of p.spots) house(g, s.x - 25, 190, 170, accent, false);
    for (const s of p.spots) door(g, s.x, 'wood', accent, 58, 96);
    // the well in the middle
    rect(g, 610, GY - 70, 90, 70, 0xe2e1db, 3.5);
    g.lineStyle(4, INK, 1);
    g.lineBetween(615, GY - 70, 615, GY - 150);
    g.lineBetween(695, GY - 70, 695, GY - 150);
    poly(g, [{ x: 595, y: GY - 150 }, { x: 715, y: GY - 150 }, { x: 655, y: GY - 190 }], 0xd9cdb6, 3);
  }
  if (lvl === 4) {
    // windmill + river
    rect(g, 600, GY - 300, 100, 300, 0xf3efe4, 4);
    g.lineStyle(5, INK, 1);
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + (i * Math.PI) / 2;
      const ex = 650 + Math.cos(a) * 190, ey = GY - 300 + Math.sin(a) * 190;
      g.lineBetween(650, GY - 300, ex, ey);
      poly(g, [
        { x: 650 + Math.cos(a) * 40, y: GY - 300 + Math.sin(a) * 40 }, { x: ex, y: ey },
        { x: ex + Math.cos(a + 1.57) * 30, y: ey + Math.sin(a + 1.57) * 30 },
        { x: 650 + Math.cos(a) * 40 + Math.cos(a + 1.57) * 30, y: GY - 300 + Math.sin(a) * 40 + Math.sin(a + 1.57) * 30 },
      ], 0xffffff, 2.5);
    }
    g.fillStyle(accent, 1);
    g.fillCircle(650, GY - 300, 12);
    door(g, 650, 'wood', accent, 50, 90);
    cow(g, 960);
    sheep(g, 240);
  }
  for (const pl of p.platforms) ledge(g, pl, 'wood');
}

// ---------------------------------------------------------------- pirate ship

function sea(g: G, y: number, accent: number) {
  g.fillStyle(0xdfe8e8, 1);
  g.fillRect(0, y, WIDTH, GY - y);
  for (let k = 0; k < 5; k++) {
    g.lineStyle(2, k === 1 ? accent : INK_SOFT, 0.6);
    g.beginPath();
    for (let x = 0; x <= WIDTH; x += 20) {
      const yy = y + 14 + k * 26 + Math.sin(x * 0.03 + k) * 5;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.strokePath();
  }
}

function mast(g: G, x: number, top: number, accent: number, sails = true) {
  g.lineStyle(9, INK, 1);
  g.lineBetween(x, GY, x, top);
  if (!sails) return;
  for (const [y, w] of [[top + 40, 170], [top + 170, 220]] as const) {
    g.lineStyle(5, INK, 1);
    g.lineBetween(x - w / 2, y, x + w / 2, y);
    poly(g, [{ x: x - w / 2 + 6, y }, { x: x + w / 2 - 6, y }, { x: x + w / 2 - 20, y: y + 110 }, { x: x - w / 2 + 20, y: y + 110 }], 0xf7f6f0, 3.5);
  }
  // skull flag on top
  poly(g, [{ x, y: top }, { x: x + 70, y: top + 8 }, { x, y: top + 40 }], INK, 2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x + 26, top + 18, 7);
  g.lineStyle(2, accent, 1);
  g.lineBetween(x + 16, top + 30, x + 36, top + 30);
}

function ship(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = rng(600 + lvl);
  paper(g, rand);
  if (lvl === 0 || lvl === -1) {
    sea(g, 400, accent);
    // pier planks + the ship at anchor behind
    poly(g, [{ x: 520, y: 330 }, { x: 1180, y: 330 }, { x: 1120, y: 420 }, { x: 580, y: 420 }], 0xc9bfae, 4);
    mast(g, 720, 90, accent);
    mast(g, 980, 130, accent);
    for (let x = 100; x < WIDTH; x += 90) {
      g.lineStyle(5, INK, 1);
      g.lineBetween(x, GY, x, GY + 2);
      rect(g, x - 6, GY - 40, 12, 40, 0xc9bfae, 2.5);
    }
  } else if (lvl === 1 || lvl === 3) {
    sea(g, 420, accent);
    mast(g, 330, 40, accent);
    mast(g, 950, lvl === 3 ? 20 : 70, accent);
    if (lvl === 3) {
      // ropes up to the crow's nest
      g.lineStyle(2, INK, 0.7);
      for (let k = 0; k < 8; k++) g.lineBetween(120 + k * 40, GY - 60, 330, 60 + k * 10);
      rect(g, 900, 60, 100, 30, 0xc9bfae, 3);
    }
    // railing
    g.lineStyle(4, INK, 1);
    g.lineBetween(0, GY - 70, WIDTH, GY - 70);
    for (let x = 20; x < WIDTH; x += 50) g.lineBetween(x, GY - 70, x, GY - 20);
    if (lvl === 1) for (const s of p.spots) barrel(g, s.x);
  } else if (lvl === 2) {
    // below deck: dark wood, lanterns, crates
    g.fillStyle(0xcdbfa8, 1);
    g.fillRect(0, 0, WIDTH, GY);
    g.lineStyle(1.5, INK, 0.4);
    for (let y = 30; y < GY; y += 32) g.lineBetween(0, y, WIDTH, y);
    g.lineStyle(6, INK, 1);
    for (const x of [400, 880]) g.lineBetween(x, 0, x, GY);
    for (const x of [400, 880]) {
      g.lineStyle(2, INK, 1);
      g.lineBetween(x + 30, 60, x + 30, 100);
      rect(g, x + 18, 100, 24, 30, 0xffffff, 2.5);
      g.fillStyle(accent, 1);
      g.fillCircle(x + 30, 115, 6);
    }
    for (const x of [560, 720]) {
      rect(g, x - 40, GY - 70, 80, 70, 0xd8cfc0, 3);
      g.lineStyle(2, INK, 0.8);
      g.lineBetween(x - 40, GY - 70, x + 40, GY);
    }
    sideWalls(g, 'stone');
  } else {
    // captain's cabin: wooden wall, round windows with the sea, map table
    g.fillStyle(0xd9ccb5, 1);
    g.fillRect(0, 0, WIDTH, GY);
    g.lineStyle(1.5, INK, 0.35);
    for (let x = 0; x < WIDTH; x += 46) g.lineBetween(x, 0, x, GY);
    for (const x of [300, 980]) {
      g.fillStyle(0xdfe8e8, 1);
      g.fillCircle(x, 200, 50);
      g.lineStyle(7, INK, 1);
      g.strokeCircle(x, 200, 50);
      g.lineStyle(2, accent, 0.8);
      g.lineBetween(x - 40, 215, x + 40, 210);
    }
    rect(g, 440, GY - 80, 140, 16, 0xc9bfae, 3);
    g.lineStyle(4, INK, 1);
    g.lineBetween(450, GY - 64, 450, GY);
    g.lineBetween(570, GY - 64, 570, GY);
    spots(g, p, (s) => door(g, s.x, 'wood', accent, 100, 160));
    sideWalls(g, 'stone');
  }
  // deck planks
  g.lineStyle(1.5, INK, 0.4);
  for (let x = 0; x < WIDTH; x += 60) g.lineBetween(x, GY - 4, x + 20, GY);
  for (const pl of p.platforms) ledge(g, pl, 'wood');
}

// ---------------------------------------------------------------- mall

function storeFront(g: G, x: number, w: number, accent: number, k: number) {
  rect(g, x - w / 2, GY - 260, w, 260, 0xf2f2ee, 4);
  rect(g, x - w / 2 + 10, GY - 250, w - 20, 40, k % 2 ? accent : INK, 0);
  g.fillStyle(0xffffff, 1);
  for (let i = 0; i < 3; i++) g.fillRect(x - 40 + i * 30, GY - 236, 20, 12);
  rect(g, x - w / 2 + 16, GY - 190, w - 32, 70, 0xfbfbf8, 3);
  g.lineStyle(2, INK_FAINT, 1);
  g.lineBetween(x - w / 2 + 30, GY - 180, x - w / 2 + 60, GY - 130);
}

function mall(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = rng(700 + lvl);
  paper(g, rand);
  if (lvl !== 4) {
    // ceiling lights and tiled floor
    for (let x = 80; x < WIDTH; x += 160) {
      rect(g, x - 40, 30, 80, 10, 0xffffff, 2.5);
      g.lineStyle(1.5, INK_FAINT, 1);
      g.lineBetween(x - 30, 44, x - 50, 70);
      g.lineBetween(x + 30, 44, x + 50, 70);
    }
    g.lineStyle(1.5, INK, 0.25);
    for (let x = 0; x < WIDTH; x += 64) g.lineBetween(x, GY - 2, x - 10, GY);
  }
  if (lvl === 0 || lvl === -1) {
    rect(g, 60, 150, WIDTH - 120, GY - 150, 0xf2f2ee, 4);
    rect(g, 420, 170, 440, 60, accent, 3);
    g.fillStyle(0xffffff, 1);
    for (let i = 0; i < 4; i++) g.fillRect(470 + i * 95, 188, 60, 24);
    spots(g, p, (s) => door(g, s.x, 'glass', accent, 140, 190));
    if (lvl === -1) {
      door(g, 330, 'glass', accent, 140, 190);
      door(g, 950, 'glass', accent, 140, 190);
    }
  }
  if (lvl === 1) {
    // two escalators going up to the next floor
    for (const [x0, dir] of [[160, 1], [1120, -1]] as const) {
      poly(g, [{ x: x0, y: GY }, { x: x0 + dir * 60, y: GY }, { x: x0 + dir * 280, y: GY - 300 }, { x: x0 + dir * 220, y: GY - 300 }], MID, 4);
      g.lineStyle(1.5, INK, 0.5);
      for (let k = 1; k < 12; k++) g.lineBetween(x0 + dir * (k * 20), GY - k * 25, x0 + dir * (k * 20 + 60), GY - k * 25);
      g.lineStyle(4, accent, 1);
      g.lineBetween(x0 + dir * 60, GY - 60, x0 + dir * 280, GY - 360);
    }
    rect(g, 0, GY - 310, WIDTH, 14, 0xf2f2ee, 3);
    for (let i = 0; i < 3; i++) storeFront(g, 380 + i * 260, 220, accent, i);
  }
  if (lvl === 2) {
    p.spots.forEach((s, i) => {
      storeFront(g, s.x, 260, accent, i);
      door(g, s.x, 'glass', accent, 90, 110);
    });
  }
  if (lvl === 3) {
    // checkout counters with tills, tall shelves the zombies step out of
    for (const x of [470, 640, 810]) {
      rect(g, x - 60, GY - 70, 120, 70, 0xe2e1db, 3.5);
      rect(g, x - 20, GY - 110, 40, 40, 0xffffff, 3);
      g.fillStyle(accent, 1);
      g.fillRect(x - 14, GY - 104, 28, 10);
    }
    for (const s of p.spots) {
      cabinet(g, s.x);
      g.lineStyle(3, accent, 0.9);
      for (let y = GY - 170; y < GY; y += 45) g.lineBetween(s.x - 50, y, s.x + 50, y);
    }
  }
  if (lvl === 4) {
    // car park: pillars, parking lines, cars
    g.fillStyle(MID, 1);
    g.fillRect(0, 0, WIDTH, 90);
    for (const x of [200, 640, 1080]) rect(g, x - 26, 90, 52, GY - 90, LIGHT, 4);
    for (const x of [420, 860]) {
      poly(g, [{ x: x - 90, y: GY - 20 }, { x: x - 80, y: GY - 60 }, { x: x - 40, y: GY - 90 }, { x: x + 40, y: GY - 90 }, { x: x + 80, y: GY - 60 }, { x: x + 90, y: GY - 20 }], 0xf2f2ee, 3.5);
      for (const wx of [-55, 55]) {
        g.fillStyle(INK, 1);
        g.fillCircle(x + wx, GY - 14, 16);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(x + wx, GY - 14, 6);
      }
      g.lineStyle(3, accent, 1);
      g.lineBetween(x - 80, GY - 50, x + 80, GY - 50);
    }
  }
  sideWalls(g, 'stone');
  for (const pl of p.platforms) ledge(g, pl, 'stone');
}

// ---------------------------------------------------------------- burger place (our own made-up brand)

/** Logo: a bitten burger in a circle. */
function burgerLogo(g: G, x: number, y: number, r: number, accent: number) {
  g.fillStyle(accent, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(4, INK, 1);
  g.strokeCircle(x, y, r);
  g.fillStyle(0xffffff, 1);
  g.slice(x, y - r * 0.05, r * 0.6, Math.PI, 0, false);
  g.fillPath();
  g.fillRect(x - r * 0.62, y + r * 0.08, r * 1.24, r * 0.14);
  g.fillRoundedRect(x - r * 0.6, y + r * 0.28, r * 1.2, r * 0.26, r * 0.1);
  g.lineStyle(2.5, INK, 1);
  g.strokeRect(x - r * 0.62, y + r * 0.08, r * 1.24, r * 0.14);
  // the bite
  g.fillStyle(accent, 1);
  for (const [dx, dy] of [[0.55, -0.25], [0.68, 0.05], [0.6, 0.35]]) g.fillCircle(x + r * dx, y + r * dy, r * 0.17);
}

function menuBoard(g: G, x: number, y: number, accent: number) {
  rect(g, x - 110, y, 220, 110, INK, 3);
  g.fillStyle(0xffffff, 0.85);
  for (let i = 0; i < 4; i++) {
    g.fillRect(x - 96, y + 14 + i * 24, 120, 8);
    g.fillRect(x + 60, y + 14 + i * 24, 30, 8);
  }
  g.fillStyle(accent, 1);
  g.fillCircle(x + 40, y + 18, 6);
}

function burger(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = rng(800 + lvl);
  paper(g, rand);
  const outside = lvl === 0 || lvl === 4 || lvl === -1;
  if (outside) {
    hills(g, rand, 420, 26);
    cloud(g, 240, 120);
    // tall sign pole with the logo
    g.lineStyle(10, INK, 1);
    g.lineBetween(1000, GY, 1000, 200);
    burgerLogo(g, 1000, 140, lvl === 4 ? 110 : 80, accent);
    // the restaurant building
    rect(g, 140, GY - 230, 600, 230, 0xf4f1e8, 4);
    poly(g, [{ x: 120, y: GY - 230 }, { x: 760, y: GY - 230 }, { x: 740, y: GY - 270 }, { x: 140, y: GY - 270 }], accent, 4);
    rect(g, 200, GY - 180, 180, 100, 0xfbfbf8, 3);
    rect(g, 470, GY - 180, 180, 100, 0xfbfbf8, 3);
    if (lvl === 0 || lvl === -1) {
      // drive-thru window and a car waiting
      menuBoard(g, 860, GY - 260, accent);
      g.lineStyle(4, INK, 1);
      g.lineBetween(860, GY - 150, 860, GY);
      poly(g, [{ x: 300, y: GY - 10 }, { x: 310, y: GY - 50 }, { x: 350, y: GY - 80 }, { x: 450, y: GY - 80 }, { x: 490, y: GY - 50 }, { x: 500, y: GY - 10 }], 0xffffff, 3.5);
      for (const wx of [345, 455]) {
        g.fillStyle(INK, 1);
        g.fillCircle(wx, GY - 8, 14);
      }
    }
  } else {
    // inside: checkered floor band, menu boards
    g.fillStyle(0xf6f3ea, 1);
    g.fillRect(0, 0, WIDTH, GY);
    for (let x = 0; x < WIDTH; x += 40) {
      g.fillStyle(x % 80 ? INK : 0xffffff, 0.8);
      g.fillRect(x, GY - 40, 40, 20);
      g.fillStyle(x % 80 ? 0xffffff : INK, 0.8);
      g.fillRect(x, GY - 20, 40, 20);
    }
    g.lineStyle(3, accent, 1);
    g.lineBetween(0, GY - 44, WIDTH, GY - 44);
    if (lvl === 1) {
      for (const x of [420, 640, 860]) menuBoard(g, x, 160, accent);
      rect(g, 450, GY - 150, 380, 110, 0xe8e4da, 4);
      for (const x of [520, 760]) rect(g, x - 26, GY - 196, 52, 46, 0xffffff, 3);
      burgerLogo(g, 640, GY - 96, 34, accent);
      spots(g, p, (s) => door(g, s.x, 'steel', accent, 90, 140));
    }
    if (lvl === 2) {
      // kitchen: hood, grills, fryers; fridges are the spots
      rect(g, 380, 170, 520, 70, 0xdcdcd6, 4);
      for (const x of [470, 640, 810]) {
        rect(g, x - 70, GY - 160, 140, 120, 0xcfd0cc, 4);
        g.lineStyle(3, INK, 1);
        for (let k = 0; k < 4; k++) g.lineBetween(x - 60, GY - 150 + k * 10, x + 60, GY - 150 + k * 10);
        g.fillStyle(accent, 1);
        g.fillCircle(x - 40, GY - 70, 6);
      }
      for (const s of p.spots) cabinet(g, s.x);
    }
    if (lvl === 3) {
      // play area: tube slides and a ball pit
      for (const [x0, dir] of [[150, 1], [1130, -1]] as const) {
        g.lineStyle(26, accent, 0.6);
        g.beginPath();
        g.moveTo(x0, GY - 260);
        g.lineTo(x0 + dir * 120, GY - 160);
        g.lineTo(x0 + dir * 220, GY - 50);
        g.strokePath();
        g.lineStyle(3, INK, 1);
        g.beginPath();
        g.moveTo(x0, GY - 275);
        g.lineTo(x0 + dir * 120, GY - 175);
        g.lineTo(x0 + dir * 230, GY - 62);
        g.strokePath();
      }
      rect(g, 500, GY - 70, 280, 30, 0xffffff, 3);
      for (let i = 0; i < 18; i++) {
        g.fillStyle(i % 3 ? INK_FAINT : accent, 1);
        g.fillCircle(515 + (i % 9) * 30, GY - 80 + Math.floor(i / 9) * 14, 12);
      }
    }
  }
  sideWalls(g, outside ? 'none' : 'stone');
  for (const pl of p.platforms) ledge(g, pl, 'stone');
}

// ---------------------------------------------------------------- airport

function plane(g: G, x: number, y: number, s: number, accent: number) {
  poly(g, [
    { x: x - 160 * s, y: y }, { x: x + 120 * s, y: y - 6 * s }, { x: x + 160 * s, y: y + 10 * s }, { x: x + 120 * s, y: y + 24 * s }, { x: x - 150 * s, y: y + 24 * s },
  ], 0xffffff, 3);
  poly(g, [{ x: x - 140 * s, y }, { x: x - 170 * s, y: y - 50 * s }, { x: x - 120 * s, y }], 0xffffff, 3);
  poly(g, [{ x: x - 20 * s, y: y + 14 * s }, { x: x + 40 * s, y: y + 14 * s }, { x: x - 40 * s, y: y + 60 * s }], 0xffffff, 3);
  g.lineStyle(3, accent, 1);
  g.lineBetween(x - 140 * s, y + 12 * s, x + 130 * s, y + 8 * s);
  g.fillStyle(INK, 1);
  for (let k = 0; k < 8; k++) g.fillCircle(x - 90 * s + k * 26 * s, y + 6 * s, 3 * s);
}

function bigWindows(g: G, accent: number) {
  rect(g, 0, 90, WIDTH, 300, 0xf6f8fa, 4);
  for (let x = 0; x < WIDTH; x += 160) {
    g.lineStyle(4, INK, 1);
    g.lineBetween(x, 90, x, 390);
  }
  plane(g, 760, 260, 1.2, accent);
  g.lineStyle(2, INK_FAINT, 1);
  g.lineBetween(0, 360, WIDTH, 360);
}

function airport(g: G, p: PlaceDef, lvl: number, accent: number) {
  const rand = rng(900 + lvl);
  paper(g, rand);
  if (lvl === 4) {
    // runway outside: control tower, stripes, a plane passing over
    hills(g, rand, 420, 18);
    rect(g, 1000, 140, 50, GY - 140, LIGHT, 4);
    poly(g, [{ x: 960, y: 140 }, { x: 1090, y: 140 }, { x: 1070, y: 90 }, { x: 980, y: 90 }], 0xf6f8fa, 4);
    g.lineStyle(3, accent, 1);
    g.lineBetween(980, 110, 1070, 110);
    plane(g, 420, 120, 1.5, accent);
    for (let x = 40; x < WIDTH; x += 140) rect(g, x, GY - 14, 80, 8, 0xffffff, 2);
  } else {
    bigWindows(g, accent);
    // departure board
    rect(g, 900, 150, 260, 60, INK, 3);
    g.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 2; i++) for (let k = 0; k < 5; k++) g.fillRect(914 + k * 48, 162 + i * 22, 36, 10);
    g.fillStyle(accent, 1);
    g.fillRect(1106, 162, 36, 10);
  }
  if (lvl === 0 || lvl === -1) {
    rect(g, 0, 390, WIDTH, GY - 390, 0xf2f2ee, 3);
    spots(g, p, (s) => door(g, s.x, 'glass', accent, 140, 180));
    if (lvl === -1) for (const x of [330, 950]) door(g, x, 'glass', accent, 140, 180);
  }
  if (lvl === 1) {
    // check-in desks with conveyor belts
    for (const s of p.spots) {
      rect(g, s.x - 70, GY - 90, 140, 90, 0xe2e1db, 4);
      rect(g, s.x - 40, GY - 150, 80, 50, 0xffffff, 3);
      g.lineStyle(3, accent, 1);
      g.lineBetween(s.x - 30, GY - 140, s.x + 30, GY - 140);
    }
  }
  if (lvl === 2) {
    // baggage carousel band and the chutes zombies come out of
    rect(g, 0, GY - 46, WIDTH, 30, 0xdcdcd6, 3);
    g.lineStyle(1.5, INK, 0.6);
    for (let x = 0; x < WIDTH; x += 30) g.lineBetween(x, GY - 46, x + 10, GY - 16);
    for (const s of p.spots) {
      caveArch(g, s.x, 130, 170);
      g.lineStyle(3, INK, 0.8);
      for (let k = -50; k <= 50; k += 14) g.lineBetween(s.x + k, GY - 150, s.x + k, GY - 60);
    }
    for (const [x, k] of [[520, 0], [760, 1]] as const) {
      rect(g, x - 34, GY - 86, 68, 44, k ? 0xffffff : 0xe8e4da, 3);
      g.lineStyle(3, accent, 1);
      g.lineBetween(x - 14, GY - 86, x - 14, GY - 96);
      g.lineBetween(x + 14, GY - 86, x + 14, GY - 96);
      g.lineBetween(x - 14, GY - 96, x + 14, GY - 96);
    }
  }
  if (lvl === 3) {
    // gate doors with numbers + rows of seats
    p.spots.forEach((s) => {
      door(g, s.x, 'steel', accent, 90, 140);
      rect(g, s.x - 40, GY - 190, 80, 30, accent, 3);
    });
    for (const x of [430, 850]) {
      for (let k = 0; k < 4; k++) rect(g, x - 80 + k * 40, GY - 50, 34, 30, 0xe2e1db, 2.5);
      g.lineStyle(3, INK, 1);
      g.lineBetween(x - 80, GY - 20, x + 80, GY - 20);
    }
  }
  sideWalls(g, lvl === 4 || lvl <= 0 ? 'none' : 'stone');
  for (const pl of p.platforms) ledge(g, pl, 'stone');
  void HEIGHT;
  void hatch;
  void stoneWall;
}

const CHAPTER_PAINTERS: ((g: G, p: PlaceDef, lvl: number, accent: number) => void)[] = [];
CHAPTER_PAINTERS[3] = stadium;
CHAPTER_PAINTERS[4] = army;
CHAPTER_PAINTERS[5] = village;
CHAPTER_PAINTERS[6] = ship;
CHAPTER_PAINTERS[7] = mall;
CHAPTER_PAINTERS[8] = burger;
CHAPTER_PAINTERS[9] = airport;

/** Paints a v5 place. Camps (level 0) use lvl -1. Returns false if the chapter isn't one of these. */
export function paintV5(g: G, p: PlaceDef, chapter: number, lvl: number, accent: number): boolean {
  const painter = CHAPTER_PAINTERS[chapter];
  if (!painter) return false;
  painter(g, p, lvl, accent);
  if (lvl === -1) {
    // camp signpost
    g.lineStyle(5, INK, 1);
    g.lineBetween(1110, GY, 1110, GY - 120);
    const sign = [{ x: 1060, y: GY - 120 }, { x: 1150, y: GY - 120 }, { x: 1172, y: GY - 102 }, { x: 1150, y: GY - 84 }, { x: 1060, y: GY - 84 }];
    poly(g, sign, 0xf7f7f2, 3.5);
    g.lineStyle(3, accent, 1);
    g.lineBetween(1080, GY - 102, 1140, GY - 102);
    g.lineBetween(1140, GY - 102, 1128, GY - 112);
    g.lineBetween(1140, GY - 102, 1128, GY - 92);
  }
  return true;
}
