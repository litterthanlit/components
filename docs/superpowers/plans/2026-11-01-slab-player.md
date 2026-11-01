# Slab Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Slab spike on `claude/wonderful-archimedes-ex0jz9` into the finished home-page player: tokens instead of typed values, no dead code, a working short-landscape layout, the name said once, and the design language updated.

**Architecture:** The player stays in `src/components/device/`; its layout is already the Slab (spike commits `4b23d9c` to `847ba5f`). Its finish moves from typed values in `globals.css` to `--device-*` tokens in `tokens.css` (mirrored in `tokens.ts`), and the old frame, status bar, LCD readout and deck grid are deleted. A new browser check, `check:player`, pins every decision in the spec, and runs in `verify.sh` beside `check:fit` and `check:anatomy`.

**Tech Stack:** Next.js 16 (App Router, basePath `/studies`), React 19, Tailwind v4, playwright-core for checks.

**Spec:** `docs/superpowers/specs/2026-11-01-slab-player-design.md`

## Global Constraints

- Follow `DESIGN.md` and `.claude/skills/study/SKILL.md` (it covers `src/components/device/`). Read `AGENTS.md` first: this Next.js has breaking changes; its guides are in `node_modules/next/dist/docs/`.
- Values come from tokens: `src/design-system/tokens.css` is the source of truth and `src/design-system/tokens.ts` mirrors it.
- Object: 160 × 116 on wide viewports (`min-width: 720px` and `min-height: 521px`), at most 880 px wide; phones take the whole space under the header.
- Rim 10 px (12 px on wide); radius 30 px (36 px on wide) outside, 22 px (26 px on wide) for the glass.
- Light: silver rim `#e4e7ea → #d3d7dc → #c3c7cd`, pale glass `#f6f7f8 → #eceef1`, black dial. Dark: graphite rim `#4b4e54 → #3d4045 → #313338`, black glass `#0f1012 → #08090a`, silver dial. The finish follows the site's theme.
- Readout: name medium 500, 1.25em, −0.015em; take medium 500, 2.2em, −0.035em; "/ n" regular, `text-muted`, 1.45em; a light lit `--device-rec` with its glow while playing, `--device-meter-off` otherwise; no transport chip, no mark.
- The study's name is always on show in one place only: the readout. The dialling pop-up has no take mode; Details and Home's "Now playing" keep the title.
- Dissolve on the player, with no change inside any study's file: `data-part="plate"` loses background, shadow and grain; a `data-part="bezel"` whose direct child is `data-part="screen"` loses its rim, and that screen its ground and its `data-part="glass"`. Other bezels stay.
- `appZoom` counts 420 px of height for a short screen. Every study fits at every width `check:fit` measures.
- `npx tsc --noEmit`, `npx eslint src`, `npm run build`, `npm run check:fit`, `npm run check:anatomy` and (from Task 1) `npm run check:player` pass: `.claude/skills/study/scripts/verify.sh`.
- React Compiler rules (eslint-plugin-react-hooks 7) are errors. House voice, British spelling, units on numbers, in copy, comments and commits. Commits end with the session's attribution lines.

## Review Focus

1. **The theme switched while the page is open** (Options › Theme): the finish must change at once, with no reload. Pinned in Task 1 (`theme flip`).
2. **A short desktop window** (1280 × 600, under the `wide` height): the whole object, dial included, must stay on screen. Pinned in Task 1 (`short desktop`) and Task 4.
3. **The longest study title** on a 390 px phone: the name truncates and never runs under the take figures. Pinned in Task 1 (`long title`).
4. **Keyboard focus on the header** (Tab onto Menu, Details, Source): a visible ring, as everywhere else on the site. Pinned in Task 1 (`header focus`).
5. **Details from the header**: opens the info sheet, and opens it again after Escape. Pinned in Task 1 (`details`).

---

### Task 1: `check:player`, the decisions as a browser check

**Files:**
- Create: `scripts/check-player.mjs`
- Modify: `package.json` (scripts), `.claude/skills/study/scripts/verify.sh` (run it after the anatomy check)
- Modify: `src/components/device/device.tsx` (hooks only: `data-player`, `data-player-readout`, `data-player-name`, `data-player-take`, `data-player-light`)

**Interfaces:**
- Produces: `npm run check:player` (env `BASE_URL`, default `http://localhost:3000/studies`; `CHROMIUM_PATH` as in `check-fit.mjs`). Exit 0 when every case passes, 1 with one line per failure otherwise.
- Produces DOM hooks later tasks keep: `[data-player]` on the object (today's `.slab`), `[data-player-screen]` (today's `data-slab-screen`), `[data-player-readout]`, `[data-player-name]`, `[data-player-take]`, `[data-player-light]` (`data-on` while playing), `[data-player-hud]` on the pop-up.

- [ ] **Step 1: Add the hooks to the spike's markup** in `device.tsx` and `readout.tsx` (attributes only; rename `data-slab-screen` to `data-player-screen` and its selectors in `globals.css`).

