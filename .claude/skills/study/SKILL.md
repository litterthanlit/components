---
name: study
description: Build, re-skin or review a study (a component in src/registry/components/) or a part of the player (src/components/device/) so it meets the design language in DESIGN.md — the plate, well and part materials, the --device-* tokens, springs and mechanisms, the synthesized sound contract, the house voice and the ten-rule study bar. Use whenever a task touches those folders, src/design-system/tokens.css or a --device-* token, or asks to add, design, polish, re-skin or review a component, even when DESIGN.md isn't mentioned.
---

# Study

The taste of this gallery is written down, with its reasons, in `DESIGN.md` at the root of the repo. This skill doesn't restate it. It says which part to read for the task in hand, turns the study bar into a checklist, lists the ways work drifts off the language, and runs the checks.

## Where the truth lives

- **`DESIGN.md`** holds the why and the rules. Read the sections the task needs (below), not the whole file.
- **`src/design-system/tokens.css`** holds every value (mirrored for TypeScript in `tokens.ts`). Take values from the tokens, never from prose. If DESIGN.md and the code disagree, the code is right and DESIGN.md is out of date: say so rather than guess.
- **`src/registry/components/knob.tsx`** and **`step-sequencer.tsx`** hold the idiom. Read one before writing a line, and match its structure, naming and comment density: a prose header that explains the mechanism, and comments that say why, with numbers.

## What to read

| Task | DESIGN.md sections | And |
| --- | --- | --- |
| A new study | Ethos; Materials; The study bar; How to make a new study | `knob.tsx` |
| Re-skin or restyle | Materials; Colour, type, shape and elevation | `tokens.css` |
| A mechanism, animation or drag | Motion and physics | `src/design-system/motion/spring.ts` |
| Sound | Sound (the voices, the contract, the host-transport rule) | `src/lib/sound.ts` |
| Words: labels, LCD copy, registry entries, commits | Writing | |
| The player itself | Ethos; Materials | `src/components/device/` |

## Building a study

DESIGN.md's ten steps, one line each. The detail is under "How to make a new study".

1. Pick a product pattern teams ship, the instrument mechanism it could be, and the moment that shows it off in four seconds.
2. Create `src/registry/components/<slug>.tsx` from the plate recipe (Materials, Plate), then build in wells, keys, caps, an LCD and lights.
3. Give it a real, controlled API: `value`, `onChange`, a form `name` where it fits.
4. Model the mechanism with `createSpring` or a small integrator, writing CSS variables, not state.
5. Make it run by itself from the first frame. Stop for good at the first touch, and under reduced motion.
6. Sound it with `play()`, and follow the host-transport rule for anything it does by itself.
7. Make it accessible: native roles, one tab stop, focus that follows the hand (`focusQuietly`), a live region.
8. Size it to its container in em. Check it at 282 × 332, on a 360px phone and in the 702 × 374 capture frame, in light and dark.
9. Register it at the top of `src/registry/index.ts` and with one line in `src/registry/previews.tsx`.
10. Run the checks (Verify, below), look at it on the player, and commit in the house voice.

## The study bar

Every study meets all ten before it goes on the player. The names are DESIGN.md's, word for word, so each can be looked up under "The study bar".

- [ ] 1. **It moves in its first four seconds, untouched.** The starting state is never still for more than about half a second.
- [ ] 2. **It fits a 282 × 332 box.** An `@container` root, a `cqw`-clamped font size, em inside, touch targets of 24px or more.
- [ ] 3. **It is built from the materials.** Plate, then well, then part. Both themes look intentional.
- [ ] 4. **It sounds through `play()`.** Existing voices only, varied with `pitch` and `gain`.
- [ ] 5. **It turns without transforms.** Conic gradients, SVG attributes, or a transform inside an `overflow-hidden` wrapper.
- [ ] 6. **It rounds its trigonometry.** Coordinates rendered on the server go to two decimals.
- [ ] 7. **It passes the React Compiler rules** (eslint-plugin-react-hooks 7, as errors). No `ref.current` during render, no synchronous `setState` in an effect body, no impure calls in component scope.
- [ ] 8. **It is accessible.** Native roles, one tab stop per composite, quiet focus, a polite live region, reduced motion.
- [ ] 9. **It draws without React.** Frames write CSS variables or attributes; loops stop when idle or off-screen.
- [ ] 10. **It is one file.** It imports `react`, `@/lib/sound` and `@/design-system` only, and exports the component and a default `Demo` with a single root.

## Never

The usual ways work drifts off the language. Each one is a rule somewhere in DESIGN.md.

- A flat `shadow-md` card on the hardware, or a study that is a second player.
- A colour that isn't a token, a colour that means two things, or orange as text (it is 2.3:1 on the plate: a light beside a word, never the word).
- A hex value or a shadow typed into a component when a `--device-*` token already holds it.
- A new sound, or a study's own sounds ignoring `hostTransport`. The viewer's input always sounds.
- `scale(0)`, or a duration and a curve on anything that follows the hand or can be interrupted. That is a spring's job.
- `setState` every frame, or `Math.random` and `performance.now` in component scope.
- px or viewport units inside the plate. Everything there is in em of the plate's one font size.
- Radii that don't nest inward: plate, then well, then key or LCD, then chip.
- Taking focus on mount, or a focus ring after a pointer press.
- Debug overlays, explanatory chrome, or labels that point at what to admire.
- Capitals typed into the source, Title Case, or labels like "Submit" and "OK". CSS sets the capitals; a label says what happens.
- US spelling. Colour, centre, dialled; but synthesized and motorized (Oxford -ize).
- A hyphen for a minus, an `x` for a times sign, or a number without its unit.
- Proportional figures on anything that changes. Use `tabular-nums`.
- Saying a thing twice. If the screen says it, the LCD doesn't.

## Reviewing a study

When asked to review a study or the player, and before committing your own work, walk the study bar and the Never list against the file. Report one table, failures first:

| Rule | Result | Where | Fix |
| --- | --- | --- | --- |
| 4. It sounds through `play()` | Fail | `<file>:<line>` | What to change, in one line |
| 1–3, 5–10 | Pass | | |

Fix the failures yourself unless the task was a review only. Some rules can't be judged from the code (it moves in four seconds; both themes look intentional): look in the browser, or say it wasn't checked, rather than marking it a pass.

## Verify

```sh
.claude/skills/study/scripts/verify.sh [slug ...]
```

This generates Next's route types (so a fresh clone type-checks), then runs the type check, lint and a production build, then the overflow check (`check:fit`) against a server it starts and stops itself. Pass slugs to check only those; with none, it checks every study, as CI does. `PORT` moves the server off 3100, `SKIP_BUILD=1` reuses a fresh build, and `CHROMIUM_PATH` picks the browser.

Then look at it, which no script does:

- On the player (`/studies`: type its name, press Enter), with the tape playing, paused and stopped.
- In light and in dark.
- On a phone 360px wide.

## Commit

An imperative subject that names the study and its mechanism ("Add Fader: a motorized strip that plays back its mix automation"), and a body in prose that explains the design and the engineering with real numbers. See Writing in DESIGN.md.
