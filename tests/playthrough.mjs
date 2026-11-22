// Bot plays a chapter to check waves -> levels -> result flow and difficulty.
// Usage: node tests/playthrough.mjs [levels] [chapter]   env: GOD=1 (no damage), SMART=1 (bot ducks/jumps)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5197;
const LEVELS = Number(process.argv[2] ?? 2);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=${process.argv[3] ?? 0}&level=0${process.env.GOD ? '&god=1' : ''}`);
await sleep(1500);
const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
const t0 = Date.now();
let lastLevel = -1, shots = 0, lastHp = 100;
while (Date.now() - t0 < 240000) {
  const s = await page.evaluate(() => window.__scene?.scene.isActive() ? window.__scene.snapshot() : null);
  if (!s) break;
  if (s.level !== lastLevel) { console.log(`hp ${lastHp} | level ${s.level + 1} started at ${((Date.now() - t0) / 1000).toFixed(0)}s, score ${s.score}`); lastLevel = s.level; }
  if (s.level >= LEVELS) break;
  if (s.hp !== lastHp) { lastHp = s.hp; }
  const alive = s.zombies.filter((z) => z.state !== 'dying' && z.state !== 'rising');
  if (!alive.length) { await sleep(100); continue; }
  alive.sort((a, b) => Math.abs(a.x - s.player.x) - Math.abs(b.x - s.player.x));
  const z = alive[0];
  const d = z.x - s.player.x;
  if (process.env.SMART) {
    const threat = alive.find((q) => q.state === 'windup' && Math.abs(q.x - s.player.x) < 190);
    if (threat) {
      if (threat.size === 'small') { await hold('ArrowUp', 40); await sleep(250); }
      else { await page.keyboard.down('ArrowDown'); await sleep(200); await hold('KeyW', 40); await sleep(250); await page.keyboard.up('ArrowDown'); }
      continue;
    }
  }
  if (Math.abs(d) > 120) await hold(d > 0 ? 'ArrowRight' : 'ArrowLeft', 90);
  else {
    if ((d > 0) !== (s.player.facing ?? d > 0)) await hold(d > 0 ? 'ArrowRight' : 'ArrowLeft', 30);
    await hold(z.size === 'small' ? 'KeyS' : 'KeyW', 40);
    await sleep(200);
    if (shots++ === 15) await page.screenshot({ path: 'tests/shots/bot-fight.png' });
  }
}
const final = await page.evaluate(() => (window.__scene?.scene.isActive() ? window.__scene.snapshot() : { scene: 'left game' }));
console.log('final', JSON.stringify(final).slice(0, 300));
await page.screenshot({ path: 'tests/shots/bot-end.png' });
console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
