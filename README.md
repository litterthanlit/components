# Components

A living gallery of interface components, built to be **shown off** — on X/Twitter and in a portfolio.

- **Gallery** (`/`) — editorial index with live, lazily-mounted demos and tag filters.
- **Component pages** (`/c/[slug]`) — large interactive stage, background switcher, replay, highlighted source with copy.
- **Capture frames** (`/capture/[slug]`) — chrome-free 1200×675 (16:9) frames for screenshots and screen recordings.
- **Auto OG images** — every page unfurls with a branded card when you paste the link in a tweet.
- **One-command export** — `npm run capture` writes 2× PNGs for every component, in dark and light.

Stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, Shiki. Every component is a single file with no dependencies beyond React and Tailwind.

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

Then edit `src/site.config.ts` with your name, handle and links. It feeds the header, footer, metadata, OG images and the capture watermark.

## Adding a component

1. Create `src/registry/components/my-thing.tsx`. Export the component and a `default` `Demo` that shows it off (keep demos ≤ ~560px wide; they're scaled up in capture frames).
2. Add an entry to `src/registry/index.ts` (title, description, tagline, tags, date, optional `featured` and `background`).
3. Add one line to `src/registry/previews.tsx`.

The component page, OG image and capture route are generated from that entry.

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
