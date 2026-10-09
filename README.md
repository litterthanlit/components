# Components

A gallery of interface components by [Nick Georgiev](https://litt.design). It's built to be shown off on X/Twitter and in a portfolio, and it shares litt.design's visual language.

- **Design system** (`/system`): principles, colour, type, shape, the player's hardware materials, motion and physics, primitives, sound, the bar every study meets and writing rules, rendered from the real tokens. [`DESIGN.md`](DESIGN.md) is the same language in words, with the reasoning.
- **Gallery** (`/`) — the home page is a player after a field recorder: a cool silver body in a machined frame whose full-width screen runs one component at a time. Under the screen, a slim tape lays every component end to end as a take with its own waveform, and a red playhead marks the one on screen; drag along it to scrub. The deck keeps only what plays the tape: one strip of LCD with the Litt mark at its left end (it animates only while a mouse is over it) and the transport, the study's name and the take number beside it, and a dial in the body's opposite finish (black on silver, silver in dark) with PLAY at its centre (hold it for STOP). Menu and Source sit at the screen's top corners: Menu opens Home (Find, Options, the design system, litt.design), Source opens the component's page. Phones give the screen the room: the strip shows only the mark, its red light on while the tape runs, beside the dial. The dial's arrows (or ← →) step, turning it scrubs, PLAY (or Space) rolls the tape so each component plays for four seconds (3, 4 or 6 in Options), S or a held centre stops and rewinds to the first frame, ↑ ↓ set the volume, the title on the screen (or Enter) shows what's on screen, Escape goes back. On Home, Options and Find, the dial's centre becomes OK. The logo in the site header, too, animates only on hover. Every press clicks, and Options › Sound (or M) mutes.
- **Component pages** (`/c/[slug]`) — large interactive stage, background switcher, replay, highlighted source with copy, and an Anatomy key: the running study tilts isometric and comes apart in floors (plate, wells, keys and caps, lights, lettering), with the floor under the hand named beneath the stage, its tokens and why it looks the way it does. Real CSS 3D over the study's own markup; see Anatomy in [`DESIGN.md`](DESIGN.md#anatomy).
- **Capture frames** (`/capture/[slug]`) — chrome-free 1200×675 (16:9) frames for screenshots and screen recordings.
- **Auto OG images** — every page unfurls with a branded card when you paste the link in a tweet.
- **One-command export** — `npm run capture` writes 2× PNGs for every component, in dark and light.

Stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, Shiki and Geist. Every component is a single file that needs React and Tailwind; the ones that make sound or use springs also import `src/lib/sound.ts` and `src/design-system/motion/spring.ts`.

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000/studies
```

Personal details live in `src/site.config.ts`. They feed the header, footer, metadata, OG images and the capture watermark.

## Design system

[`DESIGN.md`](DESIGN.md) is the design language and its ethos: the ethos, the hardware materials and their tokens, colour, type and shape, motion and physics, sound, writing, the study bar and a checklist for a new study. `/system` renders it live, in both themes. In short: the player is an object, not a page; it uses an instrument's vocabulary; it runs by itself and rewards the hand; it makes sound; it is restrained (monochrome, red for REC and the playhead, orange for a hand on it, tabular figures); physics carry the feel; accessibility is native; and studies are product patterns done with the player's polish.

```
src/design-system/
  tokens.css      colour, type scale, radius, elevation, motion, the device's materials (source of truth)
  tokens.ts       the same values for TypeScript: OG images and the /system page
  primitives/     Button, IconButton, Badge, Dot, Kbd, Container, SectionLabel
  motion/         createSpring and spring presets
  index.ts        import { Button, Dot } from "@/design-system"
```

- **Colour:** `canvas`, `panel` and `surface` grounds; `ink`, `muted` and `subtle` text; `line` hairlines; a single blue `accent` (`#384ECB`). Every token has a light and a dark value.
- **Type:** Geist. `text-body` is 14px, `text-meta` 12px, with `lead`, `title` and `display` above them.
- **Motion:** `ease-out`, `ease-in-out`, `ease-drawer` and `ease-spring` curves, with `--duration-exit` (150ms), `--duration-enter` (210ms) and `--duration-move` (400ms).
- **Physics:** `createSpring(initial, springs.snappy | gentle | bouncy, onUpdate)` runs a damped spring that writes straight to the DOM and keeps its velocity when interrupted. Use it for anything pointer-driven or interruptible. Siblings entering together are staggered by `--stagger` (50ms), capped at 8. Agent states use the `animate-shimmer`, `animate-wave`, `animate-hop` and `animate-caret` keyframes; agent shapes add `animate-stretch`, `animate-trace` (with `pathLength={1}`), `animate-morph`, `animate-assemble`, `animate-twist` and `animate-build` (a shared `--build` progress that children read).
- **Elevation:** `shadow-sm`, `shadow-md` and `shadow-lg` are a 1px ring plus a soft shadow.
- **Sound:** short clicks synthesized with Web Audio (no audio files) in `src/lib/sound.ts`. Call `play("tick" | "press" | "select" | "start" | "stop" | …)`; it stays silent until the viewer's first press or key, and never throws. `setVolume(0–10)` moves the bus in 2 dB steps around the level every sound was tuned at (7) and is remembered per device (`sound-volume`); `readLevels()` returns the left and right peaks leaving the bus, for meters. `Button`, `ButtonLink` and `IconButton` sound by themselves through a `data-sound` attribute (`data-sound="off"` opts out). Viewers can mute on `/system#sound`; the choice is saved per device in `localStorage` (`sound-muted`) and syncs across tabs. Audition every sound there too. `slate` is a held 1 kHz line-up tone (tone layers take a `hold`), which the VU Meter reads as 0 VU. For sequencers, `play(name, { delay })` schedules up to 0.5 s ahead on the audio clock; the rate limit counts when a sound will be heard, and scheduled sounds always leave two of the eight voices for key clicks.
- **Studies that sound on the player:** the running study carries the tape's transport as `data-transport`, which `hostTransport(el)` reads. Play aloud while it's `play`; while it's `pause`, run but keep quiet until the viewer works the study; after `stop` (which remounts it), stay put. With no host (component pages, captures) it reads `play`.
- **Hardware materials:** the device's tokens work anywhere, and combine plate, then well, then part: `--device-body` and `--device-body-edge` for a plate (`.device-grain` adds the body's finish), `--device-rim` for a bumper or bezel, `--device-well` with `--device-recess` for anything pressed in, `--device-key-face` with `--device-key-shadow(-pressed)` for keys (2px of travel), `--device-wheel-face` for caps in their collars, `--device-lcd` with `--device-lcd-edge`, `--device-lcd-ink` and `--device-lcd-dim` for screens (a white chip carries the state), `--device-window` for smoked glass, `--device-meter-on/off` for lights, `--device-rec` and `--device-hold` for the two signal colours, and `--device-label(-quiet)` with `--device-engrave` for lettering. Size everything in em from the plate's font size. `/system#materials` renders each one.

