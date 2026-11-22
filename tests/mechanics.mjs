// Checks wall jump, crouch, pause/resume/restart.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5196;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
const snap = () => page.evaluate(() => window.__scene.snapshot());
const ok = (cond, msg) => console.log((cond ? 'PASS ' : 'FAIL ') + msg);
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0&god=1`);
await sleep(800);
// run to the left wall
await hold('ArrowLeft', 1700);
let s = await snap();
ok(s.player.x < 150, `reached left wall x=${s.player.x}`);
// jump, keep pushing into wall, jump again in the air -> should bounce right
await page.keyboard.down('ArrowLeft');
await hold('ArrowUp', 40);
await sleep(180);
await page.keyboard.up('ArrowLeft');
await hold('ArrowUp', 40);
await sleep(250);
s = await snap();
ok(s.player.x > 160 && s.player.y < 560, `wall jump bounced: x=${s.player.x} y=${s.player.y}`);
await page.screenshot({ path: 'tests/shots/walljump.png' });
await sleep(800);
await page.keyboard.down('ArrowDown');
await sleep(300);
s = await snap();
ok(s.player.crouch === true, 'crouch while holding down');
await page.keyboard.up('ArrowDown');
await sleep(100);
s = await snap();
ok(s.player.crouch === false, 'stand up on release');
// pause
await hold('Escape', 40);
await sleep(300);
const paused = await page.evaluate(() => window.__kristole.scene.isPaused('Game') && window.__kristole.scene.isActive('Pause'));
ok(paused, 'Esc pauses');
await page.screenshot({ path: 'tests/shots/pause.png' });
await hold('Enter', 40); // Resume
await sleep(300);
ok(await page.evaluate(() => window.__kristole.scene.isActive('Game') && !window.__kristole.scene.isActive('Pause')), 'Resume');
await hold('Escape', 40);
await sleep(300);
await hold('ArrowDown', 40);
await sleep(50);
await hold('Enter', 40); // Restart
await sleep(500);
s = await snap();
ok(s.phase === 'intro' && s.zombies.length === 0, `Restart level: phase=${s.phase}`);
await sleep(2500);
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await sleep(300);
ok(await page.evaluate(() => window.__kristole.scene.isPaused('Game') && window.__kristole.scene.isActive('Pause')), 'auto-pause on window blur');
// v2: block with A, shield drains on blocked hits; flip passes through zombies
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0`);
await sleep(600);
const pState = () => page.evaluate(() => { const p = window.__scene.player; return { shield: Math.round(p.shield), hp: p.hp, blocking: p.blocking, flipping: p.flipping, x: Math.round(p.x) }; });
await page.keyboard.down('KeyA');
let blockedOnce = false, minShield = 100;
for (let i = 0; i < 80; i++) {
  await sleep(150);
  const st = await pState();
  if (st.blocking && st.shield < 100) blockedOnce = true;
  minShield = Math.min(minShield, st.shield);
  // keep facing the nearest zombie
  const z = (await snap()).zombies.find((q) => q.state !== 'dying' && q.state !== 'rising');
  if (z && Math.abs(z.x - st.x) > 100) { const k = z.x > st.x ? 'ArrowRight' : 'ArrowLeft'; await page.keyboard.down(k); await sleep(120); await page.keyboard.up(k); }
  if (minShield < 30) break;
}
await page.keyboard.up('KeyA');
const after = await pState();
ok(blockedOnce, `blocking spends shield (min shield ${minShield}, hp ${after.hp})`);
await sleep(2600);
ok((await pState()).shield > minShield, 'shield regenerates');
// flip: jump, then jump again while holding a direction
await page.goto(`http://localhost:${PORT}/?scene=game&chapter=0&level=0&god=1`);
await sleep(600);
const x0 = (await pState()).x;
await page.keyboard.down('ArrowRight');
await hold('Space', 40);
await sleep(120);
await hold('ArrowUp', 40);
await sleep(100);
const fl = await pState();
await page.screenshot({ path: 'tests/shots/flip.png' });
await sleep(700);
await page.keyboard.up('ArrowRight');
const x1 = (await pState()).x;
ok(fl.flipping, 'second jump in the air starts a flip');
ok(x1 - x0 > 320, `flip carries further (moved ${x1 - x0}px)`);
console.log(errors.length ? 'ERRORS: ' + errors.join('\n') : 'no page errors');
await browser.close(); server.kill();
