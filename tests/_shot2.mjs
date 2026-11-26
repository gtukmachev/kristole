import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const g2c = (x, y) => p.evaluate(([x, y]) => { const r = window.__kristole.canvas.getBoundingClientRect(); return { x: r.left + x * r.width / 1280, y: r.top + y * r.height / 720 }; }, [x, y]);
await p.goto('http://localhost:5173/?nofs');
await p.waitForTimeout(2000);
await p.evaluate(() => { localStorage.setItem('kristole.controls', 'simple'); window.__kristole.scene.start('Controls', { from: 'menu' }); });
await p.waitForTimeout(800);
const ev = (type, id, c) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ id, ...c }] });
async function run(tapAt, tapX) {
  await p.evaluate(() => { const pl = window.__practice.player; pl.body.reset(300, 540); pl.facing = 1; });
  await p.waitForTimeout(400);
  const x0 = await p.evaluate(() => window.__practice.player.x);
  // diagonal swipe up-right from standing: jump + flip to the right
  await ev('touchStart', 1, await g2c(640, 640));
  await ev('touchMove', 1, await g2c(700, 570));
  await ev('touchMove', 1, await g2c(760, 500));
  await ev('touchEnd');
  const t0 = Date.now();
  const track = [];
  let tapped = false;
  while (Date.now() - t0 < 1100) {
    if (!tapped && tapAt !== null && Date.now() - t0 > tapAt) {
      tapped = true;
      await ev('touchStart', 2, await g2c(tapX, 620)); await p.waitForTimeout(50); await ev('touchEnd');
    }
    track.push(await p.evaluate(() => { const pl = window.__practice.player; return `${Math.round(pl.x)}${pl.flipping ? 'F' : ''}${pl.attack ? 'S' : ''}`; }));
    await p.waitForTimeout(90);
  }
  console.log(`${tapAt === null ? 'no tap        ' : `tap ${tapX < 640 ? 'left ' : 'right'} @${tapAt}ms`}: start ${Math.round(x0)} -> ${track.join(' ')}`);
}
await run(null, 0);
await run(200, 300);
await run(200, 1000);
await run(600, 300);
await b.close();
