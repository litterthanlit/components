/**
 * The registry: one entry per component. Order here is display order
 * (newest first reads best on a portfolio). To add a component:
 *   1. Drop `my-thing.tsx` in ./components with a default-exported Demo.
 *   2. Add an entry below (status: "new" adds the blue dot).
 *   3. Add one line to ./previews.tsx.
 */
export type StageBackground = "grid" | "dots" | "glow" | "plain";

export type RegistryEntry = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  /** ISO date — shown on the OG image. */
  date: string;
  /** Shown as a blue dot + label, like "In progress" on litt.design. */
  status?: "new" | "in-progress";
  background?: StageBackground;
  /** A short line for tweets / OG cards. */
  tagline?: string;
};

export const registry: RegistryEntry[] = [
  {
    slug: "gradient-keys",
    title: "Gradient Keys",
    description:
      "A launcher's preview window over three keys, each screen a long exposure in a traditional Japanese palette: wakatake's young-bamboo greens, ai indigo fading to asagi, sakura fading to gofun white. The streaks are noise that sweeps across the screen as it flows along it. The selection steps from key to key every 2 s, the window sweeping into each palette along its streaks; a hand on the plate holds it. The keys are radios, and a press on the window sends a ring through its streaks.",
    tagline: "Long exposures in Japanese palettes: a window and three keys.",
    tags: ["surface", "pointer", "sound", "webgl"],
    date: "2026-10-08",
    status: "new",
    background: "plain",
  },
  {
    slug: "agent-indicators",
    title: "Agent Indicators",
    description:
      "Six ways to say an agent is working, each a mechanism from the player's hardware. Seven segments chase round while it thinks, fading with an LCD's persistence; a tuner seeks between stations on a spring while it searches; meters take tokens in with VU-style ballistics while it reads; a dot matrix works through an interference pattern while it reasons; step lights latch as it runs; reels record to tape while it writes. One frame loop draws them all.",
    tagline: "Thinking, searching, reading, reasoning, running and writing, in hardware.",
    tags: ["ai", "feedback", "motion", "svg"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "agent-status",
    title: "Agent Status",
    description:
      "An agent's run on a recorder's readout. The chip names the state: Thinking, Tool, Writing, Waiting, Done, Error or Stopped. A clock counts only the time the run is live, in minutes, seconds and frames; it holds while a call waits on your OK and freezes on the frame STOP goes down. Three lights latch as the run passes each phase, and the one firing flickers with every chunk of tokens through a 90 ms detector, so a stall goes quiet.",
    tagline: "An agent's run, on the recorder's readout.",
    tags: ["ai", "feedback", "sound", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "command-menu",
    title: "Command Menu",
    description:
      "A ⌘K palette as one of the player's own screens. Fuzzy matching scores the best way each word fits a label, favouring starts, word starts and runs, and ranks 2,400 takes in under a millisecond. Only the rows in view are rendered; the accent bar glides on a spring from its row's index, a second copy of the rows clipped so text turns white exactly under it. A combobox with a listbox, groups and a quiet result count.",
    tagline: "The command palette, on the player's screen.",
    tags: ["search", "input", "a11y", "sound"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "fader",
    title: "Fader",
    description:
      "A long-throw motorized fader after a console's: a ridged cap riding in a dark slot, an engraved scale and its level on a small LCD. Values set from outside travel on a motor; a hand takes over and the motor lets go. Near unity the cap drops into a detent with a click and holds until you pull clear. Double-click sends it home on the motor. The demo plays back mix automation; grab a fader to take it over in Touch mode.",
    tagline: "A strip that plays back its mix automation.",
    tags: ["sound", "input", "pointer", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "switch",
    title: "Switch",
    description:
      "A settings toggle as an over-centre slide switch, the player's HOLD switch grown up. Under a finger the cap lags further behind toward the centre, then snaps through with a click and lands on the far stop while you're still holding it. Let go short and it falls back, unless you flicked it: release decides by velocity, not just position. Past the ends it gives and bumps. The demo's input plate runs a self-test on power-up.",
    tagline: "A toggle with a real over-centre spring.",
    tags: ["sound", "input", "pointer", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "one-time-code",
    title: "One-Time Code",
    description:
      "A verification-code field on seven-segment LCD cells, the faint 8 of the unlit segments behind every figure, with a keypad of the player's keys. It's one real input laid over the cells, so paste (482-913 lands as 482913), SMS autofill, password managers, screen readers and native selection all work; the cells follow its selection. Web OTP fills it where the browser can. A wrong code shakes red; a right one lights the cells.",
    tagline: "The 2FA field, done right, on seven segments.",
    tags: ["input", "sound", "a11y", "svg"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "ticker",
    title: "Ticker",
    description:
      "Notifications on a dot-matrix LCD strip. Text is set in the page's own typeface, rasterized offscreen at the matrix's height and thresholded into dots, so any characters work. A message that fits types on, column by column; a longer one scrolls at a constant speed, holding at each end and pausing under the hand. A queue with a counter and a tone light; screen readers hear each message once. The canvas redraws only when a column changes.",
    tagline: "Toasts, reimagined as a dot-matrix strip.",
    tags: ["feedback", "canvas", "sound", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "step-sequencer",
    title: "Step Sequencer",
    description:
      "A sixteen-step sequencer whose drum kit is the player's own interface: the key's thock, the wheel's detent, the bump at the end of a list and the centre button's chime. Notes are scheduled a moment ahead on the audio clock, so the groove holds steady at any frame rate, and the lights follow the same clock. On the player it plays aloud while the tape rolls. Narrow stages page through eight steps at a time; the pattern is one tab stop.",
    tagline: "The player's own clicks, sequenced.",
    tags: ["sound", "input", "motion", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "knob",
    title: "Knob",
    description:
      "A detented rotary control after a mixing desk's: a knurled cap in a collar, a ring of fifteen lights and its value on a small LCD. Values set from outside travel on a motor (a spring) and click through every detent they pass, so recalling a scene sounds like a desk resetting itself; values set by hand follow the hand. Log taper for frequencies, a centre-out ring for cut and boost. Drag, scroll or use the arrow keys.",
    tagline: "A channel strip that recalls scenes on its motors.",
    tags: ["sound", "input", "pointer", "a11y"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "tape-reels",
    title: "Tape Reels",
    description:
      "Progress as a tape transport: two reels behind smoked glass, the tape running between them over two guides and a head. The reels keep real proportions: a pack's radius grows with the square root of the tape on it, so the emptying reel speeds up as it runs down, and its angle comes out in closed form. Progress eases in on a critically damped spring, so a jump whirls both reels like fast-forward. Turn a reel by hand to scrub; it clicks every 30°.",
    tagline: "A progress bar with two reels and real tape physics.",
    tags: ["feedback", "sound", "pointer", "motion"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "vu-meter",
    title: "VU Meter",
    description:
      "A pair of VU meters reading the page's own sound: backlit faces behind glass, needles with the VU standard's ballistics (99% of a steady tone in about 300 ms, about 1.5% overshoot) and a peak light each. Levels come from the shared sound bus every frame, so the needles kick with every key and click on the page. The scale is linear in voltage, with 0 VU seven tenths of the way across. SLATE sends a 1 kHz line-up tone that settles on 0.",
    tagline: "Needles that read the page's own sound.",
    tags: ["sound", "data", "motion", "svg"],
    date: "2026-10-04",
    status: "new",
    background: "plain",
  },
  {
    slug: "agent-shapes",
    title: "Agent Shapes",
    description:
      "Abstract shapes for the ways an agent works: a spark while it thinks, a graph while it searches, a cube arranging itself while it organizes, orbits while it weighs options, a form finding its shape while it plans, a cube building itself block by block, tiles folding in turn while tools run and one continuous thread while it writes. AgentShape takes the current phase and crossfades between them. SVG, CSS 3D and keyframes, still under reduced motion, labelled for screen readers.",
    tagline: "Abstract shapes for how an agent thinks.",
    tags: ["ai", "feedback", "motion", "svg"],
    date: "2026-10-02",
    status: "new",
    background: "dots",
  },
  {
    slug: "agent-run",
    title: "Agent Run",
    description:
      "One agent turn, start to finish. It thinks with a live timer, runs tool steps whose spinners turn into checkmarks that draw themselves, folds the work into “Thought for 4s”, then streams the answer behind a caret. Screen readers hear each phase, not every token.",
    tagline: "Think, run tools, fold it away, stream the answer.",
    tags: ["ai", "feedback", "motion", "a11y"],
    date: "2026-10-02",
    status: "new",
    background: "dots",
  },
  {
    slug: "agent-loaders",
    title: "Agent Loaders",
    description:
      "Four ways to say an agent is working: a light sweeping across text, a 3×3 pixel wave, a terminal braille spinner and hopping dots. CSS keyframes from the design system, still under reduced motion, labelled for screen readers.",
    tagline: "Shimmer, pixel wave, braille, dots.",
    tags: ["ai", "feedback", "motion"],
    date: "2026-10-02",
    status: "new",
    background: "grid",
  },
  {
    slug: "dither-card",
    title: "Dither Card",
    description:
      "Project links as keys with a screen in each face, after a launcher's LCD keys. Each screen runs a creature in three-tone ordered dither: a butterfly that flaps, a jellyfish that pulses, a flower that turns. A hand lights the screen under it and quickens it; a press sinks the key 2px with a click and sends a ring through the dots; keyboard focus lights it from the centre. Raw WebGL at half resolution, scaled up pixel for pixel.",
    tagline: "Project keys with a dithered creature on every screen.",
    tags: ["surface", "pointer", "sound", "webgl"],
    date: "2026-10-02",
    status: "new",
    background: "plain",
  },
  {
    slug: "spotlight-card",
    title: "Spotlight Card",
    description:
      "A surface whose border and fill catch a soft light that follows the pointer. Coordinates are written to CSS variables, so tracking never re-renders React.",
    tagline: "Light that follows your cursor, zero re-renders.",
    tags: ["surface", "pointer", "css"],
    date: "2026-09-28",
    status: "new",
    background: "dots",
  },
  {
    slug: "toast-stack",
    title: "Toast Stack",
    description:
      "Notifications that tuck behind each other and fan out on hover or focus. Timers pause while expanded, so nothing vanishes mid-read.",
    tagline: "Stacked toasts that fan out on hover.",
    tags: ["feedback", "motion", "a11y"],
    date: "2026-09-24",
    status: "new",
    background: "grid",
  },
  {
    slug: "hold-to-confirm",
    title: "Hold to Confirm",
    description:
      "A destructive action that asks for intent, after a recorder's erase key: a round key in a collar with a ring of twelve lights. Hold with pointer, Space or Enter and the ring fills light by light, each one a click a little higher, until the action runs; let go early and it runs back. It shows the gesture once on mount, and the ring is drawn from a frame loop, so holding never re-renders.",
    tagline: "Hold the key until the ring is full.",
    tags: ["button", "feedback", "sound", "a11y"],
    date: "2026-09-20",
    background: "plain",
  },
  {
    slug: "number-ticker",
    title: "Number Ticker",
    description:
      "A number on a tape counter's drums: white figures on black drums in a window pressed into the body, separators printed on the frame. Each drum turns on its own spring and clicks for every figure that passes; counting up they roll forward through 9 to 0, as a mechanical counter carries. They roll from 0 on the first frame. Formatting comes from Intl.NumberFormat, so any locale or currency just works.",
    tagline: "Tape-counter drums, any locale.",
    tags: ["data", "motion", "sound", "typography"],
    date: "2026-09-15",
    background: "plain",
  },
  {
    slug: "segmented-control",
    title: "Segmented Control",
    description:
      "A radio group with one indicator that glides between options. Full keyboard support: arrows, Home and End, single tab stop.",
    tagline: "One gliding indicator, full keyboard support.",
    tags: ["input", "motion", "a11y"],
    date: "2026-09-10",
    background: "grid",
  },
  {
    slug: "magnetic-button",
    title: "Magnetic Button",
    description:
      "A button that leans toward the cursor while its label travels a little further, giving a sense of depth. Springs back with pure CSS.",
    tagline: "A button with a little gravity.",
    tags: ["button", "pointer", "motion"],
    date: "2026-09-05",
    background: "glow",
  },
  {
    slug: "copy-button",
    title: "Copy Button",
    description:
      "Icons cross-fade with scale and blur, and the checkmark draws itself in. A live region announces the result for screen readers.",
    tagline: "The smallest delight: a check that draws itself.",
    tags: ["button", "feedback", "svg"],
    date: "2026-09-01",
    background: "dots",
  },
];

export function getEntry(slug: string) {
  return registry.find((entry) => entry.slug === slug);
}

export function getNeighbors(slug: string) {
  const index = registry.findIndex((entry) => entry.slug === slug);
  return {
    prev: index > 0 ? registry[index - 1] : undefined,
    next: index >= 0 && index < registry.length - 1 ? registry[index + 1] : undefined,
  };
}

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
