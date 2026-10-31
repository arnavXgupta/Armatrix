# STATUS.md — current state of the project (read first, update last)

Updated: 2026-10-31 · by: planning session (verified 01–03, wrote plans 04–07)

## Where we are
Phase: plans 01, 02 and 03 built and verified (dev + production build, 320–1920 px wide).
Vercel deploy is parked: the user said to leave it for now.
Current plan: `docs/plans/04-seam-picking.md` — not started. Plans 05, 06 (+06b) and 07 are written too.

Independent verification (planning session, 2026-10-31): `npm run test` 26/26, `npm run lint`
clean, `npm run build` clean (715 kB JS, three.js). Headless Chrome at 1440×900 against the dev
server: empty state, T-joint (51 candidates), fan (161), 1.05M-tri tube-on-plate (16, ~1 s),
truncated file keeps the loaded part with a specific error, fan-meters → units unknown with the
orange select, slider to 5° re-chains, wireframe + orbit fine. No console errors. Screenshots in
the plan-02/03 session scratchpad `shots/v-*.png`.

What works: drop or browse an `.stl` (binary or ASCII, up to 250 MB) → parsed + indexed in a Web
Worker → shaded part with orbit/zoom/pan, fit (button or R), wireframe, ortho, grid → candidate
seams drawn as dark lines → angle slider (5–90°) re-chains live → toolbar shows name · tris ·
unit select (dashed = guessed, orange = unknown) → status bar shows idle / loading % / ready
summary / error. Bad files never cost the loaded part. Layout is responsive down to 320 px.

## Next action
1. Build `docs/plans/04-seam-picking.md`. Hooks already in place:
   - `Scene.setCandidates` builds one `LineSegments` with a per-vertex `color` attribute, so
     hover can recolour one candidate's segments without rebuilding geometry. Keep a
     segment → candidate id table when you add picking.
   - Raw part coordinates live inside `offset` (child of the Z-up-rotated `part` group): use
     `offset.worldToLocal` on raycast hits so seams store raw coordinates.
   - `Candidate` already carries `points`, `normals` (unit, torch approach), `length`, `closed`.
   - "New part" (`clearPart`) needs a confirm once seams exist.
2. Then plan 05 (parameters + export), 06 (persistence + deploy), 07 (README + recording).
   Deadline ~2026-11-09: plan 06's deploy step needs the user (git init, push, Vercel import),
   so raise it as soon as plan 05 is done, not at the end.

## Done
- [x] Read assignment, extracted palette/fonts/logos → `brand.md`
- [x] Stack, seam strategy, hosting, caching decided → `decisions.md`
- [x] Workflow, layout, state model, export draft → `flow.md`
- [x] 01 scaffold + brand shell (deploy parked by user)
- [x] 02 STL load + viewport
- [x] 03 feature-edge detection + candidates
- [ ] 04 seam picking + list + ordering
- [ ] 05 parameters + export + import
- [ ] 06 persistence + polish + deploy
- [ ] 06b optional cloud save (only after 01–05)
- [ ] 07 README + recording

## Verify
`npm run test` (26 tests: parser, topology/candidates, store races, tokens) · `npm run lint` ·
`npm run build`. Test parts are in `samples/` (gitignored); outcomes per part are in the plan 02/03
"Outcome" sections. `samples/` is served by the dev server at `/samples/<name>`.

## Open questions / blockers
- Deploy (parked): no Vercel CLI login and no git repo yet. User's call when. Before the first
  commit, `.gitignore` must exclude `docs/02 Logo System/`, `docs/03 Colours System/`,
  `docs/04 Fonts System/` (Armatrix's asset pack, moved there from the root by the plan 01
  session; only the subset copies in `public/brand/` ship).

## Gotchas learned (append as you hit them)
- Bash heredocs with several files in one call failed on this machine; write one file per call
  or use the Write/Edit tools. (Hit again: a `cat >> … <<'EOF'` + `python - <<'EOF'` combo
  failed with "unexpected EOF while looking for matching `''".)
- `03 Colours System/Armatrix_master_file.jpg` is 18800×26149 px; don't open it in tools, hex
  values are already in `brand.md`.
- create-vite won't scaffold into a non-empty folder without prompting. Scaffold in a temp
  dir and copy the files over.
- Vitest stubs CSS imports, even `?raw`. Read CSS in tests with `node:fs` (see tokens.test.ts).
- Chrome-extension screenshots time out on this machine (window not painted, even for plain
  pages). Use headless Chrome via `puppeteer-core` from a scratch folder instead: real GPU,
  any viewport size, `DragEvent` drops of `/samples/*` files. Changing `isMobile`/`hasTouch`
  in `setViewport` reloads the page, so set the viewport before `goto`.
- Port 5173 is taken by another app on this machine; run the dev server with `--port 5199`.
- Browser-worker geometry timings swing 3–5x between Chrome instances on this laptop (hybrid
  CPU scheduling). Compare timings in Node (vitest) before "optimising" a browser number.
- With exactly one candidate the status says "seam", not "seams"; match `/candidate seams? at/`.
- Re-subsetting fonts: venv with `fonttools brotli`, `pyftsubset <ttf> --unicodes=... --flavor=woff2
  --layout-features='*'`. Unicode list in decisions.md (Latin + U+2190-2193 + U+25A0).
- `erasableSyntaxOnly` is on: no TS parameter properties (`constructor(private x)`) or enums.
- A dev server from an earlier session may still be running on 5199; `curl localhost:5199` and
  reuse it instead of starting another. The headless driver lives in the plan-02/03 session
  scratchpad (`…/8b50f5cc-…/scratchpad/pp/drive.mjs`, puppeteer-core installed there).
