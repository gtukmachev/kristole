// v6.1: the player can swing during a flip (a spinning slash all around the body).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5200;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) { server.kill(); console.error('FAIL vite did not start'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const tap = async (k) => { await page.keyboard.down(k); await sleep(40); await page.keyboard.up(k); };
try {
  for (const key of ['KeyW', 'KeyS']) {
    await page.goto(`http://localhost:${PORT}/?scene=game&god=1&chapter=0&level=0`);
    await sleep(900);
    await page.evaluate(() => {
      const s = window.__scene;
      setInterval(() => { s.spawnQueue = []; for (const z of s.zombies) if (!z.__test && z.alive) z.crumble(); }, 30);
      s.player.body.reset(300, 500);
      s.spawnRise('medium', 520);
      const iv = setInterval(() => { const z = s.zombies.find((q) => q.size === 'medium' && Math.abs(q.x - 520) < 8 && q.alive); if (z) { z.__test = true; z.freeze(30); clearInterval(iv); } }, 5);
    });
    await sleep(1800);
    await page.evaluate(() => { const z = window.__scene.zombies.find((q) => q.__test); z.freeze(30); window.__hp0 = z.hp; });
    await page.keyboard.down('ArrowRight');
    await tap('ArrowUp');
    await sleep(160);
    await tap('ArrowUp'); // flip
    await sleep(60);
    const flipping = await page.evaluate(() => window.__scene.player.flipping);
    await tap(key);
    await sleep(120);
    if (key === 'KeyW') await page.screenshot({ path: 'tests/shots/v6-flip-slash.png' });
    await sleep(300);
    await page.keyboard.up('ArrowRight');
    const r = await page.evaluate(() => { const z = window.__scene.zombies.find((q) => q.__test); return { hp: z.hp, hp0: window.__hp0, x: window.__scene.player.x }; });
    ok(flipping && r.hp < r.hp0, `${key} during a flip hits the zombie (flipping=${flipping}, hp ${r.hp0} → ${r.hp}, player x ${Math.round(r.x)})`);
  }
  ok(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  fails++;
  console.log('FAIL ' + e.message);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fails ? 1 : 0);
