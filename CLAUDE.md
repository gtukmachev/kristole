# KRISTOLE — project rules

## Releases

- **When a version is finished** (everything planned in `plan/vN.md` is built, tested and reviewed), release it right away, without asking: `npm version <major|minor|patch> -m "Release %s"` + `git push --follow-tags origin main`.
- **Do not release while we are still working on improvements** — fixes, debugging, trying things out. During that time run the game on the local dev server (http://localhost:5173) and commit locally only.
- A round of improvements is over only when the user says so. A fix that worked is not the end of the round.
