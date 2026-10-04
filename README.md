# Components

A gallery of interface components by [Nick Georgiev](https://litt.design). It's built to be shown off on X/Twitter and in a portfolio, and it shares litt.design's visual language.

- **Design system** (`/system`): principles, colour, type, shape, motion, primitives and writing rules, rendered from the real tokens.
- **Gallery** (`/`) — the home page is a player after a field recorder: a near-white body in a black bumper whose full-width screen runs one component at a time. Under the screen, the tape lays every component end to end as a take with its own waveform, and a red playhead marks the one on screen; drag along it to scrub. The deck has an LCD (transport, position, tags, a running clock), live level meters that read the real sound output, a key row (Find, Home, Back, Source, Options), a dial and STOP / PLAY keys. The dial's arrows or ← → step, turning it scrubs, PLAY (or Space) rolls the tape so each component plays for a few seconds, ↑ ↓ set the volume, OK (Enter) shows what's on screen, STOP rewinds it to its first frame. Every press clicks, and the hold switch (or M) mutes.
- **Component pages** (`/c/[slug]`) — large interactive stage, background switcher, replay, highlighted source with copy.
- **Capture frames** (`/capture/[slug]`) — chrome-free 1200×675 (16:9) frames for screenshots and screen recordings.
- **Auto OG images** — every page unfurls with a branded card when you paste the link in a tweet.
- **One-command export** — `npm run capture` writes 2× PNGs for every component, in dark and light.

Stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, Shiki and Geist. Every component is a single file that needs only React and Tailwind.

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000/studies
```

Personal details live in `src/site.config.ts`. They feed the header, footer, metadata, OG images and the capture watermark.

## Design system

```
src/design-system/
  tokens.css      colour, type scale, radius, elevation, motion (source of truth)
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
- **Sound:** short clicks synthesized with Web Audio (no audio files) in `src/lib/sound.ts`. Call `play("tick" | "press" | "select" | "start" | "stop" | …)`; it stays silent until the viewer's first press or key, and never throws. `setVolume(0–10)` moves the bus in 2 dB steps around the level every sound was tuned at (7) and is remembered per device (`sound-volume`); `readLevels()` returns the left and right peaks leaving the bus, for meters. `Button`, `ButtonLink` and `IconButton` sound by themselves through a `data-sound` attribute (`data-sound="off"` opts out). Viewers can mute on `/system#sound`; the choice is saved per device in `localStorage` (`sound-muted`) and syncs across tabs. Audition every sound there too.

If you change a value in `tokens.css`, mirror it in `tokens.ts`.

## Adding a component

1. Create `src/registry/components/my-thing.tsx`. Export the component and a `default` `Demo` that shows it off. Style it with token classes only (`bg-surface`, `text-muted`, `shadow-md`, `ease-out`…) so it follows the theme. Keep demos at or under about 560px wide; capture frames scale them up.
2. Add an entry to `src/registry/index.ts`: title, description, tagline, tags and date, plus optional `status: "new"` (adds the blue dot) and `background`.
3. Add one line to `src/registry/previews.tsx`.

The component page, OG image and capture route are generated from that entry.

### Overflow check

A demo's stage changes size with where it's shown: the device's screen zooms demos down on small phones and up a little on large displays, and a component page on a phone grows with its demo. Anything taller is clipped silently. So size demos to their container (`@container`, `@md:`), not the viewport (`sm:`), and run the check before pushing:

```bash
npm run build && npm start   # in one terminal
npm run check:fit            # every component; or: npm run check:fit -- my-thing
```

It loads each component page, every component running on the home page's device screen, and the capture frame at six widths and fails if any demo, including transformed or absolutely positioned children, spills out of its stage. GitHub runs it on every push to `main` and every pull request (`.github/workflows/check-fit.yml`).

## Posting to X

**Stills**

```bash
npm run build && npm start      # or npm run dev
npm run capture                 # all components → captures/<slug>-<theme>.png (2400×1350)
npm run capture -- toast-stack --theme=dark --bg=glow
```

Flags: `--theme=dark|light|both`, `--bg=grid|dots|glow|plain`, `--w=1200 --h=675`, `--wait=1600`, `--video`.
The script uses `playwright-core`; it tries Playwright's Chromium, then installed Chrome. Point it at any browser with `CHROMIUM_PATH=/path/to/chrome`.

**Video (what usually performs best)**

Open a capture frame — the “Capture frame” button on any component page, or e.g.
`/capture/spotlight-card?theme=dark&bg=dots&zoom=1.8` — and screen-record it (macOS: ⇧⌘5 → Record Selected Portion; Screen Studio and CleanShot work well).
`--video` also records a short `.webm` with a scripted cursor; X needs MP4, so convert with:

```bash
ffmpeg -i captures/spotlight-card-dark.webm -c:v libx264 -pix_fmt yuv420p -crf 18 captures/spotlight-card.mp4
```

Capture params: `theme`, `bg`, `w`, `h`, `zoom` (default 1.6), `label=0` to hide the title/handle watermark.

## Deploying

Deploy to Vercel (or any Node host) and set `NEXT_PUBLIC_SITE_URL` to your domain so OG image URLs are absolute.
