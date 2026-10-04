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
      "Project cards with a live, ordered-dither cover: a butterfly that flaps, a jellyfish that pulses and a flower that turns. Hover lights the cover under the cursor and speeds it up, a click sends a ripple through it, and keyboard focus lights it from the centre. Three-tone Bayer dither, raw WebGL, drawn at half resolution and scaled up pixel-perfect.",
    tagline: "Dithered creatures that follow your cursor.",
    tags: ["surface", "pointer", "webgl"],
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
      "A destructive action that asks for intent. Hold with pointer, Space or Enter until the fill completes; letting go early rewinds it.",
    tagline: "Make destructive actions ask for intent.",
    tags: ["button", "feedback", "a11y"],
    date: "2026-09-20",
    background: "plain",
  },
  {
    slug: "number-ticker",
    title: "Number Ticker",
    description:
      "Digits roll into place like a mechanical counter. Formatting comes from Intl.NumberFormat, so any locale or currency just works.",
    tagline: "Mechanical counter reels, any locale.",
    tags: ["data", "motion", "typography"],
    date: "2026-09-15",
    background: "glow",
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
