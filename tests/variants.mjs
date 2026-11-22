import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5195;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
for (const ch of [0, 1, 2]) {
  await page.goto(`http://localhost:${PORT}/?scene=game&chapter=${ch}&level=4&god=1`);
  await sleep(7500);
  await page.screenshot({ path: `tests/shots/variant-${ch}.png` });
}
// tips: fresh storage, chapter 0 level 0, wait for a windup
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0`);
await page.evaluate(() => localStorage.removeItem('kristole.tips'));
await page.reload();
for (let i = 0; i < 60; i++) {
  await sleep(250);
  const has = await page.evaluate(() => !!window.__scene?.tipText?.active);
  if (has) { await page.screenshot({ path: 'tests/shots/tip.png' }); console.log('tip shown'); break; }
}
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
