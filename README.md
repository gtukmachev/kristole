# KRISTOLE

2D zombie fighting game. Game design by **Leo T.** Ideas and sketches: [`idea/`](idea/idea.md).

**Play:** https://gtukmachev.github.io/kristole/

## Run locally

```bash
npm install
npm run dev        # open http://localhost:5173
```

Production build (static files in `dist/`, ready for GitHub Pages later): `npm run build`, preview with `npm run preview`.

## Releases & deploy

- `main` is the working branch. Every push / pull request runs **CI** (typecheck + build), nothing is deployed.
- A **release** is a semver tag `vX.Y.Z`. Pushing a tag builds the game, creates a GitHub Release (notes generated
  from commits, build zip attached) and deploys it to GitHub Pages.

```bash
npm version patch        # or minor / major: bumps package.json, commits, tags vX.Y.Z
git push --follow-tags   # pushes main + the tag -> release + deploy
```

Patch = fixes, minor = new features / levels, major = big changes. The version is shown in the main menu.
To redeploy a release by hand: Actions → "Release & deploy to GitHub Pages" → Run workflow (pick the tag).

## Controls

| Key | Action |
|---|---|
| ← / → | move left / right |
| ↑ or Space | jump; press again in the air: next to a wall – bounce off it, otherwise (holding ← / →) – **flip** that flies further and passes through zombies |
| ↓ (hold) | duck |
| W | swing up (3 random animations standing; own moves when jumping / ducking) |
| S | swing down (in the air: stab downward) |
| A or D (hold) | **block**: the sword folds away and a shield unfolds; blocked hits cost shield (grey bar), which always refills |
| 1 … 9, 0 | switch on a **perk** from its slot (top of the screen) |
| Esc | pause / menu |
| M | sound on / off |

Menus also work with the mouse.

## How it plays

- One player against waves of zombies. Every level is **its own place** with 2 waves; then an exit opens (GO →),
  you walk into it and the world slides on to the next place. Each place has its own way zombies arrive:
  out of the earth, cave mouths, crypt doors, coffins, barrels, cabinets, armour stands, dropping from ledges and
  chapel windows, or floating down on parachutes.
- **Perks** (v4): 10 slots at the top, keys 1…0, from weakest to strongest: Sharp blade, Freeze, Long sword,
  Spear, Invisible, Berserk, Cocoon, Ghost, Angel, Dawn. A perk is spent when switched on and works for ~10 seconds.
  You get them three ways:
  - every chapter starts with **level 0**: three free perks (out of the first five), take one;
  - **hidden** in each place: things that wobble (pots, skulls, crates), candle pairs to put out, birds to scare away;
  - dropped by zombies: never by small ones, sometimes by medium and big ones, **three** from every giant.
  Perks stay with you from place to place and chapter to chapter until you die.
- Chapters run back to back: from the last place of a chapter you walk straight into the next chapter.
- Each chapter has its own **accent colour** (blood, hearts, perks, thin strokes in the scenery): red cliff, purple graveyard, green castle.
- **Hearts** heal +25: one waits on a ledge in every place (jump / wall-bounce / flip up to it), and killed zombies
  sometimes drop one (big ones more often).
- Zombies come in sizes: **small** ones are fast and bite low (jump over them; only a **down** swing reaches them),
  **medium** and **big** ones swing high (duck under it). The last wave of a chapter brings a **giant**.
- An arrow above a zombie shows what to do when it winds up: ↓ duck, ↑ jump.
- **Swing up** hits harder and knocks heads off; **swing down** reaches everything, including small zombies.
- Block (A / D): a blocked hit only pushes you back, but costs shield. On level 1 the shield holds two medium hits, the third breaks through.
- If a zombie is a little out of reach, a standing swing lunges forward.
- Points for every zombie, combo multiplier for quick kills, bonus for each level.
- 3 chapters × 5 places: The Cliff (foot, cave entrance, inside the cave, cliff path, summit), The Graveyard
  (gates, crypts, chapel, open graves, mausoleum), The Castle (drawbridge, courtyard, armory, ramparts, throne room). Reaching a chapter unlocks it in the menu.
- Leaderboard, avatar name and progress are stored in the browser (localStorage).
- Chapter one shows short beginner tips (once). Zombies dress differently per chapter.

## Tech

Phaser 4 + TypeScript + Vite. All graphics are drawn in code (procedural stick-figure animation), all sounds are synthesised
with Web Audio – there are no asset files.

Test helpers (Playwright, start their own dev server):
- `node tests/smoke.mjs` – screenshots of every screen into `tests/shots/`, fails on page errors
- `node tests/mechanics.mjs` – wall jump, crouch, pause / resume / restart
- `node tests/playthrough.mjs [levels] [chapter]` – a bot plays (`GOD=1` no damage, `SMART=1` bot ducks and jumps)
- `node tests/variants.mjs` – screenshots of every chapter + beginner tip
- `node tests/perks.mjs` – level 0 pick, perk keys, spear / ghost / freeze / dawn, hidden secrets, chapter → chapter
URL shortcuts:
- `/<chapter>/<level>` (1-based) jumps straight into a level, e.g. `http://localhost:5173/2/3` or
  `https://gtukmachev.github.io/kristole/2/3` (Pages serves the game from `404.html` for such paths); level `0` = the chapter's perk pick
- `?scene=game&chapter=1&level=2&weapon=axe` (0-based, `level=-1` = perk pick), `&god=1` (no damage), `&hitboxes=1` (hitboxes),
  `&perks=1111111111` (perk counts per slot 1…0)
- `?debug=true` – service panel with a log of pressed keys (key / code / keyCode) and what the game did with them
- `node tests/deeplink.mjs` checks the deep links on the dev server and the production build
