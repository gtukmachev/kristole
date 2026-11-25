// v6.1: hearts overfill health past 100%, up to 200%; the extra shows from the right end of the bar.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5199;
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
try {
  await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0`);
  await sleep(900);
  const heartAt = async (hp) => {
    await page.evaluate((hp) => { const s = window.__scene; s.player.hp = hp; s.spawnHeart(s.player.x, s.player.footY - 60, false); }, hp);
    await sleep(250);
    return page.evaluate(() => window.__scene.player.hp);
  };
  ok((await heartAt(60)) === 85, 'a heart below 100% heals as before');
  ok((await heartAt(90)) === 115, 'a heart near full goes past 100% (90 → 115)');
  ok((await heartAt(100)) === 125, 'a heart at full health overfills (100 → 125)');
  await page.screenshot({ path: 'tests/shots/v6-overheal.png', clip: { x: 0, y: 0, width: 400, height: 110 } });
  ok((await heartAt(190)) === 200, 'overfill stops at 200%');
  // the wave break heal doesn't overfill and doesn't take the extra away
  const h = await page.evaluate(() => { const p = window.__scene.player; p.hp = 150; p.heal(10); const a = p.hp; p.hp = 95; p.heal(10); return [a, p.hp]; });
  ok(h[0] === 150 && h[1] === 100, `other healing stops at 100% and keeps the extra (${h})`);
  // a hit takes the extra first
  const d = await page.evaluate(() => { const p = window.__scene.player; p.hp = 130; p.damage(20, 1); return p.hp; });
  ok(d === 110, `damage takes the extra first (130 → ${d})`);
  ok(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  fails++;
  console.log('FAIL ' + e.message);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fails ? 1 : 0);
