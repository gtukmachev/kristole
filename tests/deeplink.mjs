// /<chapter>/<level> (1-based) opens that level directly. Checks dev server and the production build.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const servers = [spawn('npx', ['vite', '--port', '5190', '--strictPort']), spawn('npx', ['vite', 'preview', '--port', '5189', '--strictPort'])];
await sleep(3000);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const cases = [
  ['http://localhost:5190/2/3', 'chapel'],
  ['http://localhost:5190/1/1', 'cliffFoot'],
  ['http://localhost:5190/3/5/', 'throne'],
  ['http://localhost:5190/2/0', 'graveLane'],
  ['http://localhost:5189/kristole/3/2', 'courtyard'],
];
for (const [url, want] of cases) {
  await page.goto(url);
  await sleep(1500);
  const got = await page.evaluate(() => window.__scene?.snapshot().place ?? null);
  console.log((got === want ? 'PASS ' : 'FAIL ') + `${url} -> ${got}`);
}
await page.goto('http://localhost:5190/');
await sleep(1200);
console.log((await page.evaluate(() => window.__kristole.scene.isActive('MapMenu'))) ? 'PASS / -> menu' : 'FAIL / -> menu');
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close(); servers.forEach((s) => s.kill());
