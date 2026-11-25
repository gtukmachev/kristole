// v8: phones. Touch stick + buttons, perk taps, pause button, auto-pause when hidden, hands swap,
// portrait "turn your phone", manifest + icons, desktop without touch controls.
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5202;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort']);
await sleep(2500);
const BASE = `http://localhost:${PORT}`;
const browser = await chromium.launch();
const errors = [];
let fails = 0;
const check = (ok, name) => {
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
};
const waitFor = async (pg, fn, arg, ms = 5000) => {
  for (let t = 0; t < ms; t += 100) {
    if (await pg.evaluate(fn, arg)) return true;
    await sleep(100);
  }
  return false;
};

// ---------- phone (iPhone 13, landscape)
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const pg = await ctx.newPage();
pg.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(pg);
/** game coords -> CSS px on the page */
const g2c = (x, y) => pg.evaluate(([x, y]) => {
  const r = window.__kristole.canvas.getBoundingClientRect();
  return { x: r.left + (x * r.width) / 1280, y: r.top + (y * r.height) / 720 };
}, [x, y]);
const touches = new Map();
const send = async (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
const tDown = async (id, gx, gy) => { touches.set(id, await g2c(gx, gy)); await send('touchStart'); };
const tMove = async (id, gx, gy) => { touches.set(id, await g2c(gx, gy)); await send('touchMove'); };
const tUp = async (id) => { touches.delete(id); await send(touches.size ? 'touchEnd' : 'touchEnd'); };
const tap = async (gx, gy) => { await tDown(9, gx, gy); await sleep(60); await tUp(9); };
const S = () => pg.evaluate(() => {
  const s = window.__scene;
  return { x: s.player.x, y: s.player.zone.y, blocking: s.player.blocking, attack: !!s.player.attack, touch: !!s.touch, phase: s.phase, perkLeft0: s.perkLeft[0] };
});

await pg.goto(`${BASE}/1/1?nofs`);
await waitFor(pg, () => window.__scene?.phase === 'wave', null, 8000);
check((await S()).touch, 'touch controls on a phone');

// stick: thumb lands at (200, 560), pulls right
const x0 = (await S()).x;
await tDown(1, 200, 560);
await tMove(1, 270, 560);
await sleep(500);
check((await S()).x > x0 + 40, 'stick right walks right');
const xr = (await S()).x;
await tMove(1, 130, 560);
await sleep(500);
check((await S()).x < xr - 40, 'stick left walks back');
await tMove(1, 200, 560);
await sleep(200);
// up = jump
const yGround = (await S()).y;
await tMove(1, 200, 480);
const jumped = await waitFor(pg, (y) => window.__scene.player.zone.y < y - 40, yGround, 1500);
check(jumped, 'stick up jumps');
await tUp(1);
await sleep(900);

// flip: jump with the stick up-and-sideways, ease off a little, push again (no trip back to the middle)
await waitFor(pg, () => !window.__scene.player.flipping, null, 1500);
const fdir = (await S()).x > 640 ? -1 : 1;
await tDown(1, 200, 560);
await tMove(1, 200 + fdir * 60, 470); // up + sideways: jump
await sleep(180);
await tMove(1, 200 + fdir * 60, 500); // ease off ~30px
await sleep(60);
await tMove(1, 200 + fdir * 60, 465); // push again
check(await waitFor(pg, () => window.__scene.player.flipping, null, 800), 'stick: jump, ease off a little, push again = flip');
await tUp(1);
await sleep(1200);

// block (hold)
await tDown(2, 1010, 615);
check(await waitFor(pg, () => window.__scene.player.blocking, null, 1000), 'block button held -> blocking');
await tUp(2);
await sleep(200);
check(!(await S()).blocking, 'block released');

// swing buttons
await sleep(400);
await pg.evaluate(() => window.__scene.touch.flash.clear());
await tap(1188, 450);
check(await pg.evaluate(() => [...window.__scene.touch.flash.keys()].join() === 'high'), 'swing-up button pressed');
await waitFor(pg, () => !window.__scene.player.attack, null, 1500);
await sleep(300); // swing cooldown
await pg.evaluate(() => window.__scene.touch.flash.clear());
await tap(1188, 615);
check(await pg.evaluate(() => [...window.__scene.touch.flash.keys()].join() === 'low'), 'swing-down button pressed');
await sleep(600);

// a thumb on the black bar to the right of the picture still hits the swing zone
await waitFor(pg, () => !window.__scene.player.attack, null, 1500);
await sleep(300);
await pg.evaluate(() => window.__scene.touch.flash.clear());
await tap(1320, 300);
check(await pg.evaluate(() => [...window.__scene.touch.flash.keys()].join() === 'high'), 'tap on the black side bar, upper half: swing up');
await waitFor(pg, () => !window.__scene.player.attack, null, 1500);
await tDown(3, 760, 300);
check(await waitFor(pg, () => window.__scene.player.blocking, null, 1000), 'block zone is wide (near the middle of the screen)');
await tUp(3);
await sleep(200);

// perk tap: put a perk into slot 1, tap it in the bar
await pg.evaluate(() => { window.__scene.perkCounts[0] = 1; });
const slot = await pg.evaluate(() => window.__scene.perkBar.slotPos(0));
await tap(slot.x, slot.y);
check(await waitFor(pg, () => window.__scene.perkLeft[0] > 0, null, 800), 'tap on the perk bar switches the perk on');

// pause button
await tap(1240, 40);
check(await waitFor(pg, () => window.__kristole.scene.isActive('Pause') && window.__kristole.scene.isPaused('Game'), null, 1000), 'pause button pauses');
const items = await pg.evaluate(() => window.__kristole.scene.getScene('Pause').children.list.filter((o) => o.type === 'Text').map((t) => t.text));
check(items.includes('Stick: left hand') && items.some((t) => t.startsWith('Sound:')), `pause has Sound + hands items (${items.join(' | ')})`);

// swap hands from the pause menu, then resume: the stick is on the right now
const tapText = async (label) => {
  const p = await pg.evaluate((label) => { const t = window.__kristole.scene.getScene('Pause').children.list.find((o) => o.text === label); return { x: t.x, y: t.y }; }, label);
  await tap(p.x, p.y);
};
await tapText('Stick: left hand');
await sleep(200);
check(await pg.evaluate(() => window.localStorage.getItem('kristole.touchSwap') === '1'), 'hands swapped (saved)');
await tapText('Resume');
await waitFor(pg, () => window.__kristole.scene.isActive('Game') && !window.__kristole.scene.isPaused('Game'), null, 1000);
await sleep(300);
await tDown(1, 1100, 560);
await tMove(1, 1170, 560);
await sleep(100);
check(await pg.evaluate(() => { const st = window.__scene.touch.stick; return !!st && st.x - st.bx > 50; }), 'swapped: stick on the right');
await tUp(1);
await tDown(2, 1280 - 1010, 615);
check(await waitFor(pg, () => window.__scene.player.blocking, null, 1000), 'swapped: block button on the left');
await tUp(2);
await pg.evaluate(() => window.localStorage.setItem('kristole.touchSwap', '0'));

// switching apps / locking the phone pauses
await pg.evaluate(() => window.__kristole.events.emit('hidden'));
check(await waitFor(pg, () => window.__kristole.scene.isActive('Pause'), null, 1000), 'hidden (app switch) -> pause');

// portrait: "turn your phone"
await pg.setViewportSize({ width: 390, height: 664 });
await sleep(200);
check(await pg.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'flex'), 'portrait shows "turn your phone"');
await pg.setViewportSize({ width: 844, height: 390 });
await sleep(200);
check(await pg.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'none'), 'landscape hides it');