- [ ] **Step 2: Write `scripts/check-player.mjs`** in the style of `scripts/check-fit.mjs` (same `launch()`, `BASE_URL`, one line per failure). Cases, each a named function run in a fresh page at `${BASE_URL}`, theme set with `document.documentElement.dataset.theme`:

```js
// size: 1440×900, light. 
expect(box.width <= 880.5, "object at most 880 px wide");
expect(Math.abs(box.width / box.height - 160 / 116) < 0.01, "object at 160 × 116");
// short desktop: 1280×600 — every part of [data-player] inside the viewport (getBoundingClientRect of the object and its dial).
// phone: 390×844 — [data-player] within 0..390 horizontally; no horizontal scroll (scrollWidth <= innerWidth).
// short landscape: 844×390 — object, dial and readout inside the viewport; [data-player-screen] at least 240 px tall.
// finish, light: getComputedStyle([data-player]).backgroundImage includes "rgb(228, 231, 234)"; dark: includes "rgb(75, 78, 84)".
// theme flip: load light, set dataset.theme = "dark", next frame: backgroundImage includes "rgb(75, 78, 84)".
// readout: [data-player-readout] innerText, whitespace collapsed, equals `${title} ${take} / ${n}` (title from [data-player-name]);
//          no descendant with text "Play", "Pause" or "Stop".
// name once: count visible elements outside [data-app] and outside section[aria-label] whose own text equals the title: exactly 1.
// light: press Space → [data-player-light] has data-on; press Space → it hasn't.
// dissolve: in [data-player-screen], every [data-part="plate"] has backgroundImage "none" and boxShadow "none";
//           step to Spool (take 01): its [data-part="bezel"] has boxShadow "none", its [data-part="glass"] display "none";
//           step to Number Ticker: its bezel's boxShadow is not "none".
// hud: press ArrowRight; within 300 ms [data-player-hud] is not visible (opacity 0) or does not contain the new title;
//      press ArrowUp: [data-player-hud] is visible and contains "Volume".
// long title: 390×844, dial to the take whose title is longest (by length, from the Find list);
//             [data-player-name]'s right edge <= [data-player-light]'s left edge, and its scrollWidth > clientWidth or it fits.
// header focus: press Tab until document.activeElement is the Menu button: its computed outlineStyle is "solid".
// details: click the header's Details; the info sheet (section/aside holding the study's description) is visible;
//          press Escape; click Details again: visible again.
```

- [ ] **Step 3: Add `"check:player": "node scripts/check-player.mjs"`** to `package.json` and a step to `verify.sh` after the anatomy check: `BASE_URL="$BASE_URL" npm run --silent check:player`.

- [ ] **Step 4: Run it against the spike and record what fails**

Run: `SKIP_BUILD= .claude/skills/study/scripts/verify.sh` (builds, starts, runs all checks)
Expected: `check:player` FAILS on `hud` (the pop-up still shows the title) and `short landscape`; every other case passes. If another case fails, fix the check, not the player: the spike is the approved design.

- [ ] **Step 5: Commit** (`scripts/check-player.mjs`, `package.json`, `verify.sh`, the hooks). Subject: "Add check:player: the Slab's decisions as a browser check".

### Task 2: The finish as tokens

