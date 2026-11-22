# KRISTOLE

2D zombie fighting game. Game design by **Leo T.** Ideas and sketches: [`idea/`](idea/idea.md).

## Run locally

```bash
npm install
npm run dev        # open http://localhost:5173
```

Production build (static files in `dist/`, ready for GitHub Pages later): `npm run build`, preview with `npm run preview`.

## Controls

| Key | Action |
|---|---|
| A / D, ← / → | move left / right |
| ↑ | jump (jump again while touching a wall in the air to bounce off it) |
| ↓ (hold) | duck |
| W | swing weapon up |
| S | swing weapon down |
| Esc | pause / menu |
| M | sound on / off |

Menus also work with the mouse.

## How it plays

- One player against waves of zombies. A level has several waves; every level brings more and stronger zombies.
- Zombies come in sizes: **small** ones are fast and bite low (jump over them; only a **down** swing reaches them),
  **medium** and **big** ones swing high (duck under it). The last wave of a chapter brings a **giant**.
- An arrow above a zombie shows what to do when it winds up: ↓ duck, ↑ jump.
- **Swing up** hits harder and knocks heads off; **swing down** reaches everything, including small zombies.
- Points for every zombie, combo multiplier for quick kills, bonus for each level.
- 3 chapters × 5 levels: The Cliff, The Graveyard, The Castle. Finishing a chapter unlocks the next one.
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
URL shortcuts: `?scene=game&chapter=1&level=2&weapon=axe`, `&god=1` (no damage), `&debug=1` (hitboxes).
