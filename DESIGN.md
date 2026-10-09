# Design

The design language of this gallery: the player on the home page, the studies it runs and the site around them. It is written for designers, engineers and the agents that build here, and it explains the reasons as well as the rules.

The values live in code. `src/design-system/tokens.css` is the source of truth (mirrored for TypeScript in `tokens.ts`); springs are in `src/design-system/motion/spring.ts`, sound in `src/lib/sound.ts`, the player in `src/components/device/`, the studies in `src/registry/components/`, the anatomy that takes them apart in `src/components/anatomy/`. `/studies/system` renders all of it live, in both themes. If this file and the code disagree, the code is right and this file is out of date.

## Ethos

### The player is an object, not a page

The home page is a player after a field recorder: a cool silver body in a machined frame, a full-width screen, wells pressed into the body, keys that sink 2px onto their base, a dial in the body's opposite finish with PLAY at its centre, a tape of waveforms with a red playhead. It is something you could hold, and it runs the studies one at a time.

An object gives every study the same frame and makes polish legible: a lit edge, a recess or a 2px base is either right or it isn't. So a study is a part of the same instrument, built from the same materials, never a card on a screen and never a second player. When a click-wheel player ran inside the player's screen, it competed with it, and it was taken out.

### It uses an instrument's vocabulary

Takes, the tape, the transport (PLAY, pause, STOP), a slate, detents, scenes, automation in READ and TOUCH, `take_04.wav`. An instrument's words arrive with behaviour people already know: STOP rewinds to the first frame, a motorized fader lets go when you touch it. The interface needs fewer explanations because the vocabulary carries them.

The vocabulary dresses the demo, not the component. A Fader is a range slider with a real API; its demo plays back a mix.

### It runs by itself and rewards the hand

With PLAY on, each study gets four seconds on screen, untouched (3, 4 or 6 in Options). On X, the first frames are all anyone sees. So every study moves on its own from the start: a knob desk recalls a scene on its motors, a switch plate runs its self-test, a ghost types into the command menu, the fader strip plays back automation, the erase key rehearses its hold.

A hand always wins. A touch ends the ghost for good, a motor lets go of a cap the moment a finger is on it, and the player's tape waits 2.5 s after any press, key or drag on the study (`HOLD_AFTER_TOUCH`), however long the drag lasts.

### It makes sound

Every press clicks: a key goes down with a low thock and comes up lighter, the dial ticks once per 15° detent, the end of a list bumps. Sound confirms a press faster than sight, and it makes the hardware believable. Everything is synthesized with Web Audio, so nothing loads; it is quiet and dry, silent until the viewer's first gesture, and Options › Sound (or M) mutes it.

What a study does by itself asks the player first (the transport rule, under Sound). What the viewer does always sounds.

### It is restrained

Monochrome, plus red for REC and the playhead, orange for a hand on it, and one blue on the screen for selection. Figures are tabular, so a count never shuffles sideways. Grey text, hairlines and one weight change on the page. The work should be the loudest thing here, and when a colour only ever means one thing, it reads at once.

