// Captures mid-swing frames of every move into tests/shots/pose-*.png for a visual check.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5193;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0&god=1`);
await sleep(500);
const clip = { x: 440, y: 380, width: 400, height: 260 };
const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
// force a given variant by patching Math.random right before the press
async function swing(key, variant, name, delay = 150) {
  await page.evaluate((v) => { const r = Math.random; Math.random = () => { Math.random = r; return v / 3 + 0.01; }; }, variant);
  await hold(key, 30);
  await sleep(delay);
  await page.screenshot({ path: `tests/shots/pose-${name}.png`, clip });
  await sleep(400);
}
for (const v of [0, 1, 2]) await swing('KeyW', v, `W${v}`);
for (const v of [0, 1, 2]) await swing('KeyS', v, `S${v}`);
await page.keyboard.down('ArrowDown'); await sleep(200);
await swing('KeyW', 0, 'crouchW'); await swing('KeyS', 0, 'crouchS');
await page.keyboard.down('KeyA'); await sleep(250);
await page.screenshot({ path: 'tests/shots/pose-crouchBlock.png', clip });
await page.keyboard.up('ArrowDown'); await sleep(250);
await page.screenshot({ path: 'tests/shots/pose-block.png', clip });
await page.keyboard.up('KeyA'); await sleep(300);
await hold('Space', 30); await sleep(120); await swing('KeyW', 0, 'airW', 120);
await sleep(300);
await hold('Space', 30); await sleep(150); await swing('KeyS', 0, 'airS', 110);
await sleep(400);
await page.keyboard.down('ArrowRight'); await hold('Space', 30); await sleep(120); await hold('ArrowUp', 30); await sleep(180);
await page.screenshot({ path: 'tests/shots/pose-flip.png', clip: { x: 500, y: 250, width: 500, height: 390 } });
await page.keyboard.up('ArrowRight');
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
