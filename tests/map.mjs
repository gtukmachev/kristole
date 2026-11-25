// v7: world-map menu, saved players (IndexedDB), resume after death, menu switch.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5201;
const base = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
let ready = false;
server.stdout.on('data', (d) => { if (String(d).includes('Local')) ready = true; });
for (let i = 0; i < 100 && !ready; i++) await sleep(100);

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const active = (pg, k) => pg.evaluate((k) => window.__kristole.scene.isActive(k), k);
const waitFor = async (pg, fn, arg, ms = 6000) => {
  for (let t = 0; t < ms; t += 100) { if (await pg.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
};
const map = (pg) => pg.evaluate(() => { const s = window.__kristole.scene.getScene('MapMenu'); return { pos: s.heroPos, unlocked: s.unlocked, scroll: s.scrollX }; });
/** Click a world point of the map (converted to screen with the current scroll). */
const clickWorld = async (pg, x, y) => { const m = await map(pg); await pg.mouse.click(x - m.scroll, y); };
const errors = [];

try {
  // --- 1. migration of old localStorage data, fresh map ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kristole.profile', JSON.stringify({ name: 'big leo', headgear: 'hood' }));
      localStorage.setItem('kristole.progress', JSON.stringify({ unlockedChapter: 2 }));
      localStorage.setItem('kristole.leaderboard', JSON.stringify([{ name: 'BIG LEO', score: 999, chapter: 1, level: 2, weapon: 'sword', date: 1 }]));
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(base);
    ok(await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu')), 'map menu is the default menu');
    const prof = await pg.evaluate(() => window.__storage.getProfile());
    ok(prof.name === 'BIG-LEO' && prof.headgear === 'hood', `old profile migrated, spaces -> dash (${prof.name})`);
    ok((await pg.evaluate(() => window.__storage.getProgress().unlockedChapter)) === 2, 'old open chapters migrated');
    ok((await pg.evaluate(() => window.__storage.getBoard()[0]?.score)) === 999, 'old leaderboard migrated');
    const m = await map(pg);
    ok(m.pos === 2 && m.unlocked === 2, `first load: hero on the last open chapter (${m.pos})`);
    // reload: data comes from IndexedDB now
    await pg.evaluate(() => localStorage.clear());
    await pg.reload();
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    ok((await pg.evaluate(() => window.__storage.getProgress().unlockedChapter)) === 2, 'progress kept in IndexedDB');

    // --- 2. clicks on the map ---
    await clickWorld(pg, 1100, 354); // chapter 4: locked
    await sleep(300);
    ok(await active(pg, 'MapMenu'), 'locked chapter does not start');
    await clickWorld(pg, 500, 588); // chapter 2: hero runs there, then the game starts
    await sleep(200);
    ok((await map(pg)).pos !== 2 || (await active(pg, 'Weapon')), 'hero runs to the clicked chapter');
    ok(await waitFor(pg, () => window.__kristole.scene.isActive('Weapon')), 'arrival starts the chapter (weapon choice)');
    ok((await pg.evaluate(() => window.__kristole.scene.getScene('Weapon').chapter)) === 1, 'the clicked chapter is the one started');
    await ctx.close();
  }

  // --- 3. death resumes at that level; level start saves the spot ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(base);
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    await pg.evaluate(() => { window.__storage.unlockChapter(2); window.__storage.setSpot(1, 3); });
    await sleep(300); // let IndexedDB commit
    await pg.reload();
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    ok((await map(pg)).pos === 1, 'hero stands where he died (chapter 2)');
    await pg.keyboard.press('Enter'); // Play on the map
    ok(await waitFor(pg, () => window.__kristole.scene.isActive('Weapon')), 'Enter: play where the hero stands');
    await pg.keyboard.press('Enter');
    ok(await waitFor(pg, () => window.__kristole.scene.isActive('Game')), 'game starts');
    const g = await pg.evaluate(() => { const s = window.__kristole.scene.getScene('Game'); return { lv: s.levelIdx, resume: s.resumeLevel, ch: s.chapter }; });
    ok(g.ch === 1 && g.lv === -1 && g.resume === 3, `camp first, then resume level 4 (${JSON.stringify(g)})`);
    // leaving the camp goes straight to the resume level
    await pg.evaluate(() => window.__kristole.scene.getScene('Game').goNext());
    ok(await waitFor(pg, () => window.__kristole.scene.getScene('Game').levelIdx === 3), 'after the camp: the level where he died');
    ok(JSON.stringify(await pg.evaluate(() => window.__storage.getSpot())) === '{"chapter":1,"level":3}', 'spot saved at level start');
    await ctx.close();
  }

  // --- 4. players: a new name creates a player, a known name loads it ---
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pg = await ctx.newPage();
    await pg.goto(base);
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    const r = await pg.evaluate(() => {
      const s = window.__storage;
      s.unlockChapter(3);
      const a = s.setProfile({ name: '  Max  ', headgear: 'hat' });
      const fresh = s.getProgress().unlockedChapter;
      const b = s.setProfile({ name: 'player', headgear: 'hat' });
      const back = s.getProgress().unlockedChapter;
      const c = s.setProfile({ name: 'MAX', headgear: 'none' });
      return { a, fresh, b, back, c, names: s.playerNames() };
    });
    await sleep(300);
    ok(r.a === 'created' && r.fresh === 0, 'new name -> new player with a fresh start');
    ok(r.b === 'loaded' && r.back === 3, 'known name (any case) -> that player is loaded');
    ok(r.c === 'loaded' && r.names.length === 2, `names: ${r.names.join(', ')}`);
    await pg.reload();
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    ok((await pg.evaluate(() => window.__storage.getProfile().name)) === 'MAX', 'current player remembered after reload');

    // replaying an older chapter keeps the resume point of another one
    const rs = await pg.evaluate(() => {
      const s = window.__storage;
      s.unlockChapter(5);
      s.setSpot(4, 2);
      s.setSpot(1, -1); // camp of an old chapter
      const keep = s.resumeLevel(4), here = s.getSpot().chapter;
      s.clearResume(4);
      return { keep, here, after: s.resumeLevel(4) };
    });
    ok(rs.keep === 2 && rs.here === 1 && rs.after === undefined, `resume per chapter ${JSON.stringify(rs)}`);
    // a copy saved while IndexedDB was unavailable is merged in on the next start
    await pg.evaluate(() => localStorage.setItem('kristole.v7', JSON.stringify({
      players: [{ key: 'zed', name: 'ZED', headgear: 'hat', unlockedChapter: 5, at: { chapter: 5, level: 1 }, resume: { 5: 1 } }],
      current: 'zed', board: [{ name: 'ZED', score: 7777, chapter: 5, level: 1, weapon: 'axe', date: 5 }],
    })));
    await sleep(300);
    await pg.reload();
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    const fb = await pg.evaluate(() => ({ name: window.__storage.getProfile().name, un: window.__storage.getProgress().unlockedChapter, top: window.__storage.getBoard()[0]?.score, left: localStorage.getItem('kristole.v7') }));
    ok(fb.name === 'ZED' && fb.un === 5 && fb.top === 7777 && fb.left === null, `fallback copy merged ${JSON.stringify(fb)}`);
    await pg.evaluate(() => window.__storage.setProfile({ name: 'MAX', headgear: 'none' }));
    await sleep(300);

    // --- 5. debug switch between menus, remembered ---
    await pg.goto(base + '?debug=true');
    await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu'));
    await pg.mouse.click(1210, 50); // "⇄ classic menu"
    ok(await waitFor(pg, () => window.__kristole.scene.isActive('Menu')), 'debug button switches to the classic menu');
    await pg.goto(base);
    ok(await waitFor(pg, () => window.__kristole?.scene.isActive('Menu')), 'choice remembered');
    await pg.goto(base + '?scene=map');
    ok(await waitFor(pg, () => window.__kristole?.scene.isActive('MapMenu')), '?scene=map opens the map');
    await ctx.close();
  }
} finally {
  ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
  await browser.close();
  server.kill();
}
process.exit(fails ? 1 : 0);