Restraint is also subtraction. The player lost its battery icon, timecodes, scanlines, a BACK key and a keyboard legend because each one repeated something the screen, the LCD or the hold switch already said. Later it lost the file name beside the LCD (the screen names the study), the captions under the transport (▶ and ■ need no words), a maker's window that stood the full height of the deck (it became a nameplate, and then the left end of the LCD: the maker stays quiet inside the readout), the LCD's running clock and level meters (the tape already shows where the playhead is, so the LCD says only the state, the study's name and the take, as a CD player's display does), a FIND key (Find is on Home, and on /), the HOLD switch (Options › Sound and M already muted), the STOP key (hold the dial's centre) and the deck's key row (Menu and Source sit at the screen's top corners, and Options is on Menu). The deck keeps only what plays the tape: the readout (the mark and the LCD on one strip of glass) and the dial. The mark animates only under a mouse: on the deck, nothing moves by itself but the tape and the lights.

It is after a field recorder, not a copy of one, and its finish is after a click-wheel player's: a cool, bead-blasted silver with the dial in black (in dark, graphite with the dial in silver), so the one part the hand works is the one that stands out. Its parts are arranged around what this player does: it runs studies by itself, so PLAY is the largest key on the deck, at the centre of the dial that steps through them. It is printed in the same grey as every other legend. On the body, colour is a signal (the LCD's play dot, the playhead, the window's light), never a way to make a key look important.

### Physics carry the feel

Where a study stands in for a mechanism, it models the mechanism: springs that keep their velocity when interrupted, motors against hands, detents that click as they pass, an over-centre switch that snaps through under the finger, tape that winds by the square root, needles with VU ballistics, counter drums that carry. A duration and a curve can't be interrupted gracefully, can't overshoot from a flick, and can't tie a click to the exact moment a detent passes. A small integrator can.

### Accessibility is native

A hardware metaphor is no excuse for a div. The dial's ring, the tape, a knob and a fader are `role="slider"`; a switch is `role="switch"`; the command menu is a combobox over a listbox; the one-time code is one real `<input>` under six drawn cells, so paste, SMS autofill and password managers work. One tab stop per composite. Focus follows the hand without a ring and comes back for the keyboard. State changes are said once in a live region. Reduced motion stops anything that loops by itself, motors jump instead of travelling, and rehearsals never start.

### Studies are product patterns, done with the player's polish

The audience is product teams and people on X. A study is something teams ship (a command palette, a settings toggle, a 2FA field, a progress bar, notifications, a destructive confirm) built to the player's standard. The hardware is the polish; the product pattern is the subject. These are not music toys.

The craft speaks for itself: no debug overlays, no explanatory chrome, no labels that point at what to admire. Component pages were stripped down to the name for the same reason. The one exception is a study's anatomy (see Anatomy), which names its parts because naming them is its job: it is documentation, on the documentation's pages, one part at a time, and never on the player.

### The house voice is plain, precise, British-spelled and quiet

Colour, centre, dialled; synthesized, motorized. Numbers carry units and real symbols. Say a thing once. See Writing.

## Materials

The player is built from a few materials, each a small group of `--device-*` tokens with a light and a dark value. Studies use the same tokens, so a study reads as a part of the same object in either theme. The greys are cool, a little blue, as anodized aluminium is. The dark player is a graphite body, not an inverted one: its keys are lighter than the plate, its engraving casts the other way, and its dial turns silver, so it still stands apart from the body.

They combine in one order: **plate, then well, then part**. Wells are pressed into the plate; keys, LCDs, windows and collars sit in wells; caps sit in collars. The player sits in a frame; a second screen, LCD cells and dot-matrix strips sit behind a black bezel. Everything on a plate is sized in em from the plate's one font size, so the object scales as one piece, and radii nest as they go in: plate 1.25em, well 1.05em, key or LCD 0.7em, chip 0.4em.

### Plate

The body's bead-blasted finish: a vertical gradient, a lit top edge, and fine noise blended over it.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-body` | `linear-gradient(180deg, #d9dce0 0%, #cdd0d5 55%, #c0c3c9 100%)` | `linear-gradient(180deg, #36383d 0%, #2f3135 55%, #282a2e 100%)` |
| `--device-body-edge` | `inset 0 1px 0 rgb(255 255 255 / 0.75), inset 0 0 0 1px rgb(0 0 0 / 0.06)` | `inset 0 1px 0 rgb(255 255 255 / 0.09), inset 0 0 0 1px rgb(255 255 255 / 0.02)` |
| `--device-body-shadow` | `0 1px 2px rgb(0 0 0 / 0.1), 0 18px 36px -18px rgb(0 0 0 / 0.28), 0 60px 100px -50px rgb(0 0 0 / 0.38)` | `0 1px 2px rgb(0 0 0 / 0.5), 0 18px 36px -18px rgb(0 0 0 / 0.7), 0 60px 100px -50px rgb(0 0 0 / 0.9)` |
| `--device-grain` | `0.3` | `0.3` |

Grain is `.device-grain` (in `globals.css`): a 160px tile of SVG `feTurbulence` noise (`baseFrequency 0.9`, two octaves, desaturated), blended `soft-light` at `--device-grain`. It goes on the plate only, as an absolutely positioned layer behind the content. `--device-body-shadow` is the player's own deep shadow; a study's plate takes a lighter one, the same in both themes.

Every study starts here:

```tsx
<div className="@container w-full max-w-[360px] select-none">
  <div className="relative isolate overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
    <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
    {/* wells, keys, an LCD… in em */}
  </div>
</div>
```

### Frame and bezel

The frame is machined: a band a shade darker than the body in light (lighter in dark, so it still catches the light), lit along its top edge. It holds the player (`rounded-[34px] p-[5px]`, 46px and 8px on wide decks). The player is as tall as the window and 80% of its width, between 864px and 1200px (`max-w-[min(1200px,max(864px,80vw))]`), so narrower windows give it their whole width and a wide monitor leaves it an object on the desk, not a wall. It replaced a black bumper, whose stark outline round a white body was the most recognisable thing about the recorder it came from.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-frame` | `linear-gradient(180deg, #c6c9ce 0%, #b9bcc2 55%, #adb0b6 100%)` | `linear-gradient(180deg, #484a4f 0%, #3d3f44 55%, #34363a 100%)` |
| `--device-frame-edge` | `inset 0 1px 0 rgb(255 255 255 / 0.7), inset 0 0 0 1px rgb(0 0 0 / 0.08), 0 0 0 0.5px rgb(0 0 0 / 0.16)` | `inset 0 1px 0 rgb(255 255 255 / 0.14), inset 0 0 0 1px rgb(0 0 0 / 0.5), 0 0 0 0.5px rgb(0 0 0 / 0.8)` |

A bezel is black, with a polished edge catching the light: round a second screen such as the Command Menu (`rounded-[1.5em] p-[0.4em]`), which shows the site's own ground under glass, and round LCD cells and dot-matrix strips set into the plate: `bg-(--device-rim) p-[0.3em]` with `shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)]` (the highlight drops to 0.06 in dark).

| Token | Light | Dark |
| --- | --- | --- |
| `--device-rim` | `#0d0d0e` | `#000000` |
| `--device-rim-edge` | `inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 -1px 0 rgb(255 255 255 / 0.06), 0 0 0 0.5px rgb(0 0 0 / 0.6)` | `inset 0 1px 0 rgb(255 255 255 / 0.16), inset 0 0 0 1px rgb(255 255 255 / 0.05), 0 0 0 1px rgb(255 255 255 / 0.05)` |

### Well

Anything pressed into the plate: the readout, a fader's slot, the window's recess. `rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)`. A collar is a round well, `bg-black/[0.035]` (`dark:bg-black/30`) with the same recess.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-well` | `#c2c5cb` | `#1d1e22` |
| `--device-recess` | `inset 0 1px 2px rgb(0 0 0 / 0.12), inset 0 0 0 1px rgb(0 0 0 / 0.05), 0 1px 0 rgb(255 255 255 / 0.55)` | `inset 0 1px 2px rgb(0 0 0 / 0.6), inset 0 0 0 1px rgb(0 0 0 / 0.35), 0 1px 0 rgb(255 255 255 / 0.05)` |

### Key

A raised key on a 2px base. Pressed, the face moves down 2px and the base collapses to nothing, so the key sits on it. Both shadow lists keep the same five layers (lit edge, inner shade, ring, base, drop), so press and release interpolate instead of jumping. Down takes 75ms; back up takes `--duration-exit` (150ms), ease-out.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-key-face` | `linear-gradient(#fbfbfc, #eceef1)` | `linear-gradient(#45474c, #3a3c41)` |
| `--device-key-ink` | `#2a2c31` (12:1 on the face) | `#e3e5e9` (8.8:1) |
| `--device-key-shadow` | `inset 0 1px 0 #ffffff, inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.14), 0 2px 0 0 #a3a7ae, 0 5px 12px -4px rgb(0 0 0 / 0.2)` | `inset 0 1px 0 rgb(255 255 255 / 0.12), inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.75), 0 2px 0 0 #0d0d0e, 0 5px 12px -4px rgb(0 0 0 / 0.7)` |
| `--device-key-shadow-pressed` | `inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(0 0 0 / 0.16), 0 0 0 0 #a3a7ae, 0 1px 2px -1px rgb(0 0 0 / 0.14)` | `inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(0 0 0 / 0.75), 0 0 0 0 #0d0d0e, 0 1px 1px -1px rgb(0 0 0 / 0.5)` |

```tsx
<button type="button" data-sound="key" className="group/key rounded-[0.7em] outline-offset-2">
  <span className="grid h-[2.5em] min-w-[2.5em] place-items-center rounded-[0.7em] px-[0.95em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
    <span className="text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">Options</span>
  </span>
</button>
```

The outer button keeps its place, so the hit area never moves under the finger; only the face sinks. `data-pressed` shows a key held by its keyboard shortcut the same way. A key can carry a small light in a window across its top (the step keys, the scene keys). A flat key is lettering printed straight on the well, which gives 1px under the finger.

The site's own buttons are keys too, from the `--key-*` tokens: 2px corners, a lit top edge, a 2px base, and lettering carved into the face (`--key-engrave` puts a shadow on each letter's upper wall and a highlight on its lower lip). In dark mode the primary key is the light one.

### Cap and collar

Round caps, lit from above. A cap seated in a collar (`size-[5.4em] p-[0.32em]`) uses `--device-wheel-face` with the key shadows, so it sinks like a key; a caption, when it has one, is printed underneath. The player's dial is the one round part in the body's opposite finish (its tokens are below). It is a D-pad in a collar, that also turns, and rocks 5° toward the side pressed (`perspective(600px) translateY(1.5px) rotateX(±5deg)`). Its arrows are four small solid triangles, the size of a legend, pointing the way the arrow keys they stand for do. Its centre is the deck's main key, dropping 2px into a well cut through the dial: PLAY or pause on a take, OK on a list, printed in the dial's grey. Held for 600ms on a take, the centre is STOP: a ring in its well fills over those 600ms (a press's timing, so a linear duration, not a spring), STOP fires while the finger is still down, and letting go does nothing more. Letting go sooner is an ordinary press. S stops from the keyboard. A knob's cap carries knurling, `repeating-conic-gradient(from var(--a), …)`, so it turns without a transform.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-wheel-face` | `radial-gradient(120% 120% at 50% 0%, #ffffff 0%, #f3f4f6 55%, #e6e8ec 100%)` | `radial-gradient(120% 120% at 50% 0%, #46484d 0%, #3c3e43 55%, #34363a 100%)` |
| `--device-wheel-shadow` | `inset 0 1.5px 0 #ffffff, inset 0 -3px 8px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.12), 0 2px 0 0 #a8acb3, 0 12px 28px -12px rgb(0 0 0 / 0.3)` | `inset 0 1.5px 0 rgb(255 255 255 / 0.12), inset 0 -3px 8px rgb(0 0 0 / 0.2), 0 0 0 1px rgb(0 0 0 / 0.75), 0 2px 0 0 #0d0d0e, 0 12px 28px -12px rgb(0 0 0 / 0.8)` |
| `--device-wheel-shadow-pressed` | `inset 0 1.5px 0 rgb(255 255 255 / 0.7), inset 0 -3px 8px rgb(0 0 0 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.14), 0 0.5px 0 0 #a8acb3, 0 4px 10px -6px rgb(0 0 0 / 0.26)` | `inset 0 1.5px 0 rgb(255 255 255 / 0.06), inset 0 -3px 8px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(0 0 0 / 0.75), 0 0.5px 0 0 #0d0d0e, 0 4px 10px -6px rgb(0 0 0 / 0.7)` |

The dial: the body's opposite, as a click wheel is: black on the silver body, a near-white silver on the graphite one. It keeps its own recess, engraving and the light that trails the finger, because the body's would light it the wrong way (a white lip under black glass, a black one on silver), and studies' caps keep `--device-wheel-*`.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-dial-face` | `radial-gradient(120% 120% at 50% 0%, #2c2e33 0%, #1b1c20 55%, #111215 100%)` | `radial-gradient(120% 120% at 50% 0%, #fafbfc 0%, #e6e8eb 55%, #d6d9dd 100%)` |
| `--device-dial-shadow` | `inset 0 1.5px 0 rgb(255 255 255 / 0.14), inset 0 -3px 8px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(0 0 0 / 0.6), 0 2px 0 0 #08090a, 0 12px 28px -12px rgb(0 0 0 / 0.5)` | `inset 0 1.5px 0 #ffffff, inset 0 -3px 8px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.6), 0 2px 0 0 #0f1012, 0 12px 28px -12px rgb(0 0 0 / 0.85)` |
| `--device-dial-shadow-pressed` | `inset 0 1.5px 0 rgb(255 255 255 / 0.08), inset 0 -3px 8px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(0 0 0 / 0.6), 0 0.5px 0 0 #08090a, 0 4px 10px -6px rgb(0 0 0 / 0.45)` | `inset 0 1.5px 0 rgb(255 255 255 / 0.6), inset 0 -3px 8px rgb(0 0 0 / 0.14), 0 0 0 1px rgb(0 0 0 / 0.6), 0 0.5px 0 0 #0f1012, 0 4px 10px -6px rgb(0 0 0 / 0.75)` |
| `--device-dial-recess` | `inset 0 1px 3px rgb(0 0 0 / 0.75), inset 0 0 0 1px rgb(0 0 0 / 0.5), 0 1px 0 rgb(255 255 255 / 0.08)` | `inset 0 1px 2px rgb(0 0 0 / 0.2), inset 0 0 0 1px rgb(0 0 0 / 0.07), 0 1px 0 rgb(255 255 255 / 0.75)` |
| `--device-dial-key-face` | `radial-gradient(120% 120% at 50% 0%, #26282c 0%, #1a1b1f 60%, #141518 100%)` | `radial-gradient(120% 120% at 50% 0%, #ffffff 0%, #f3f4f6 60%, #e7e9ec 100%)` |
| `--device-dial-key-shadow` | `inset 0 1px 0 rgb(255 255 255 / 0.12), inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.8), 0 2px 0 0 #050506, 0 5px 12px -4px rgb(0 0 0 / 0.6)` | `inset 0 1px 0 #ffffff, inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.16), 0 2px 0 0 #a2a6ad, 0 5px 12px -4px rgb(0 0 0 / 0.3)` |
| `--device-dial-key-shadow-pressed` | `inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(0 0 0 / 0.8), 0 0 0 0 #050506, 0 1px 1px -1px rgb(0 0 0 / 0.5)` | `inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.14), 0 0 0 1px rgb(0 0 0 / 0.18), 0 0 0 0 #a2a6ad, 0 1px 2px -1px rgb(0 0 0 / 0.18)` |
| `--device-dial-ink` | `#d4d6db` (11.7:1 on the face) | `#2a2c31` (11.4:1) |
| `--device-dial-trail` | `rgb(255 255 255 / 0.1)` | `rgb(0 0 0 / 0.07)` |
| `--device-dial-engrave` | `0 -1px 0 rgb(0 0 0 / 0.85)` | `0 1px 0 rgb(255 255 255 / 0.8)` |
| `--device-dial-engrave-glyph` | `drop-shadow(0 -1px 0 rgb(0 0 0 / 0.85))` | `drop-shadow(0 1px 0 rgb(255 255 255 / 0.8))` |

### LCD

Black glass with a diagonal sheen: the gradient breaks hard at 47%, where the light catches it. Light figures, a white chip for the state, dim units. LCDs sit in a well or behind a bezel, `rounded-[0.7em]` (0.45em for a small value readout).

| Token | Light | Dark |
| --- | --- | --- |
| `--device-lcd` | `linear-gradient(112deg, #2d2d2e 0%, #252526 47%, #1b1b1c 47.2%, #151516 100%)` | `linear-gradient(112deg, #151516 0%, #111112 47%, #0b0b0c 47.2%, #080809 100%)` |
| `--device-lcd-edge` | `inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.09), 0 1px 2px rgb(0 0 0 / 0.22)` | `inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 1px 0 rgb(255 255 255 / 0.07), 0 1px 0 rgb(255 255 255 / 0.04)` |
| `--device-lcd-ink` | `#f5f5f5` (14:1) | `#f2f2f2` (16:1) |
| `--device-lcd-dim` | `rgb(255 255 255 / 0.64)` (6.6:1) | `rgb(255 255 255 / 0.62)` (7.5:1) |

- **The chip** is `bg-white text-black rounded-[0.4em] px-[0.42em] py-[0.24em]`, a glyph and a word at 0.58 to 0.6em, semibold capitals tracked 0.02em. The glyph says the state before the word does: a red dot that pulses for play, record or recall; two bars for pause; a square for stop; a black dot for ready or loaded; an orange dot for a hand on it (TOUCH, edited) or a hand needed (an agent waiting for your OK); a red square for a fault (an agent's error), the stop's shape so it never reads as a run.
- **Figures** are light (300), tabular, tracked −0.03em; units at 0.3em in `--device-lcd-dim`. The player's LCD shows the study's name at 1.05em under the chip and the take as a track number (`05 / 22`); a clock, where a study has one, reads minutes, seconds and frames at 25 fps (`00M 14S 06F`).
- **Other faces of the same glass:** seven-segment cells over the faint 8 of their unlit segments (One-Time Code), and a dot matrix with ghost dots at 8% (Ticker).
- **A cover** is a study's artwork: its take's waveform, the same seeded signature the tape prints, at nine bold bars in `--device-lcd-ink` on a 6px tile of the glass. Levels are lifted by their square root so quiet bars still draw at 34px. Covers start the rows in Find and head the info sheet; on Home, the cover of the take on the tape stands behind the menu at about 6%, fading out towards the words.

### Window

Smoked glass set deeper than the LCD: the Tape Reels' transport. The player's Litt mark glows on the same terms at the left end of its readout's LCD, divided from the chip and the take by a hairline (`border-white/[0.08]`); on phones the readout is only the mark, with a red light that comes on while the tape plays. It rests on the brush-drawn poster and plays the mark's film only while a mouse or pen is over the readout, from the top each time; touch and reduced motion keep it still. A fine grille behind the glass (`radial-gradient(rgb(255 255 255/0.07) 0.7px, transparent 0.9px)` at 5px), a lamp's falloff, and a sheen over the top. Artwork that is black on white is inverted and screened onto it (`invert(1) contrast(1.25)`, `mix-blend-screen`), so the ink glows and the paper disappears.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-window` | `radial-gradient(120% 90% at 50% 0%, #2a2a2b 0%, #141415 70%)` | `radial-gradient(120% 90% at 50% 0%, #19191a 0%, #070708 70%)` |
| `--device-window-edge` | `inset 0 2px 7px rgb(0 0 0 / 0.65), inset 0 0 0 1px rgb(0 0 0 / 0.55), inset 0 -1px 0 rgb(255 255 255 / 0.06)` | `inset 0 2px 7px rgb(0 0 0 / 0.8), inset 0 0 0 1px rgb(0 0 0 / 0.7), inset 0 -1px 0 rgb(255 255 255 / 0.05)` |

### Lights

| Token | Light | Dark | Means |
| --- | --- | --- | --- |
| `--device-meter-off` | `rgb(0 0 0 / 0.15)` | `rgb(255 255 255 / 0.13)` |
| `--device-meter-on` | `#25272b` | `#e6e8ec` | Lit, without a signal: meter bars, a knob's ring, a step that's set |
| `--device-rec` | `#e5484d` | `#ff5c62` | REC, PLAY, the playhead, a light that fires, a wrong code |
| `--device-hold` | `#ff7a1a` | `#ff8a33` | A hand on a motor, an edited scene, a switch that's on |

A signal light glows in its own colour (`shadow-[0_0_0.45em_var(--device-rec)]`); a lit segment does not. A light sits in a small recess, `bg-black/[0.05] shadow-(--device-recess)`. It comes on at once (`duration-0`) and fades out at `--duration-exit`. The meters are `.meter-ticks` (1px bars every 3px) clipped to the level, with a 2px peak mark that holds 900ms before it falls. Orange on the light plate is 2.3:1: it is a light beside a word, never text.

### Lettering

Tiny tracked capitals printed on the body, with a 1px highlight on the side away from the light (light theme) or a shadow above (dark), so they read as printed into the surface.

| Token | Light | Dark |
| --- | --- | --- |
| `--device-label` | `#2e3035` (8.5:1 on the plate) | `#c8cbd0` (8:1) |
| `--device-label-quiet` | `#676a70` (3.5:1) | `#7e8187` (3.3:1) |
| `--device-engrave` | `0 1px 0 rgb(255 255 255 / 0.55)` | `0 -1px 0 rgb(0 0 0 / 0.8)` |
| `--device-engrave-glyph` | `drop-shadow(0 1px 0 rgb(255 255 255 / 0.55))` | `drop-shadow(0 -1px 0 rgb(0 0 0 / 0.8))` |

Engraved captions are 0.6em, semibold, uppercase, tracked 0.16em (0.14em on longer rows); 9px on the player's deck. Use `--device-label` for anything someone needs to read and `--device-label-quiet` for legends that repeat what is said elsewhere (it is about 3:1). The `-glyph` form is a filter, for SVG icons, which `text-shadow` skips.

### Glass

| Token | Light | Dark |
| --- | --- | --- |
| `--screen-glass` | `linear-gradient(158deg, rgb(255 255 255 / 0.07) 0%, rgb(255 255 255 / 0.02) 38%, transparent 38.2%)` | `linear-gradient(158deg, rgb(255 255 255 / 0.06) 0%, rgb(255 255 255 / 0.015) 38%, transparent 38.2%)` |
| `--screen-glow` | `rgb(255 255 255 / 0.7)` | `rgb(138 154 242 / 0.35)` |

Over a screen: a sheen where the light catches it, and the backlight's bloom as it wakes (`animate-wake` 900ms, `animate-bloom` 1200ms).

## Colour, type, shape and elevation

### Colour

Neutral grounds, three text greys, one accent. Every token has a light and a dark value.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `canvas` | `#fafafa` | `#0a0a0a` | Page ground |
| `panel` | `#f5f5f5` | `#111111` | Recessed areas, stages, code |
| `surface` | `#ffffff` | `#171717` | Raised objects: cards, menus, toasts |
| `ink` | `#0a0a0a` | `#ededed` | Primary text and solid buttons |
| `muted` | `#707070` | `#8f8f8f` | Secondary text, meta, icons (4.5:1 on `panel`; nudged from litt.design's `#737373` to hold it) |
| `subtle` | `#a3a3a3` | `#5c5c5c` | Decoration and disabled only (never text that matters) |
| `line` | `rgb(0 0 0 / 0.08)` | `rgb(255 255 255 / 0.08)` | Hairline borders and dividers |
| `line-strong` | `rgb(0 0 0 / 0.14)` | `rgb(255 255 255 / 0.15)` | Hover borders, inputs |
| `accent` | `#384ecb` | `#384ecb` | Blue fill: status dots, the highlight bar |
| `accent-ink` | `#ffffff` | `#ffffff` | Text on accent fills (6.7:1) |
| `accent-strong` | `#384ecb` | `#8a9af2` | Accent as text or stroke (6.5:1 light, 7.5:1 dark, where `#384ecb` would be 2.9:1) |
| `danger` | `#d93036` | `#ff6166` | Destructive and negative values |
| `focus` | `#384ecb` | `#8a9af2` | The focus ring: `outline: 2px solid var(--focus); outline-offset: 2px` |

Colour is never decoration. On the body the signals are red (`--device-rec`) and orange (`--device-hold`); everything else that lights is monochrome. Blue belongs to screens and pages: the highlight bar, a caret, a status dot. Colours that must be told apart differ in lightness as well as hue.

Artwork behind a screen's glass is the one exception: a project's cover (Gradient Keys) carries its own palette, the same in both themes, kept clear of red, orange and the accent so it never reads as a signal. It is the work, not the interface, so it may be the loudest thing on the plate.

### Type

Geist for everything and Geist Mono for code and the page's figures, loaded through `next/font/google` as variable fonts (`--font-geist-sans`, `--font-geist-mono`). OG images use the static `src/assets/fonts/Geist-400.ttf` and `Geist-500.ttf`.

| Class | Size / leading | Tracking | Weight | Use |
| --- | --- | --- | --- | --- |
| `text-display` | 32 / 1.15 | −0.035em | 500 | Page titles, rarely |
| `text-title` | 20 / 1.35 | −0.018em | 500 | Component and section titles |
| `text-lead` | 17 / 1.55 | −0.011em | 400 | Intro paragraphs |
| `text-body` | 14 / 1.6 | −0.006em | 400 | Default text |
| `text-meta` | 12 / 1.4 | −0.005em | 400 | Dates, labels, captions |

Small sizes, tight tracking, weights 400 and 500 on the page. The hardware adds its own lettering, in em of its plate:

| Style | Size | Weight | Case and tracking |
| --- | --- | --- | --- |
| Engraved caption | 0.6em (9px on the deck) | 600 | Capitals, 0.16em |
| Key lettering | 0.8em | 500 | Capitals, 0.03em |
| LCD chip | 0.58 to 0.6em | 600 | Capitals, 0.02em |
| LCD figures | 1.05em for a name, 1.9em for the take number, 2.35em for a clock | 300 | Tabular, −0.01 to −0.03em |

Every figure that changes is `tabular-nums`, on the screen and on the hardware.

### Shape

Radii grow with object size: `rounded-key` 2px (buttons), `sm` 6px (chips, kbd), `md` 8px (inputs), `lg` 12px (cards, previews, toasts), `xl` 16px (stages, large panels). On the hardware, radii are in em and nest: plate 1.25em, well 1.05em, key or LCD 0.7em, chip 0.4em; round things are round.

### Elevation

On the page, objects get a ring, not a box: `shadow-sm`, `shadow-md` and `shadow-lg` are a 1px `--line` ring plus a soft, low shadow (Vercel-style), and flat areas use a `panel` tint rather than a border. On the hardware, elevation is light: a lit top edge on everything raised, a recess on everything pressed in, a 2px base under every key. A flat `shadow-md` card never appears on the hardware.

## Motion and physics

### Curves and durations

| Token | Value | Use |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Default for anything entering or responding to input |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Things moving on screen from A to B |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and drawers |
| `--ease-spring` | `cubic-bezier(0.34, 1.36, 0.64, 1)` | A small overshoot for playful returns |
| `--duration-exit` | 150ms | Leaving, closing, hover-out, a key coming back up |
| `--duration-enter` | 210ms | Appearing, opening, hover-in |
| `--duration-move` | 400ms | Layout and position changes |
| `--stagger` | 50ms | Between siblings entering together; cap at 8 |

- Exits are quicker than entrances; hover in at enter speed and out at exit speed, so the interface never lags the pointer.
- A hardware key goes down in 75ms. A flat control takes `active:scale-[0.97]`. Never animate from `scale(0)`: start at 0.95 or more, with opacity.
- Motors that move one after another wait longer than a stagger: 120ms between a desk's knobs, 0.12s between faders joining playback, 45ms between counter drums.
- The player: a take comes in from the side it was dialled from (`take-in`, 320ms, 2.5% and a 6px blur); a dialled study opens once the hand rests for 450ms; the HUD fades 1.1s after the last change.
- Reduced motion: transitions collapse to instant, motors `jump()` instead of travelling, rehearsals and ghosts never start, loops stop, autoplay media shows a still.

### Springs

Use a spring for anything that follows the pointer or can be interrupted. `createSpring(initial, config, onUpdate)` integrates a damped spring in fixed 1/240 s steps (stable at any frame rate) and writes through `onUpdate`, usually straight to a CSS variable, so nothing re-renders. It keeps its velocity when the target moves, so a reversal mid-flight is continuous.

```ts
const s = createSpring(0, springs.snappy, (y) => el.style.setProperty("--y", `${y}px`));
s.set(row.offsetTop); // glide, keeping velocity
s.jump(row.offsetTop); // first layout, resize, reduced motion
```

| Preset | Stiffness | Damping | Use |
| --- | --- | --- | --- |
| `springs.snappy` | 520 | 40 | Follows input: the highlight bar, indicators, toggles |
| `springs.gentle` | 170 | 22 | Settling into place; the Knob's motor |
| `springs.bouncy` | 260 | 12 | Playful returns: magnetic elements, dropped items |

A study may tune its own spring for its mechanism, as below, and run it in the units it thinks in (degrees, permille of travel, figures on a drum).

### Mechanisms

- **Motor and hand** (Knob, Fader). Values set from outside travel on the motor (Knob: `springs.gentle` in degrees; Fader: stiffness 240, damping 30, a whisker under critical, in permille of travel). Values set by hand land at once. While a hand is on a motorized cap the motor lets go of it; when the hand leaves, the motor takes the cap to wherever the value moved on to. One spring update draws the cap, the lights, the LCD and makes the clicks, so what you hear always matches what you see.
- **Detents.** A click for every detent the spring passes, pitched with the value (`play("tick", { gain: 0.55, pitch: 0.9 + (detent / detents) * 0.25 })`), so a motor recalling a scene sounds like a desk resetting itself. The dial clicks every 15° (a press that slides more than 8° becomes a turn), a reel every 30°. The Fader's unity detent catches the cap within 1.2% of the range and holds it until the hand pulls 3.5% clear.
- **Over-centre** (Switch). A small integrator at 480 Hz, not a transition. Under a finger the cap lags further and further toward the centre (3% breakout; it reaches the centre at 72% of finger travel), through a stiff follower (2200, 84). At the centre it snaps through, driven by a spring of 40 preload plus 260 at its peak, onto a hard stop (16000, 180) with 2 to 4% of give, while the finger is still down. On release short of the centre the cap is projected 150ms ahead at the finger's speed: a flick decides by velocity, not position. Past either end it rubber-bands (up to a tenth of its travel) and bumps once. The snap plays `toggle`, calls `navigator.vibrate(8)` and reports the change on the same frame the light comes on.
- **Tape** (Tape Reels). A pack's radius grows with the square root of the tape on it, `r = √(r_hub² + p · (R² − r_hub²))`, so the emptying reel visibly speeds up, and each reel's angle comes out in closed form, `θ = 2(r − r_hub) / k`. Progress eases in on stiffness 140, damping 24 (critically damped: the reels have mass), so a jump whirls both reels like fast-forward. The tape is redrawn every frame as tangents to the packs.
- **VU ballistics** (VU Meter). 99% of a steady tone in about 300ms with about 1.5% overshoot (stiffness 166, damping 20.2). A detector with a 60ms release ahead of the spring lets a key press swing the needle toward 0 without pinning it, as a real VU under-reads transients; the peak light holds 600ms past +3 VU. The scale is linear in voltage, 0 VU seven tenths of the way across, calibrated to the slate tone leaving the bus.
- **Counter drums** (Number Ticker). Each drum turns on its own spring (150, 21) and clicks for each figure that passes. Counting up, drums roll forward through 9 to 0 as a mechanical counter carries; counting down, they roll back. They mount at 0 and roll on the first frame.
- **The highlight bar** (the player's lists, Command Menu). A second copy of the rows in accent and white, clipped to the selection by a `springs.snappy` spring, so it glides between rows and the text changes colour exactly where the bar is.
- **The menu dot** (Home). Home is a player's top menu: tracked capitals in grey, the chosen row in ink, and a blue dot hung in the margin beside it, riding the same spring as the bar. The words line up with the text above; the dot sits outside them.
- **Meters.** Bars fall at 26 dB a second; the peak mark holds 900ms, then falls at 12 dB a second.

## Sound

Short sounds synthesized with Web Audio in `src/lib/sound.ts`: a few milliseconds of filtered noise (the mechanism) and, where it helps, a short sine or triangle (the body, or a tonal confirm). A 2009 click wheel, a little warmer. Nothing loads.

### The voices

| Name | What it is | Minimum gap |
| --- | --- | --- |
| `tick` | One detent: 4ms of band-passed noise and a 5ms falling blip. Fired up to 70 times a second, so it stays tiny | 14ms |
| `bump` | The end of a list: the same detent, lower and duller | 40ms |
| `press` | A key going down: a low thock with a little body | 20ms |
| `release` | The key coming back up: lighter, higher, quieter | 20ms |
| `select` | The centre button: a firm click, then E6 and B6 | 40ms |
| `back` | Going back: a softer click, the confirm falling (G6, D6) | 40ms |
| `open` | A screen taking over: a click and air sweeping up | 80ms |
| `close` | Leaving it: the sweep going down | 80ms |
| `toggle` | A switch: two tiny clicks 16ms apart, the second lower | 40ms |
| `start` | The transport latching, then a rising two-note beep (A5, E6) | 80ms |
| `stop` | A heavier thock and a low note winding down, like reels coming to rest | 80ms |
| `slate` | The line-up tone: 1 kHz held for most of a second | 1000ms |
| `wake` | The device waking: open fifths blooming in turn. Once per visit | — |

Use these and no others. Vary a repeated sound with `pitch` and `gain`, never with a new sound: a turn of the dial is `tick` at a pitch between 0.97 and 1.03, a knob's detents rise with its value, a hold's ratchet climbs `0.88 + n × 0.045` light by light.

### The bus

`input → dry + a faint room → master → compressor → speakers`. The master level (0.5) puts a tick near −24 dBFS and a press near −18. The room is 300ms of generated, low-passed stereo noise sent at 0.07, for warmth rather than reverb. The compressor (threshold −14 dB, knee 6, ratio 12, attack 2ms, release 120ms) keeps stacked sounds from clipping. Touch screens sit about 2.5 dB lower (×0.75): phone speakers are small, bright and close to the ear. Never more than eight voices at once. `setVolume(0–10)` moves the bus in 2 dB steps around 7, the level every sound was tuned at, and is remembered per device. `readLevels()` returns the left and right peaks leaving the bus over the last ~20ms, for meters, without allocating.

### The contract

- `play(name, options?)` never throws and never blocks. It does nothing on the server, before the viewer's first press or key, while the tab is hidden or while muted. Mute is remembered per device (`sound-muted`) and follows across tabs.
- `Button`, `ButtonLink` and `IconButton` sound by themselves through `data-sound="key" | "soft"` and delegated listeners, so they stay server components. `data-sound="off"` opts out for a control that plays its own sounds.
- `delay` schedules a sound 0 to 0.5s ahead on the audio clock, for sequencers, so timing never jitters with the frame rate. The rate limit counts when a sound will be heard, not when it was asked for. Scheduled sounds only go to a running clock, and they leave two of the eight voices free, so a key press always clicks over a pattern. The Step Sequencer queues 100ms ahead every 25ms, drops notes more than 30ms late, and its lights read the same queue, so they land with the sound.
- `slate` is a pure 1 kHz sine, 12ms attack, held 0.9s, 70ms decay, a few dB under the clicks' peaks because a held tone sounds much louder. The VU Meter reads it as 0 VU.

### The host-transport rule

On the player the running study carries the tape's transport as `data-transport`, and `hostTransport(el)` reads the nearest one.

| Transport | What the study plays by itself |
| --- | --- |
| `play` | Aloud |
| `pause` | It runs, but stays quiet until the viewer works the study |
| `stop` | It stays put: STOP remounts it at its first frame, and it doesn't start by itself |
| no host | Component pages and capture frames read `play` |

Sounds from the viewer's own input always play. The usual shape:

```tsx
const touched = useRef(false); // a hand has worked it: it may sound while the host is paused

const sound = (name: SoundName) => {
  if (touched.current || hostTransport(rootRef.current) === "play") play(name);
};

<div ref={rootRef} onPointerDownCapture={() => (touched.current = true)} onKeyDownCapture={() => (touched.current = true)}>
```

A study that runs a long show (automation, a sequencer) can watch the host's attribute with a `MutationObserver` and start when the tape does.

## Anatomy

A study's page can take it apart. The Anatomy key, beside Replay, latches down; the study restarts, and comes apart while it runs, in floors, one for each kind of part it is built from: the plate at the bottom, then its wells and collars, its LCDs, keys and caps, its lights and chips, and the lettering on top. Pointing at a floor picks it. It rises a little above the rest, takes the hand's orange, stands on dashed risers down to what each piece sits on, and one line under the stage names it, the tokens that draw it and why it looks the way it does. Untouched, it walks down the stack once, 1.6 s a floor.

It is the materials, shown working: plate, then well, then part. A knob's cap lifts out of its collar with the knurling still turning, a one-time code's cells rise off the bezel while the ghost is still typing, and Gradient Keys' long exposures keep streaming under glass that floats above them.

### Two finishes

It opens as a **technical drawing** of the live study, and a Finish switch beside Spread shows it in its **materials**. Closing, it comes back together in its materials, whichever finish it was in.

The drawing is a drafter's view of the same object, and the same markup, so it still turns, types and clicks:

- Every part is an opaque plane of the canvas, so upper floors hide lower ones, with a 1px hairline in `--device-draw-line` round it and its lettering in `--device-draw-ink`. No gradients, glows, shadows, grain or engraving.
- Glass stays clear, its edge dashed, as a drafter marks a transparent surface. Canvases and screens keep their motion, quietened.
- The picked floor is washed in the hand's orange, on its orange risers. Orange means nothing else in the drawing: where a study's own state is orange (a switch that is on, a fader in Touch), it is drawn in ink.
- A lit light is filled with ink and an unlit one is a hairline ring; red stays only for a light that fires, records or errs.
- Whatever a part paints inside itself is cleared, and each study draws back what carries its mechanism with the `drawn:` variant, as it would with `dark:`: a knob's pointer and knurling, a fader's scale, lit segments, a needle, a drum's figures. The drawing's own rules are `!important`, so a study's win with Tailwind's `!`: `drawn:bg-(--device-draw-ink)!`. Whatever moves in the materials moves in the drawing.

### How it works

- **The page's structure is the anatomy.** A study marks each part with `data-part="<kind>"`, and nothing is drawn twice. The kinds are the materials (`plate`, `well`, `collar`, `key`, `cap`, `lcd`, `window`, `bezel`, `slot`, `chip`, `light`, `lettering`) and a few particular ones (`face`, `glass`, `drum`, `reel`, `tape`, `matrix`, `screen`); each has its name, its tokens and its one line in `src/components/anatomy/parts.ts`. A study's entry in `src/registry/anatomy.ts` says what is particular to its own parts, and is what gives its page the key. The attribute does nothing anywhere else, so a study stays one file anyone can copy.
- **Real 3D.** The camera tilts the scene isometric (54.74° back and 45° round, the angles Agent Shapes uses) and each part lifts by `translateZ`, by the floors between it and the part it sits on. The transforms nest, so heights add up, and the browser sorts the parts by their true depth: a cap lifted above an LCD paints over it wherever the two cross, which no stacking order in 2D can do.
- **Nothing on the path may flatten.** Overflow, isolation, filters, opacity, clips and blends turn everything under them into one plane, silently. While a study is apart, `globals.css` opens overflow and isolation along the path from the scene down to each part (one `:has()` rule) and nowhere else, and takes the animations and blends off it: the plate's entrance holds `blur(0)` after it ends, and the grain's `soft-light` isolates the plate. Both flattened the first attempt. A part with nothing marked inside it still clips, as one plane.
- **The anatomy owns `transform`.** A part that moves rides on `translate`, `rotate` or `scale`, which compose with the anatomy's lift: the Switch's and the Fader's caps do.
- **Springs.** The camera's tilt and the spread run on `springs.gentle`, the picked floor's lift on `springs.snappy`, all written to CSS variables. The spread clicks every 5%, as a detent does.
- **A parallel projection needs cues.** A plane lifted straight up, with no shadow, looks much like one lying further back. So the floors stand far enough apart to read, and the picked one has its risers and its orange.
- **The hand works the anatomy, not the study.** While apart the study is inert: its drags read on-screen boxes that a tilted camera would get wrong. Pointing picks a floor, a sideways drag spreads them, and the keys are a listbox (↑ ↓ pick, ← → spread in 5% steps, Escape closes and hands focus back to the key). Reduced motion jumps, and never walks.

### Marking a study's parts

- Mark the element that draws the material: the key's button (its face sinks inside it), the collar, the cap seated in it, the LCD, the chip on the LCD, the light, the lettering.
- A part is never `display: inline` (transforms skip it) and never moves by its own `transform`.
- Keep filters, opacity, clips and blends off the path from the plate to a part. A part with nothing marked inside it may use them: it is one plane already.
- An SVG part is picked by what it draws and lit along its strokes, so a ring of lights can be one part.
- Draw it back in the drawing with `drawn:` classes in the study's own file: the mechanism as line work, lit lights in ink, unlit ones as hairlines. Look at it in both finishes, both themes.
- `npm run check:anatomy` takes every listed study apart at 375 and 1280 px, spread all the way, drawn and in its materials, and fails on anything that would flatten it, a part with its own transform or an unknown kind, or a part that spills off the stage.

## Writing

Plain, precise, British-spelled and quiet. Write it the way you would say it to someone at the next desk.

- **Sentence case everywhere.** "Selected work", not "SELECTED WORK" or "Selected Work".
- **Capitals belong to the hardware.** Lettering on the body is set in capitals by CSS (`uppercase`, tracked); the source, the accessible name and the screen reader keep sentence case: `Hold to erase`. On the screen, capitals are kept to a firmware's menu (Home) and to small eyebrows and counts (`02 / 22 · ai`, `22 studies`); the status line and everything you read along stay in the page's sentence case.
- **Labels say what happens.** "Copy command", then "Copied". Not "Submit" or "OK".
- **British spelling, with -ize.** Colour, centre, dialled, travelling, favouring; but synthesized, motorized, organizing (Oxford spelling). A meter is the instrument; CSS keeps its own `color` and `center`.
- **Say it once.** If the screen already says it, the LCD doesn't. Repeats are taken out, not restyled.
- **Units and real symbols.** `−3.5 dB`, `−∞ dB`, `48 kHz · 24 bit`, `282 × 332`, `00M 14S 06F`: a true minus, a times sign, a middle dot, and a unit on every number.
- **Parentheses for status.** "Carson (In progress)", with a blue dot.
- **The recorder's world, in demos.** `take_04.wav`, Export, Slate, Scene A, Mix · take_04. The component stays general; its demo speaks the instrument's language.
- **Descriptions are plain prose about what it does and how.** "Values set from outside travel on a motor; a hand takes over and the motor lets go." Taglines are one line: "A strip that plays back its mix automation."
- **Commit messages** have an imperative subject ("Add Fader: a motorized strip that plays back its mix automation") and a body in prose that explains the design and the engineering, with real numbers.

## The study bar

What every study meets before it goes on the player. The player gives it a few seconds, untouched, and a phone gives it a small screen.

1. **It moves in its first four seconds, untouched.** A rehearsal, a recall, a ghost typing, automation playing back, a self-test, drums rolling from 0. The starting state is never still for more than about half a second. Then it rewards the hand.
2. **It fits a 282 × 332 box.** That is the smallest stage it gets (the player's floor zoom on a phone, less the stage's padding); the capture frame is 702 × 374. Size to the container, never the viewport: a root `@container w-full max-w-[…px]`, a `cqw`-clamped font size on its child (`text-[clamp(11px,4cqw,14px)]`), everything else in em, `@[26rem]:` for wider containers. Touch targets 24px or more. `npm run check:fit` loads every component page, the player's screen and the capture frame at six widths and fails if anything spills.
3. **It is built from the materials, and marks them.** A plate of the body's finish with wells, keys, caps, an LCD and lights. Never a second player, never a flat `shadow-md` card. Both themes look intentional. Each part carries `data-part` with its kind, so its page can take it apart (see Anatomy).
4. **It sounds through `play()`.** Existing sounds only, varied with pitch and gain. Its own sounds follow the transport rule; the viewer's input always sounds. Keys can carry `data-sound="key"` for press and release.
5. **It turns without transforms.** A rotating part spills its stage when its corners turn, so rotation is `conic-gradient(from var(--a))` or SVG attributes, or a transform inside an `overflow-hidden` wrapper.
6. **It rounds its trigonometry.** Coordinates rendered on the server are rounded to two decimals (`Math.round(v * 100) / 100` or `toFixed(2)`), so the browser's `Math` agrees when it hydrates.
7. **It passes the React Compiler rules** (eslint-plugin-react-hooks 7, as errors). No reading or writing `ref.current` during render: sync refs in effects or handlers. No synchronous `setState` in an effect body: set state in callbacks (timers, rAF, observers, `useEffectEvent`). No impure calls (`Math.random`, `performance.now`) in component-scope helpers: move them to module level. Deriving state by setting it during render is allowed.
8. **It is accessible.** Native roles and ARIA patterns; one tab stop per composite (roving `tabIndex`, or a slider that takes the arrows); focus that follows the hand, `el.focus({ preventScroll: true, focusVisible: false })` on pointerdown, with `data-quiet` hiding the ring in browsers that ignore the option until a key is pressed (`@/design-system` is gaining a shared `focusQuietly` for this); state changes in a polite live region, errors in an alert; reduced motion (`matchMedia("(prefers-reduced-motion: reduce)")`) stops anything that loops by itself.
9. **It draws without React.** Per-frame work writes CSS variables or attributes directly; springs come from `createSpring`; loops stop when idle or off-screen. React hears about commits, not frames.
10. **It is one file.** `src/registry/components/<slug>.tsx` exports a real, reusable, controlled component and a default `Demo`. Imports: `react`, `@/lib/sound` and `@/design-system` only. The Demo returns a single root element (live regions inside it) and never takes focus on mount.

## How to make a new study

1. Pick a product pattern teams ship. Name the mechanism it could be on an instrument, and the moment that shows it off in four seconds.
2. Create `src/registry/components/<slug>.tsx`. Start from the plate recipe under Materials; build the parts from wells, keys, caps, an LCD and lights. Read `knob.tsx` and `step-sequencer.tsx` first and match their idiom and comment density.
3. Give the component a real, controlled API (`value`, `onChange`, a form `name` where it fits). Values from outside travel on a motor; the hand's land at once.
4. Model the mechanism with `createSpring` or a small integrator. Write CSS variables, not state.
5. Make it run by itself from the first frame: a rehearsal, a ghost, a recall. Stop it for good at the first touch, and under reduced motion.
6. Give it sound: `play()` for the viewer's input; the transport rule for everything it does by itself.
7. Make it accessible: native roles, one tab stop, focus that follows the hand, a live region, reduced motion.
8. Size it to its container in em and check it at 282 × 332, on a 360px phone and in the 702 × 374 capture frame, in light and dark.
9. Register it: an entry at the top of `src/registry/index.ts` (title, a plain description of 70 words or so, a one-line tagline, tags, the date, `status: "new"`, `background: "plain"`) and one line in `src/registry/previews.tsx`. Mark its parts with `data-part` and give it an entry in `src/registry/anatomy.ts`, with a line for any part that is particular to it.
10. Run `npx tsc --noEmit`, `npx eslint src`, `npm run check:fit` and `npm run check:anatomy`. Find it on the player (`/`, type, Enter), with the tape playing, paused and stopped, and look at it before you commit. Write the commit message in the house voice.
