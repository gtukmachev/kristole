# KRISTOLE — project rules

## Releases

- **When a version is finished** (everything planned in `plan/vN.md` is built, tested and reviewed), release it right away, without asking: `npm version <major|minor|patch> -m "Release %s"` + `git push --follow-tags origin main`.
- **Do not release while we are still working on improvements** — fixes, debugging, trying things out. During that time run the game on the local dev server (http://localhost:5173) and commit locally only.
- A round of improvements is over only when the user says so. A fix that worked is not the end of the round.

## Where notes go

- Ideas we don't plan to build yet: `plan/ideas.md`, grouped into letter versions (Version A, B, C…), so they don't get mixed up with real version numbers.
- A version we actually start gets a number: `plan/vN.md` (its ideas move there from `plan/ideas.md`).
- Publishing & monetization (a separate future phase, brainstorm for now): `publishing/`, one file per topic, index in `publishing/README.md`. Don't mix it with game versions.
