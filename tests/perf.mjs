// Measures FPS and frame time in heavy scenes (many zombies), headless Chromium with GPU emulation.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5194;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
async function measure(label, url, warm = 9000) {
  await page.goto(`http://localhost:${PORT}/${url}`);
  await sleep(warm);
  const r = await page.evaluate(() => new Promise((res) => {
    const g = window.__kristole; const times = []; let t0 = 0;
    const pre = () => { t0 = performance.now(); };
    const post = () => { times.push(performance.now() - t0); if (times.length >= 240) { g.events.off('prestep', pre); g.events.off('postrender', post); res(times); } };
    g.events.on('prestep', pre); g.events.on('postrender', post);
  }));
  r.sort((a, b) => a - b);
  const avg = r.reduce((a, b) => a + b, 0) / r.length;
  const p95 = r[Math.floor(r.length * 0.95)];
  const zs = await page.evaluate(() => window.__scene?.snapshot?.().zombies.length ?? '-');
  console.log(`${label.padEnd(18)} frame work avg ${avg.toFixed(2)}ms  p95 ${p95.toFixed(2)}ms  zombies ${zs}`);
}
await measure('menu', '', 2000);
await measure('cliff L5', '?scene=game&chapter=0&level=4&god=1');
await measure('castle L5', '?scene=game&chapter=2&level=4&god=1', 14000);
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