**Files:**
- Modify: `src/design-system/tokens.css` (light `:root` block and `[data-theme="dark"]` block)
- Modify: `src/design-system/tokens.ts` (`device.light`, `device.dark`, `materials`)
- Modify: `src/app/globals.css` (the spike's Slab block)
- Modify: `src/components/device/device.tsx` (class names)

**Interfaces:**
- Consumes: Task 1's hooks and `check:player`.
- Produces tokens (each light and dark, values exactly the spike's `--slab-*` in `globals.css`): `--device-casing`, `--device-casing-shadow`, `--device-casing-blend`, `--device-pane`, `--device-pane-edge`, `--device-pane-sheen`, `--device-pane-panel`, `--device-ring`, `--device-ring-edge`. In `tokens.ts` the keys are the names without `--device-`.
- Produces classes: `.player`, `.player-casing` (with its brushed `::before`), `.player-pane`, `.player-sheen`, `.player-ring`, replacing `.slab`, `.slab-rim`, `.slab-glass`, `.slab-sheen`, `.slab-ring`.

- [ ] **Step 1: Move the values.** Cut the spike's `:root` and `[data-theme="dark"]` `--slab-*` blocks from `globals.css` into `tokens.css` under the names above, beside the other `--device-*` tokens; mirror them in `tokens.ts`.
- [ ] **Step 2: Retire the frame.** Delete `--device-frame` and `--device-frame-edge` from both files, and `--device-body-shadow` if `grep -rn "body-shadow" src` finds no other user. In `materials`, replace "Frame" with `{ name: "Casing", tokens: ["casing", "casing-shadow", "casing-blend"], use: "The player's metal: brushed along its width, silver in light and graphite in dark, lit from the upper left, its side wall showing below." }` and add `{ name: "Pane", tokens: ["pane", "pane-edge", "pane-sheen", "pane-panel", "ring", "ring-edge"], use: "One sheet of glass in the casing, holding the screen, the tape, the readout and the dial: pale in light, black in dark. The dial goes through it in a ring of the casing's metal." }`.
- [ ] **Step 3: Rename the classes** in `globals.css` and `device.tsx`.
- [ ] **Step 4: Verify.** Run: `grep -rn "slab\|--device-frame" src` → no output. Run `verify.sh` → `check:player` still fails only on `hud` and `short landscape`; `check:fit` and `check:anatomy` pass.
- [ ] **Step 5: Commit.** Subject: "Make the Slab's finish tokens: casing, pane and ring".

### Task 3: One readout, one pop-up mode, no dead code

**Files:**
- Modify: `src/components/device/readout.tsx` (one `Readout`: the spike's `GlassReadout`, renamed; delete the old `Readout`, `ChipGlyph`, `chip`, `art` and the logo imports)
- Modify: `src/components/device/screen.tsx` (delete `StatusBar`, `side`)
- Modify: `src/components/device/device.tsx` (HUD volume-only; imports)
- Modify: `src/app/globals.css` (delete `.deck-grid` and its media query; delete the `roomy` variant; keep `wide`, and `short` for Task 4)

**Interfaces:**
- Produces: `Readout({ at, n, title, transport, className }: { at: number; n: number; title: string; transport: Transport; className?: string })` from `./readout`, carrying the Task 1 hooks.
- Produces: the HUD's state as `const [hud, setHud] = useState<number | null>(null)` (the time it was shown); `showHud()` takes no argument and is called only where the volume changes. `Transport` stays exported from `./readout`.

- [ ] **Step 1: Write nothing new: `check:player`'s `hud` case is the failing test.** Run it; expected FAIL on `hud`.
- [ ] **Step 2: Make the pop-up volume-only.** Remove the three `showHud("take")` calls and the take branch of the `Hud` children; the live region still announces each study.
- [ ] **Step 3: Merge the readouts** and delete `StatusBar`, `side`, `.deck-grid` and `roomy` (and their now-unused imports).
- [ ] **Step 4: Verify.** `npx tsc --noEmit && npx eslint src` clean; `grep -rn "GlassReadout\|StatusBar\|deck-grid\|roomy" src` → no output; `verify.sh` → `check:player` fails only on `short landscape`.
- [ ] **Step 5: Commit.** Subject: "Say the study's name once on the player, and drop the old deck".

### Task 4: Short landscape phones

**Files:**
- Modify: `src/components/device/device.tsx`, `src/app/globals.css` (the `short` variant: `orientation: landscape` and `max-height: 520px`)

**Interfaces:**
- Consumes: Task 2's classes, Task 3's `Readout`.

- [ ] **Step 1: The failing test is `short landscape`** (844 × 390). Run it; expected FAIL.
- [ ] **Step 2: Lay the pane out as a row when `short`:** the screen and the tape stacked on the left, filling the height; on the right a column about 11em wide with the readout (name over the take) above the dial, the dial at least 8.5em so each arrow stays 24 px or more. The header stays above; the object fills the space under it.
- [ ] **Step 3: Verify.** `verify.sh` passes in full, `check:player` included; then look at 844 × 390 and 740 × 360 in light and dark.
- [ ] **Step 4: Commit.** Subject: "Lay the Slab out sideways on phones held in landscape".

### Task 5: The design language

**Files:**
- Modify: `DESIGN.md` (Ethos: "The player is an object, not a page", "It is restrained"; Materials: "Frame and bezel" becomes "Casing, pane and bezel"; Lights; Writing: "Say it once"; How to make a new study, step 10, `/studies` not `/`)
- Modify: `src/app/(site)/system/page.tsx` (the player's description at line 20, and anything naming the frame)
- Modify: `src/components/system/materials.tsx` only if it renders the frame

**Interfaces:**
- Consumes: Task 2's tokens and `materials` entries (the /system page renders them).

- [ ] **Step 1: Rewrite the sections** from the spec's "What was decided": the object (160 × 116, up to 880 px, the casing, one pane, the dial through it), the finishes by theme, the header, the dissolve rules and why, the readout (name, take, light; why no chip), and "Say it once" (always-on show vs screens opened on purpose). Keep the house voice and the reasons; remove what no longer exists (the frame's 80vw rule, the maker's window in the readout, the status line, the chip on the player's LCD).
- [ ] **Step 2: Update `/system`'s description** of the player to the casing and pane.
- [ ] **Step 3: Verify.** `grep -n "frame\b\|80vw\|status line\|bumper" DESIGN.md` returns only the capture frame and history lines that say what was replaced; `verify.sh` passes; `/studies/system` renders Casing and Pane in light and dark.
- [ ] **Step 4: Commit.** Subject: "Write the Slab into the design language".

### Task 6: Look at it, then push

- [ ] **Step 1:** Run `verify.sh` once more from a clean build. Expected: every check passes.
- [ ] **Step 2:** Look on `/studies` at 1440 × 900, 1280 × 600, 390 × 844 and 844 × 390, light and dark: the tape playing, paused and stopped; Home, Find, Options; Details; three studies that are screens and three with hardware readouts.
- [ ] **Step 3:** `git push -u origin claude/wonderful-archimedes-ex0jz9`, and confirm the Vercel preview for the last commit is READY.
