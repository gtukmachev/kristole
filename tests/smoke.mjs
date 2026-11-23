// Smoke test: opens each scene, plays a bit of the game with simulated keys,
// saves screenshots to tests/shots and fails on console errors.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5199;
const base = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false;
server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

async function shot(name) { await page.screenshot({ path: `tests/shots/${name}.png` }); }
async function hold(key, ms) { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); }
const snap = () => page.evaluate(() => window.__scene?.snapshot());

try {
  for (const s of ['', '?scene=weapon', '?scene=avatar', '?scene=leaderboard', '?scene=result']) {
    await page.goto(base + s);
    await sleep(1200);
    await shot('scene' + (s ? s.split('=')[1] : '-menu'));
  }
  for (const [ch, bg] of [[0, 'cliff'], [1, 'graveyard'], [2, 'castle']]) {
    await page.goto(`${base}?scene=game&chapter=${ch}&level=4&god=1`);
    await sleep(3500);
    await shot('game-' + bg);
  }
  // play chapter 1 level 1 a bit: walk, jump, swing
  await page.goto(`${base}?scene=game&chapter=0&level=0&hitboxes=1`);
  await sleep(2600);
  await shot('play-0');
  for (let i = 0; i < 40; i++) {
    const s = await snap();
    const z = s.zombies.find((z) => z.state !== 'dying');
    if (z) {
      const dir = z.x > s.player.x ? 'ArrowRight' : 'ArrowLeft';
      if (Math.abs(z.x - s.player.x) > 110) await hold(dir, 120);
      else { await hold(i % 2 ? 'KeyW' : 'KeyS', 40); await sleep(250); }
    } else await sleep(150);
    if (i === 10) await shot('play-1');
    if (i === 25) { await hold('ArrowUp', 40); await sleep(150); await shot('play-jump'); }
  }
  await hold('ArrowDown', 400);
  await shot('play-2');
  console.log('snapshot', JSON.stringify(await snap()));
  await hold('Escape', 40);
  await sleep(400);
  await shot('pause');
} finally {
  await browser.close();
  server.kill();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
process.exit(errors.some((e) => !/GPU stall|CONTEXT_LOST|Context lost|Context restored/.test(e)) ? 1 : 0);
