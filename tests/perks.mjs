// v4 perks: level 0 pick, activation, effects, hidden secrets, chapters back to back.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const PORT = 5197;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false; server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const hold = async (k, ms) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
const tap = (k) => hold(k, 40);
const snap = () => page.evaluate(() => window.__scene.snapshot());
let fails = 0;
const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const go = async (q, wait = 900) => { await page.goto(`http://localhost:${PORT}/?scene=game&god=1&${q}`); await sleep(wait); };
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await snap(); if (fn(s)) return s; await sleep(150); } return snap(); };

// 1. level 0: three free perks, take one, the others vanish, walk on
await go('chapter=0&level=-1', 2600);
let s = await snap();
ok(s.phase === 'choose' && s.pickups.length === 3 && s.pickups.every((p) => p.choice), `level 0 shows 3 free perks (${s.place}, ${s.pickups.map((p) => p.id)})`);
ok(s.pickups.every((p) => ['sword', 'freeze', 'long', 'spear', 'invis'].includes(p.id)), 'free perks only from the first five');
await page.screenshot({ path: 'tests/shots/v4-camp.png' });
await hold('ArrowRight', 1500);
await sleep(1200);
s = await snap();
ok(sum(s.perks) === 1 && s.pickups.length === 0, `picked exactly one perk (${s.perks.join('')})`);
s = await waitFor((x) => x.phase === 'exit', 4000);
ok(s.phase === 'exit', 'portal opens after the pick');
await hold('ArrowRight', 1500);
s = await waitFor((x) => x.level === 0 && x.phase !== 'exit', 4000);
ok(s.level === 0 && s.place === 'cliffFoot' && sum(s.perks) === 1, `walked into level 1, perk kept (${s.place}, ${s.perks.join('')})`);

// 2. hidden secret: the birds on the first level fly off when you come close -> a perk drops
await go('chapter=0&level=0');
await page.keyboard.down('ArrowRight');
s = await waitFor((x) => x.secrets.find((q) => q.kind === 'birds')?.done, 4000);
await page.keyboard.up('ArrowRight');
await sleep(600);
s = await snap();
ok(s.secrets.find((x) => x.kind === 'birds')?.done === true, 'scared the birds away');
ok(s.pickups.length >= 1 || sum(s.perks) >= 1, `a perk dropped from the secret (${s.pickups.map((p) => p.id)})`);
await page.screenshot({ path: 'tests/shots/v4-secret.png' });

// 3. activation: every perk switches on and is spent
await go('chapter=0&level=1&perks=1111111111', 1200);
await tap('1');
await sleep(150);
s = await snap();
ok(s.perksOn.includes('sword') && s.perks[0] === 0, `key 1 turns on SHARP BLADE (${s.perksOn})`);
await tap('1');
s = await snap();
ok(s.perks[0] === 0, 'an empty slot does nothing');
// spear throw
await tap('4');
await sleep(100);
await tap('w');
await sleep(60);
s = await snap();
ok(s.spears >= 1, 'W throws a spear while SPEAR is on');
await page.screenshot({ path: 'tests/shots/v4-spear.png' });
// ghost flies
await tap('8');
await page.keyboard.down('ArrowUp');
s = await waitFor((x) => x.player.y < 450, 3000);
await page.keyboard.up('ArrowUp');
ok(s.perksOn.includes('ghost') && s.player.y < 450, `GHOST flies up (y=${s.player.y})`);
await page.screenshot({ path: 'tests/shots/v4-ghost.png' });
const hp0 = await page.evaluate(() => { const sc = window.__scene; sc.player.god = false; const h = sc.player.hp; sc.player.damage(30, 1); return h; });
s = await snap();
ok(s.hp === hp0, `GHOST can't be hurt (hp ${hp0} → ${s.hp})`);
// cocoon, berserk, invisible, angel
await tap('7'); await tap('6'); await tap('5'); await tap('9');
await sleep(500);
s = await snap();
ok(['invinc', 'berserk', 'invis', 'angel'].every((p) => s.perksOn.includes(p)) && s.angel, `several perks at once (${s.perksOn})`);
await page.screenshot({ path: 'tests/shots/v4-many.png' });

// 4. freeze: a zombie you hit freezes
await go('chapter=0&level=0&perks=0100000000', 600);
await tap('2');
s = await waitFor((x) => x.zombies.some((z) => z.state === 'walk' && Math.abs(z.x - x.player.x) < 260), 12000);
const z0 = s.zombies.find((z) => z.state === 'walk');
if (z0 && z0.x < s.player.x) await tap('ArrowLeft');
let frozen = false;
for (let i = 0; i < 40 && !frozen; i++) {
  await tap('s');
  await sleep(250);
  s = await snap();
  frozen = s.zombies.some((z) => z.frozen);
}
ok(frozen, 'FREEZE: a hit zombie is stuck to the ground');
await page.screenshot({ path: 'tests/shots/v4-freeze.png' });

// 5. dawn: everything crumbles, new zombies too
await go('chapter=0&level=2&perks=0000000001', 600);
s = await waitFor((x) => x.zombies.filter((z) => z.state !== 'dying').length >= 2, 15000);
const killsBefore = s.kills;
await tap('0');
await sleep(1500);
await page.screenshot({ path: 'tests/shots/v4-dawn.png' });
await sleep(1500);
s = await snap();
ok(s.zombies.every((z) => z.state === 'dying' || z.state === 'rising') && s.kills > killsBefore, `DAWN: all zombies crumble (kills ${killsBefore} -> ${s.kills})`);

// 6. chapters run back to back: from the last level straight into the next chapter's level 0
await go('chapter=0&level=4&perks=2000000000', 600);
await page.evaluate(() => window.__scene.goNext());
s = await waitFor((x) => x.chapter === 1 && x.phase === 'choose', 5000);
ok(s.chapter === 1 && s.level === -1 && s.place === 'graveLane' && s.perks[0] === 2, `chapter 1 -> chapter 2 level 0 (${s.place}), perks kept`);
await page.screenshot({ path: 'tests/shots/v4-chapter2.png' });

ok(errors.length === 0, errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
server.kill();
process.exit(fails ? 1 : 0);
