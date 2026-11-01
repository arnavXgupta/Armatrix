# STATUS.md — current state of the project (read first, update last)

Updated: 2026-11-01 · by: planning session (re-verified 01–08 independently; see Verify)

## Where we are
Phase: plans 01–08 built and verified locally. What is left needs the user: deploy, the recording, the
unseen-part checks on the live URL, the licence choice, and sending the email.
Plans 01–08 are committed and pushed to `origin/main`; history was rewritten on 2026-11-01 to drop the
brand pack and the assignment PDF (see decisions.md).

What works: load an STL → candidate seams → hover / click to add / shift-click to join / M for manual
seams → list with drag reorder, rename, delete, order chips → parameter form per seam → export dialog
with validation, JSON preview, download, import (hash-checked) → autosave and restore on reload → error
boundary, shortcuts (`?`), first-run hint, drop-zone links to the README → (plan 08) undo/redo,
dashed air moves with an air total, order by nearest, torch ticks on the selected seam, view presets
1–4 and an axis triad, export schema 1.1 (`summary.airTravelMm`).

Current plan: none. Plan 08 is done (`docs/plans/08-order-direction-undo-views.md`, outcome at the end).
Candidates if there is time: 06b (cloud save) or a small 09 (sample parts in the empty state).

## Next action (user)
1. Pushed. The brand pack and PDF are out of history; keep them out (both are gitignored).
2. Deploy (Vercel, framework Vite, defaults). Paste the URL into `README.md` ("Live app" line) and
   `docs/submission-email.md`.
3. Record from `docs/recording-script.md`, upload unlisted, paste the link into both files.
4. On the live URL: two parts never seen before (one bracket, one organic or scanned), full flow to
   export. A session can run this with `e2e-07`-style checks once the URL exists.
5. Licence: README ends with "All rights reserved"; change it if you want MIT.
6. Send the email in `docs/submission-email.md` to pulkit@armatrix.com.

## Done
- [x] Read assignment, extracted palette/fonts/logos → `brand.md`
- [x] Stack, seam strategy, hosting, caching decided → `decisions.md`
- [x] Workflow, layout, state model → `flow.md`
- [x] 01 scaffold + brand shell
- [x] 02 STL load + viewport
- [x] 03 feature-edge detection + candidates
- [x] 04 seam picking + list + ordering
- [x] 05 parameters + export + import
- [x] 06 persistence + polish (deploy parked)
- [ ] 06b optional cloud save (not started)
- [~] 07 README, screenshots, recording script, email draft done; recording, live checks, sending left
- [x] 08 order, direction, undo, views (uncommitted)

## Verify
- 2026-11-01 planning session re-run: vitest 82/82, oxlint clean, build clean (807 kB JS, 218 kB gzip);
  e2e-04 28/28, e2e-05 26/26, e2e-06 21/21, e2e-08 53/53, e2e-resp 20/20, e2e-restore 5/5,
  e2e-export3 5/5, e2e-perf 7/7, e2e-prod 7/7 (`vite preview --port 4199`); the six downloaded jobs
  re-checked independently against schema 1.1 (airTravelMm = sum of exit→entry moves, time formula
  with air at 100 mm/s); a clean copy of the committable files passes `npm ci && npm run build && npm test`.
- `npm run test` (82 tests, including the README schema-table sync) · `npm run lint` · `npm run build`
- `npm run docs:schema` after any change to `src/export/schema.ts`.
- Browser suites (headless Chrome/Edge via puppeteer-core, kept outside the repo in the session scratch
  folder; recreate from the plan outcomes if needed): e2e-04 (28), e2e-05 (26), e2e-06 (21),
  e2e-resp (20), e2e-perf (7), e2e-restore (5), e2e-export3 (5), e2e-prod (7), e2e-07 (18), e2e-08 (53).
- Test parts in `samples/` (gitignored); `node scripts/gen-samples.mjs samples` rebuilds the synthetic
  ones. The dev server serves them at `/samples/<name>`.
