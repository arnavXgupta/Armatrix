# Armatrix brand — reference for the Weld Seam Planner

Source: `03 Colours System/Armatrix_master_file.{jpg,pdf}`, `04 Fonts System/*.zip`, `02 Logo System/`.

## Colours

Four families, each with 5 steps. Hex values read from the master colour sheet.

| Family | Base | Steps |
|---|---|---|
| Dark Forest (primary dark) | `#030500` | T1 `#090D00` · T2 `#0E1600` · T3 `#141E00` · T4 `#192600` |
| Light Sand (primary light) | `#F6F6EE` | S1 `#DFDFD7` · S2 `#C5C5BD` · S3 `#ABABA5` · S4 `#93938D` |
| Revolution Green (brand accent) | `#2B381F` | T1 `#344425` · T2 `#3D4F2C` · T3 `#455B32` · T4 `#628047` |
| Bright Discovery (highlight / action) | `#E97F01` | T1 `#E98917` · T2 `#E9942F` · T3 `#E99E46` · T4 `#E9B475` |

Logo SVG fills confirm: full-colour `#627F47` (≈ Revolution Green T4), dark `#040600` (≈ Dark Forest), light `#F5F5EC` (≈ Light Sand).

## Fonts

Roles below are the brand's own (armatrix.com `/brand/colors_and_type.css`, §03 of the "Inside the Matrix" guideline).