// iPhone Safari (no fullscreen API): the "Add to Home Screen" hint; emulated Chromium has the API, so fake it away
const ios = await browser.newContext({ ...devices['iPhone 13 landscape'] });
const ip = await ios.newPage();
await ip.addInitScript(() => { for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { get: () => false, configurable: true }); });
await ip.goto(`${BASE}/`);
await sleep(800);
check(await ip.evaluate(() => getComputedStyle(document.getElementById('install')).display === 'flex'), 'iPhone: install hint shown right away');
await ip.click('#install button', { timeout: 2000 }).catch(() => {});
check(await ip.evaluate(() => getComputedStyle(document.getElementById('install')).display === 'none'), 'install hint closes');
await ios.close();

// manifest + icons
const man = await pg.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
check(man.display === 'fullscreen' && man.icons.length >= 2, 'manifest served');
for (const ic of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  const st = await pg.evaluate(async (u) => (await fetch(u)).status, `${BASE}/${ic}`);
  check(st === 200, `${ic} served`);
}
await ctx.close();

// ---------- desktop: no touch controls, the pause button works with the mouse
const dp = await browser.newPage({ viewport: { width: 1280, height: 720 } });
dp.on('pageerror', (e) => errors.push(e.message));
await dp.goto(`${BASE}/1/1`);
await waitFor(dp, () => window.__scene?.phase === 'wave', null, 8000);
check(!(await dp.evaluate(() => !!window.__scene.touch)), 'desktop: no touch controls');
await dp.mouse.click(1240, 40);
check(await waitFor(dp, () => window.__kristole.scene.isActive('Pause'), null, 1000), 'desktop: pause button click pauses');
const dItems = await dp.evaluate(() => window.__kristole.scene.getScene('Pause').children.list.filter((o) => o.type === 'Text').map((t) => t.text));
check(!dItems.some((t) => t.startsWith('Stick')), 'desktop: no hands item in pause');

check(errors.length === 0, `no page errors ${errors.join(' / ')}`);
await browser.close();
server.kill();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