If you change a value in `tokens.css`, mirror it in `tokens.ts` (the device's materials included).

## Adding a component

1. Create `src/registry/components/my-thing.tsx`. Export the component and a `default` `Demo` that shows it off. Style it with token classes only (`bg-surface`, `text-muted`, `shadow-md`, `ease-out`…) so it follows the theme. Keep demos at or under about 560px wide; capture frames scale them up.
2. Add an entry to `src/registry/index.ts`: title, description, tagline, tags and date, plus optional `status: "new"` (adds the blue dot) and `background`.
3. Add one line to `src/registry/previews.tsx`.
4. If it is built from the device's materials, mark each part with `data-part` (`plate`, `well`, `key`, `lcd`…; the kinds are in `src/components/anatomy/parts.ts`) and add an entry to `src/registry/anatomy.ts`, so its page can take it apart.

The component page, OG image and capture route are generated from that entry.

The player gives each study a few seconds, untouched, and a phone a small screen, so a study should (the full bar, and a checklist, are in [`DESIGN.md`](DESIGN.md#the-study-bar)):

- **Move in its first four seconds** without a cursor (a rehearsal, a recall, a roll from zero), then reward the hand.
- **Be built from the device's materials** (above), so it reads as a part of the same instrument, not a card on a screen; a plate of the body's finish, not a second player.
- **Sound through `play()`** and follow the `data-transport` rule, so mute (M, or Options › Sound) and the volume apply.
- **Turn without transforms** where it rotates (`conic-gradient(from var(--a))`, or SVG attributes), and round any trigonometry it renders on the server, so hydration matches.

### Overflow check

A demo's stage changes size with where it's shown: the device's screen zooms demos down on small phones and up a little on large displays, and a component page on a phone grows with its demo. Anything taller is clipped silently. The smallest box a demo gets is about 282 × 332 CSS px (the device's floor zoom, less the stage's padding); the capture frame is 702 × 374. So size demos to their container (`@container`, `@md:`; or a `cqw` font size on a child of the container, with everything else in `em`), not the viewport (`sm:`), and run the check before pushing:

```bash
npm run build && npm start   # in one terminal
npm run check:fit            # every component; or: npm run check:fit -- my-thing
```

It loads each component page, every component running on the home page's device screen, and the capture frame at six widths and fails if any demo, including transformed or absolutely positioned children, spills out of its stage. GitHub runs it on every push to `main` and every pull request (`.github/workflows/check-fit.yml`).

`npm run check:anatomy` does the same for the anatomy: it takes every study in `src/registry/anatomy.ts` apart, spread all the way, and fails if anything on the path to a part would flatten the 3D, a part moves by its own `transform`, or a part spills off the stage. CI runs it after the overflow check.

## Posting to X

**Stills**

```bash
npm run build && npm start      # or npm run dev
npm run capture                 # all components → captures/<slug>-<theme>.png (2400×1350)
npm run capture -- toast-stack --theme=dark --bg=glow
```

Flags: `--theme=dark|light|both`, `--bg=grid|dots|glow|plain`, `--w=1200 --h=675`, `--wait=1600`, `--video`, and `--anatomy[=60]` to take the study apart (with `--layer=cap` to rest on one floor; otherwise it walks down the stack, which `--video` records).
The script uses `playwright-core`; it tries Playwright's Chromium, then installed Chrome. Point it at any browser with `CHROMIUM_PATH=/path/to/chrome`.

**Video (what usually performs best)**

Open a capture frame — the “Capture frame” button on any component page, or e.g.
`/capture/spotlight-card?theme=dark&bg=dots&zoom=1.8` — and screen-record it (macOS: ⇧⌘5 → Record Selected Portion; Screen Studio and CleanShot work well).
`--video` also records a short `.webm` with a scripted cursor; X needs MP4, so convert with:

```bash
ffmpeg -i captures/spotlight-card-dark.webm -c:v libx264 -pix_fmt yuv420p -crf 18 captures/spotlight-card.mp4
```

Capture params: `theme`, `bg`, `w`, `h`, `zoom` (default 1.6), `label=0` to hide the title/handle watermark, `anatomy=60` to take the study apart that far (the watermark names the floor on show) and `layer=cap` to rest on one floor.

## Deploying

Deploy to Vercel (or any Node host) and set `NEXT_PUBLIC_SITE_URL` to your domain so OG image URLs are absolute.