- Dev builds expose `window.__wsp = { store, scene }` for tests (scene.toClient, pickCandidate).

## Open questions / blockers
- Deploy (parked by the user); everything "live URL" waits on it.
- Brand pack in `docs/0[234] …` is tracked from the first push. Untrack or keep: user's call.
- `.agents/`, `.claude/` and the assignment PDF are gitignored (user's call); the PDF is still in
  `aedfa35`'s history.

## Gotchas learned (append as you hit them)
- Bash heredocs with several files in one call failed on this machine; write one file per call
  or use the Write/Edit tools.
- `03 Colours System/Armatrix_master_file.jpg` (now under `docs/`) is 18800×26149 px; don't open it.
- create-vite won't scaffold into a non-empty folder without prompting. Scaffold in a temp
  dir and copy the files over.
- Vitest stubs CSS imports, even `?raw`. Read CSS in tests with `node:fs` (see tokens.test.ts).
- Chrome-extension screenshots time out on this machine. Use headless Chrome via `puppeteer-core`:
  real GPU, any viewport, `DragEvent` drops of `/samples/*`. Changing `isMobile`/`hasTouch` in
  `setViewport` reloads the page. Rejections from `page.evaluate` run in an isolated world and never
  reach page listeners: use `page.addScriptTag` to simulate app errors.
- Clear storage with CDP `Storage.clearDataForOrigin` before navigating, not from inside the page:
  the app restores the last plan on boot and races the clear.
- The user runs the dev server on 5173 (`npm run dev`). Use it; don't start a second one.
- Browser-worker timings swing 3–5x between Chrome instances on this laptop (hybrid CPU). Compare
  in Node (vitest) before optimising a browser number; time steady state, not the first call
  (shader compile and buffer upload happen once).
- React StrictMode re-runs effects in dev: never call `dialog.close()` in a cleanup when the
  dialog's `close` handler changes state (it closed the export dialog instantly).
- At exactly 1280 px the wide layout applies (seams panel 260 px); at 1279 it is 220 px.
- With exactly one candidate the status says "seam", not "seams"; match `/candidate seams? at/`.
- `erasableSyntaxOnly` is on: no TS parameter properties (`constructor(private x)`) or enums.
- Re-subsetting fonts: venv with `fonttools brotli`, `pyftsubset <ttf> --unicodes=... --flavor=woff2
  --layout-features='*'`. Unicode list in decisions.md.
- Edge is at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; puppeteer-core drives it
  like Chrome. Firefox is not installed.
- In a puppeteer incognito context, `Browser.setDownloadBehavior` needs `browserContextId: ctx.id`, or
  downloads silently go nowhere.
- On the T-joint's default view, the −X web foot (x = 95) is hidden behind the web; the picker
  correctly refuses it. Use the +X foot or a gusset edge in tests.
- Never `git stash` (or otherwise swap files) while a browser suite runs against the dev server: Vite
  hot-reloads the reverted files mid-test and the suite fails with "execution context destroyed".
- `LineMaterial` dashes need `computeLineDistances()` on the `LineSegments2` after every `setPositions`,
  or the line draws solid.
- OrbitControls has no orbit "up" when the camera looks straight down its up axis: the Top preset tilts
  by 1e-4 so part +Y stays up the screen.
- The detail panel's name and notes inputs are uncontrolled; they are keyed by their value so an undo
  or a rename elsewhere shows up in them.
- Headless `fetch(...).blob()` of a ~50 MB sample fails with "Failed to fetch" when C: is nearly full
  (2.8 GB free on 2026-11-01); `arrayBuffer()` then `new File([buf])` works. `lib.mjs` `drop()` now
  uses that. Not an app bug: real drops hand the app a File directly.
- Orbit frame-time comparisons on the 1M-triangle part drift 2× between the first and last measurement
  of one run (warm-up, hybrid CPU). Interleave A/B and take medians; e2e-08's tick check does now.
- If nothing answers on 5173, start `npx vite --port 5173 --strictPort` yourself; the user's server is
  not always running.
