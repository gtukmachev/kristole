import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5198;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type()==='log') console.log('LOG', m.text()); });
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0&god=1`);
await sleep(5000);
const snap = () => page.evaluate(() => window.__scene.snapshot());
for (let i = 0; i < 30; i++) {
  const s = await snap();
  const z = s.zombies.find((z) => z.state !== 'dying');
  if (!z) { await sleep(200); continue; }
  const d = z.x - s.player.x;
  if (Math.abs(d) > 100) { await page.keyboard.down(d > 0 ? 'ArrowRight' : 'ArrowLeft'); await sleep(100); await page.keyboard.up(d > 0 ? 'ArrowRight' : 'ArrowLeft'); }
  else {
    await page.keyboard.down('KeyS'); await sleep(40); await page.keyboard.up('KeyS'); await sleep(350);
    console.log(JSON.stringify(await snap()));
  }
}
await browser.close(); server.kill();
