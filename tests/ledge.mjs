// v6: smarter crouch dodge and zombies jumping at a player who hits them from a ledge.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5198;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
if (!ready) { server.kill(); console.error('FAIL vite did not start'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
try {
const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

/** Fresh level with no other zombies; strikes of the test zombie are logged with "did it touch the player". */
async function setup(q) {
  await page.goto(`http://localhost:${PORT}/?scene=game&god=1&${q}`);
  await sleep(900);
  await page.evaluate(() => {
    const s = window.__scene;
    window.__log = [];
    window.__states = [];
    const orig = s.zombieStrike.bind(s);
    s.zombieStrike = (z, band) => {
      const hb = s.player.hurtbox();
      const hit = band.left < hb.right && band.right > hb.left && band.top < hb.bottom && band.bottom > hb.top;
      if (z.__test) window.__log.push({ hit, state: z.state, crouch: s.player.crouching });
      orig(z, band);
    };
    // keep the arena empty apart from the test zombie
    setInterval(() => {
      s.spawnQueue = [];
      for (const z of s.zombies) if (!z.__test && z.alive) z.crumble();
      const t = s.zombies.find((z) => z.__test);
      if (t && window.__states.at(-1) !== t.state) window.__states.push(t.state);
    }, 30);
  });
}
async function spawnAt(size, x) {
  await page.evaluate(([size, x]) => {
    const s = window.__scene;
    s.spawnRise(size, x);
    const iv = setInterval(() => { const z = s.zombies.find((q) => q.size === size && Math.abs(q.x - x) < 8 && q.alive); if (z) { z.__test = true; clearInterval(iv); } }, 5);
  }, [size, x]);
  await sleep(1800);
}
const playerTo = (x, y) => page.evaluate(([x, y]) => { const p = window.__scene.player; p.body.reset(x, y); p.body.setVelocity(0, 0); }, [x, y]);
const log = () => page.evaluate(() => window.__log);
const states = () => page.evaluate(() => window.__states);
const waitLog = async (ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const l = await log(); if (l.length) return l; await sleep(100); } return log(); };

// 1. Already crouching when the big one starts its swing: it aims low and hits.
await setup('chapter=0&level=1');
await playerTo(300, 500);
await page.keyboard.down('ArrowDown');
await spawnAt('big', 470);
let l = await waitLog();
await page.keyboard.up('ArrowDown');
ok(l[0]?.crouch && l[0]?.hit, `crouching before the swing: big zombie hits low (${JSON.stringify(l[0])})`);

// 2. Standing when the swing starts, duck during it: the blow goes over.
await setup('chapter=0&level=1');
await playerTo(300, 500);
await spawnAt('medium', 470);
const t0 = Date.now();
while (Date.now() - t0 < 6000 && !(await states()).includes('windup')) await sleep(30);
await page.keyboard.down('ArrowDown');
l = await waitLog();
await page.keyboard.up('ArrowDown');
ok(l[0] && l[0].crouch && !l[0].hit, `ducked after the swing started: missed (${JSON.stringify(l[0])})`);

// 3. On a ledge, not hitting anyone: a medium zombie below doesn't swing at all.
await setup('chapter=0&level=1');
const plat = await page.evaluate(() => window.__scene.place.platforms[0]);
console.log('ledge', plat, 'height', 610 - plat.y);
await playerTo(plat.x, plat.y - 75);
await spawnAt('medium', plat.x + 60);
await sleep(3000);
ok((await log()).length === 0 && !(await states()).includes('windup'), `calm medium below the ledge doesn't swing (${await states()})`);

// 4. Hit it from the ledge (here: anger it as a hit would): it jumps up and strikes the player.
await page.evaluate(() => window.__scene.zombies.find((z) => z.__test).anger());
l = await waitLog(5000);
const st = await states();
ok(st.includes('jumpWind') && st.includes('jumpUp'), `angry medium jumps (${st})`);
ok(l[0]?.hit, `the jump strike reaches the player on the ledge (${JSON.stringify(l[0])})`);
await page.screenshot({ path: 'tests/shots/v6-jump.png' });
let zs = null;
for (let i = 0; i < 40 && !(zs?.foot > 605); i++) {
  await sleep(50);
  zs = await page.evaluate(() => { const z = window.__scene.zombies.find((q) => q.__test); return { foot: z.footY, state: z.state }; });
}
ok(zs.foot > 605, `it falls back to the ground through the ledge (${JSON.stringify(zs)})`);

// 5. A real low swing from the ledge at a big zombie makes it angry.
await setup('chapter=0&level=1');
await playerTo(plat.x, plat.y - 75);
await spawnAt('big', plat.x + 70);
await page.evaluate(() => { window.__scene.player.facing = 1; });
await page.keyboard.down('KeyS'); await sleep(40); await page.keyboard.up('KeyS');
await sleep(300);
const angry = await page.evaluate(() => { const z = window.__scene.zombies.find((q) => q.__test); return { angry: z.angryUntil > z.time, hp: z.hp, max: z.maxHp }; });
ok(angry.hp < angry.max && angry.angry, `hit from the ledge makes it angry (${JSON.stringify(angry)})`);
l = await waitLog(5000);
ok(l[0]?.hit, `the big one strikes back (${JSON.stringify(l[0])}, ${await states()})`);

// 6. Crouched low swing from the ledge reaches a medium zombie's head below (as drawn): it gets angry and jumps.
await setup('chapter=0&level=1');
await playerTo(plat.x, plat.y - 75);
await spawnAt('medium', plat.x + 50);
await playerTo(plat.x, plat.y - 75);
await page.evaluate(() => { window.__scene.player.facing = 1; });
await sleep(200);
await page.keyboard.down('ArrowDown');
await sleep(150);
await page.keyboard.down('KeyS'); await sleep(40); await page.keyboard.up('KeyS');
await sleep(350);
await page.keyboard.up('ArrowDown');
const m = await page.evaluate(() => { const z = window.__scene.zombies.find((q) => q.__test); return { angry: z.angryUntil > z.time, hp: z.hp, max: z.maxHp }; });
ok(m.hp < m.max && m.angry, `crouched swing from the ledge hits the medium below and angers it (${JSON.stringify(m)})`);
l = await waitLog(5000);
ok((await states()).includes('jumpUp') && l[0]?.hit, `the medium jumps and strikes back (${await states()})`);

ok(errors.length === 0, `no page errors ${errors.join('; ')}`);
} catch (e) {
  fails++;
  console.log('FAIL ' + e.message);
} finally {
  await browser.close();
  server.kill();
}
process.exit(fails ? 1 : 0);
