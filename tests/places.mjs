// Screenshots of every place (level -1 = the chapter camp) (each level is its own place) with zombies arriving.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5192;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const wait = Number(process.env.WAIT ?? 6500);
for (let c = Number(process.env.FROM ?? 0); c < 10; c++) for (let l = -1; l < 5; l++) {
  await page.goto(`http://localhost:${PORT}/?scene=game&chapter=${c}&level=${l}&god=1`);
  await sleep(wait);
  await page.screenshot({ path: `tests/shots/place-${c}-${l}.png` });
}
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
