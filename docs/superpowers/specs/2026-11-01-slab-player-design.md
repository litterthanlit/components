# The Slab player

The home page's player, rebuilt as one physical object: a sheet of glass in a metal rim, sitting on the page at the size of a real device. This turns the spike on `claude/wonderful-archimedes-ex0jz9` (commits `4b23d9c` to `847ba5f`) into the finished player.

## Why

Nick looked at the old player and named four things that didn't make sense:

1. **It was too wide.** It took 80% of the window, so it read as a page with a border, not an object.
2. **It was a screen inside a screen.** Every study drew its own silver plate, and studies that are screens drew a monitor too, all on the player's own screen.
3. **The study's name was said three times.** In the old player: the screen's title bar, the readout, and the study's own lettering.
4. **It didn't feel like a real material.** He wants it to read as an object you could hold: real metal, real glass, real depth.

We explored six front-view directions on a design canvas (https://claude.ai/artifact/FzMXoAnrQ9v7UmEXycNj6D) and he chose **F · Slab**. He then asked for it on the real site, saw the spike, asked for a light finish, more removal of nested screens, the transport chip gone, and the readout's type heavier. After those he said: "I like this new look way better, start building the player."

## Goals

- The player is one object on the page, at its own proportions, never wider than 880 px.
- A study on the player reads as what the screen is showing, never as a second device on it.
- The study's name appears once on the player: on the readout.
- The body reads as brushed metal, the screen as glass, with depth, a lit edge and a shadow on the page.
- Everything the old player could do still works the same way: the dial, the tape, PLAY, pause, STOP, Home, Find, Options, Details, Source, the keyboard, the sound, the live region, reduced motion.

## Non-goals

- No change to how studies behave, or to their component pages (`/c/<slug>`). Studies keep their plates everywhere except on the player.
- No change to sound, the tape's mechanics, the dial's mechanics, or the take timing.
- No 3D player. The three.js model was an exploration only.

## Anti-goals (failures even if it works)

- A study that looks like a device sitting on the player's screen, with its own plate, bezel or monitor showing.
- The player stretching across a wide window.
- The study's name, or the transport state, repeated in more than one place on the player.
- A finish that ignores the site's theme.

## What was decided

These are Nick's decisions, made by reacting to the spike.

### The object

- **Proportions:** 160 × 116 on wide viewports, as large as the window allows up to 880 px wide. On phones it takes the whole space under the header. (116 rather than the mockup's 110 is my call: it gave every study room to fit. See "Fit".)
- **Construction:** a metal rim (10 px, 12 px on wide) round one sheet of glass. The screen, the tape and the deck are all regions of that one sheet. The dial goes through the glass in a ring of the rim's metal.
- **Finish follows the theme:**
  - Light: silver rim, brushed along its width, with pale glass (`#f6f7f8` to `#eceef1`) and a black dial.
  - Dark: graphite rim with black glass (`#0f1012` to `#08090a`) and a silver dial.
  - This keeps the old body-and-dial pairing (the dial is the opposite finish).
- **Light and depth:** the rim is lit from the upper left. A 7 px side wall shows below it, and a soft shadow falls on the page. A diagonal sheen crosses the whole sheet of glass.

### The page around it

- A header row above the object holds the site's name ("Components") on the left. On the right are Menu (Back on a screen), Details and Source. Details and Source show only on a take.
- These replace the old status bar on the screen. Details opens the same info sheet the title used to open.

### Studies on the screen

- **Plates dissolve.** On the player, a study's `data-part="plate"` loses its background, shadow and grain, and the stage behind it goes clear. Its wells, keys and LCDs sit straight on the glass, in the theme's finish.
- **Screens dissolve too.** A study that is itself a screen loses its bezel's rim, the screen's own ground, and its glass. Today that means Spool, Gradient Keys and Command Menu. The rule: a `data-part="bezel"` whose direct child is a `data-part="screen"`. What it shows then sits straight on the Slab's glass.
- **Hardware readouts keep their bezels:** Number Ticker's drums, One-Time Code's cells, Ticker's matrix, VU Meter's faces.
- **The player's own screens** (Home, Find, Options) take the glass's colour (`--slab-panel`), so they don't read as a sheet laid on it.

### The readout

- Printed straight into the glass in the page's ink. No well, no LCD box, no maker's mark.
- Left: the study's name, medium (500), 1.25em, tracked −0.015em.
- Right: one round light, then the take number and the total.
  - The take number is medium (500), 2.2em, tracked −0.035em.
  - The "/ 24" is regular, grey (`text-muted`), at 1.45em, about two-thirds the take's height.
  - The light is lit red (`--device-rec`, with its glow) while the tape plays, and unlit (`--device-meter-off`) otherwise.
- **No transport chip.** The dial's centre already shows ▶ or ❚❚, and the moving playhead shows the tape running.

### Spool

- Its chip says FF while it spools (was "Spool"), and its key says Hold (was "Spool"). This keeps its name off its own hardware.

### Fit

- `appZoom` counts 420 px of height for a short screen rather than 380. On a wide stage a demo grows to its full width, and can stand up to 40 px taller.
- With that and the 116 proportion, all 24 studies fit at every width `check:fit` measures, with 21 px to spare at the tightest.

## Constraints

- Follow `DESIGN.md` and `.claude/skills/study/SKILL.md` (it covers `src/components/device/` too).
- Values come from tokens. `src/design-system/tokens.css` is the source of truth and `tokens.ts` mirrors it.
- `npx tsc --noEmit`, `npx eslint src`, `npm run build`, `npm run check:fit` and `npm run check:anatomy` must pass (`.claude/skills/study/scripts/verify.sh`).
- React Compiler rules (eslint-plugin-react-hooks 7) as errors.
- The house voice in copy and commits: plain, British spelling, units on numbers.

## What the spike left rough (to finish properly)

1. **Tokens.**
   - The `--slab-*` values are typed into `globals.css`. They belong in `tokens.css` (light on `:root`, dark on `[data-theme="dark"]`), mirrored in `tokens.ts`.
   - Retire `--device-frame` and `--device-frame-edge`, which nothing will use. The same goes for any other token only the old frame used.
2. **Dead code.**
   - Remove the old `Readout` (its maker's mark and LCD), `StatusBar`, the `.deck-grid` CSS, and the `wide`, `roomy` and `short` variants that only the old deck used. Keep a variant only if something else still uses it.
   - Fold `GlassReadout` into `Readout`'s name and place.
3. **Short landscape phones** (the old `short` variant): not reworked in the spike. The object should still work there, deck beside the screen or stacked, with nothing clipped.
4. **The design language.**
   - Update `DESIGN.md` so it describes the Slab: Ethos (the player is an object), Materials (the frame becomes the rim and glass), the readout, the page header, and the dissolve rules.
   - Update `/system`, which renders the materials live and describes the player in words, so it shows the rim, glass and readout, not the frame.
5. **Anatomy.** The player isn't taken apart today. Keep it that way unless it comes free.

## Left to the builder

- How the CSS is split between `globals.css` and the components, as long as values come from tokens.
- Whether the dissolve rules stay as CSS selectors on `data-slab-screen`, or become a data attribute the screen sets. They must not need any change inside a study's own file.
- Exact sizes of the deck on phones, as long as the dial stays a comfortable target (24 px or more for each arrow) and nothing clips.
- Naming (`slab` or something plainer), as long as it is consistent.
