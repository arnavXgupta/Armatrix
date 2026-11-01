# Weld Seam Planner — project instructions

Armatrix software-intern assignment. Spec: `Software Intern Assignment Weld Seam Planner.pdf`.
Deadline: submit by ~2026-11-09 (7–10 days from 2026-10-31) to the address in the assignment mail.

## What it is
Browser app: upload `.stl` → auto-detect candidate seams → user picks seams and sets weld
parameters → export JSON weld job. No backend. Hosted on Vercel.

## Stack (decided, do not relitigate)
Vite · React 18 · TypeScript · three (plain, no react-three-fiber) · zustand for app state.
No UI kit. No CSS framework. Hand-written CSS with tokens from `brand.md`.
Persistence: zustand `persist` → localStorage for the plan; IndexedDB for the raw STL bytes.

## Docs that drive the work
- `flow.md` — user workflow and app architecture. Read before touching UI or state.
- `decisions.md` — every non-obvious choice, with the reason. Append, never rewrite history.
- `brand.md` — colours, fonts, logo usage, CSS tokens. Source of truth for styling.
- `docs/plans/NN-<feature>.md` — one plan per feature, written before building it.
  Plan = goal, scope in/out, files touched, data shapes, how we test it, done-when.

## Session protocol (every new Claude session)
1. Read `STATUS.md` first. It says where we are and the exact next action.
2. Read the current plan file it names. Read `flow.md` / `decisions.md` only for the part
   you are touching; do not re-read everything.
3. Work only on the current plan. Finish it or leave it in a runnable state.
4. Before ending: update `STATUS.md` (where we are, next action, done checkboxes, gotchas),
   tick the plan's done-when list, append any new decision to `decisions.md`.
5. If the user says "handoff", do step 4 and print a 5-line summary they can paste.

## Working rules
- Plan first: no feature code without its `docs/plans/` file.
- Update `decisions.md` in the same change as the decision.
- The evaluator uploads unknown STLs. Every mesh path must handle: binary and ASCII STL,
  unmerged vertices, degenerate triangles, non-manifold edges, huge files (500k+ tris),
  any unit scale. Never crash the viewport; show a message instead.
- Geometry code lives in `src/geometry/` as pure functions on typed arrays. No three.js
  objects in there, so it is unit-testable with vitest and can move to a worker.
- Export schema lives in `src/export/schema.ts` and must be mirrored exactly in README.
- Keep deps minimal. Adding one needs a line in `decisions.md`.
- Never git commit or push unless the user asks in that message.

## Layout
```
src/
  main.tsx, App.tsx
  styles/tokens.css, base.css
  store/          zustand store (plan, seams, selection, ui)
  geometry/       stl parse, merge vertices, feature edges, chaining — pure TS
  viewport/       three.js scene, controls, picking, seam rendering
  components/     React panels: Upload, SeamList, SeamParams, ExportDialog, Toolbar
  export/         schema.ts, toWeldJob.ts, validate.ts
  workers/        geometry worker wrapper
docs/plans/       feature plans
public/brand/     logo svgs, fonts
```

## Commands
`npm run dev` · `npm run build` · `npm run test` (vitest) · `npm run preview`