| Pack | Brand role | Use in the app | Files |
|---|---|---|---|
| Onest | COMMAND: default voice, headers, display, labels, buttons, numbers | App title, panel labels, buttons, values | `Onest-VariableFont_wght.ttf` (site ships `Onest-variable-latin.woff2`, 35 KB) |
| 42dot Sans | TRANSMIT: body text, sustained reading | Help text, descriptions, empty-state copy | `42dotsanswght.ttf` is 5.7 MB with Korean; use a Latin subset (site's `42dotsans-variable-latin.woff2`, 29 KB) |
| Redaction (OFL) | SIGNAL: coded communication, used sparingly. Grades 10–100 progressively redact the glyphs. | Keep out of the tool | `Redaction-Regular/Bold/Italic.woff2` (+ grades 10–100) |

Monospace for numbers/JSON: system monospace stack (no brand mono supplied).

Type rules: headings left-aligned only (centre/right/justified forbidden). h2/h3/captions/labels UPPERCASE Onest 500. Labels tracked 0.06em (buttons, sources) to 0.12em (nav, labels); spec tags 0.25em. Display leading 0.9–1.0 with −0.02em tracking.

## Logos

- `02 Logo System/01 Logo/Web/SVG/` — square mark, 3 variants (full-color, dark-forest, light-sand)
- `02 Logo System/03 Horizontal Logo/Web/SVG/` — wordmark + mark, same 3 variants
- `02 Logo System/02 Vertical Logo/Web/SVG/` — stacked, same 3 variants

App header uses the **horizontal light-sand** SVG on a Dark Forest bar.

## How we apply it in the app (engineer tool, hours of use)

- **Dark theme by default.** Viewport background Dark Forest T2 `#0E1600`; panels Dark Forest T3/T4; text Light Sand; muted text Light Sand S3.
- **Green is structure, orange is action.** Revolution Green for selected/active states, borders, seam lines on the model. Bright Discovery only for the primary action, the currently hovered seam, and warnings. Never flood the screen with orange.
- **Density over whitespace.** 12–13 px Onest for tables and parameter forms, 4/8 px spacing grid, no large hero sections. 42dot Sans 13 px for help text. No Redaction in the tool.
- **Viewport colours:** mesh Light Sand S2 with matte shading; detected candidate seams Light Sand S4 thin lines; selected seams Revolution Green T4 thick; hovered seam Bright Discovery; seam order labels in Light Sand on Dark Forest chips.
- **Contrast check:** Light Sand on Dark Forest T2 ≈ 17:1, Bright Discovery on Dark Forest T2 ≈ 7:1, Revolution Green T4 on Dark Forest T2 ≈ 4:1 (ok for lines and borders, not for small text).

## CSS tokens (copy into `src/styles/tokens.css`)

```css
:root {
  --forest:    #030500; --forest-1: #090D00; --forest-2: #0E1600; --forest-3: #141E00; --forest-4: #192600;
  --sand:      #F6F6EE; --sand-1:   #DFDFD7; --sand-2:   #C5C5BD; --sand-3:   #ABABA5; --sand-4:   #93938D;
  --green:     #2B381F; --green-1:  #344425; --green-2:  #3D4F2C; --green-3:  #455B32; --green-4:  #628047;
  --orange:    #E97F01; --orange-1: #E98917; --orange-2: #E9942F; --orange-3: #E99E46; --orange-4: #E9B475;

  --bg:        var(--forest-2);
  --panel:     var(--forest-3);
  --panel-2:   var(--forest-4);
  --border:    var(--green-1);
  --text:      var(--sand);
  --text-muted: var(--sand-3);
  --accent:    var(--green-4);
  --action:    var(--orange);

  --font-ui:   "Onest", system-ui, sans-serif;        /* COMMAND */
  --font-body: "42dot Sans", system-ui, sans-serif;   /* TRANSMIT */
  --font-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;

  /* Motion — values from armatrix.com */
  --ease-out:    cubic-bezier(0.16, 0.84, 0.32, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --dur-fast:  120ms;   /* colour, underline */
  --dur-base:  200ms;
  --dur-hover: 350ms;   /* buttons, rows */
  --dur-slow:  420ms;   /* panels */

  --radius-xs: 2px; --radius-sm: 4px; --radius-md: 6px;   /* surfaces stay square */
  --focus-ring: var(--orange);  /* site has none; 2px solid, 3px offset */
}
```

## UI/UX language from armatrix.com

Full reference with live motion demos: **Armatrix Brand Study** artifact (https://claude.ai/artifact/1N5s9a7QEoHKgqgL9XamjJ).
Site stack: static HTML, GSAP 3.12.5 + ScrollTrigger, WAAPI, three.js on /tech. No smooth-scroll library.

**Proportion law (brand guideline):** Light Sand ~76% · Revolution Green ~11% · Dark Forest ~11% · Bright Discovery ~3%. Orange is a *signal*, never decoration.

**Contrast traps (measured):**
- Orange text on Light Sand = 2.6:1 → fails. Orange text only on dark grounds (7.3:1).
- `sand-4` (#93938D) muted text on Light Sand = 2.8:1 → fails (site does it anyway; don't copy).
- Base Revolution Green #2B381F as a border on Dark Forest = 1.65:1 → invisible. Use green-4 for lines on dark.

**Signature marks (use these, they are the brand):**
- **Pins**: solid orange squares at frame corners. 12px/inset 12 (hero), 8px/inset 8 two corners (image cards), 6px/inset 6 four corners (spec cards). → frame the 3D viewport with them.
- **Square-flanked headings**: ■ USE CASES ■ (10px orange squares, 0.75rem gap, uppercase Onest 400, −0.02em).
- **Bracket status**: `[ LOADING ]` → `[ BUFFERING ]` + right-aligned % + 1px orange progress line on a 10% sand track. → use for STL parse / seam detection progress.
- **Indices**: `/001 INSPECTION` (600 + 800 weight, 0.08em) for sequences; `01`–`05`, `05a` for specs. → weld order is a real sequence, number seams `/001…`.
- **Doc stamp**: `DOC . 31 . 10 . 26` (10px, 0.1em). → export dialog + JSON header.
- **Spec card**: 2px ink frame, square, 4 pins, index · tracked tag · 36px rule · orange bold value · label. → selected-seam summary.
- **Square bullet**: 8px orange square before feature titles instead of icons. No icon set, no emoji; only a 16px 2px-stroke arrow after button labels.

**Components as built:**
- Button: transparent, 1px green border, orange UPPERCASE 13px/500/0.06em label, 14×22 padding, radius 12px, arrow suffix. Hover (0.35s ease, all): 145° gradient forest→green→green-3→green-4, sand label, `0 12px 40px rgba(3,5,0,.3)`.
- Navbar: transparent → after 60px scroll a floating pill (inset 0.75rem/1.5rem, radius 10px, 135° forest→green-3 gradient, `0 8px 32px rgba(0,0,0,.35)`), 0.45s. Hides on scroll-down (0.35s), returns on scroll-up or pointer within 30px of top. Links 14px/500/0.12em at 55% sand → 100% + 1px underline growing 0→100% in 120ms.
- Feature row (hover = selected state for our lists): bg `rgba(43,56,31,.5)`, `inset 3px 0 0 orange`, title → orange, 0.35s.
- Media card hover: 1px orange inset border fades in 0.4s. Image card hover: `translateY(-4px) scale(1.02)`.

**Motion rules:** engineered, never bouncy. UI = 120ms (colour) / 350ms (hover) / 420ms (panels) on `--ease-out`. Site-only cinematic layer: 7.6 s first-visit loader (logo becomes a mask over hero video, then docks into navbar), 1050 ms iris page transition (black circle collapses to click point, expands on the next page), scroll-scrubbed reveals (scale 0.88→1, y 40→0, parallax media ±5%), lagging cursor dot (lerp 0.2).
**In the tool:** fast layer only. No loader theatre, no iris, no scroll scrub, **no cursor follower** (it lags the pointer and breaks 3D picking). Seam hover feedback same-frame. Honour `prefers-reduced-motion` (the site doesn't).

**Voice:** short declaratives with full stops ("Access Redefined."), operator vocabulary (access point, manhole, end-effector, deployment, downtime), numbers with sources, "We build…", no exclamation marks, no emoji, no hype words. UPPERCASE for labels/nav/buttons/section titles; Title Case for card titles; spaced en dash in ranges (`3 – 5 m`). Errors: what happened + one action ("Unable to load positions. Please try again." + Retry).
