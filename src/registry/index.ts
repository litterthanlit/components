/**
 * The registry: one entry per component. Order here is display order
 * (newest first reads best on a portfolio). To add a component:
 *   1. Drop `my-thing.tsx` in ./components with a default-exported Demo.
 *   2. Add an entry below (status: "new" adds the lime dot).
 *   3. Add one line to ./previews.tsx.
 */
export type StageBackground = "grid" | "dots" | "glow" | "plain";

export type RegistryEntry = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  /** ISO date — shown on cards and used for sorting. */
  date: string;
  /** Shown as a lime dot + label, like "In progress" on litt.design. */
  status?: "new" | "in-progress";
  background?: StageBackground;
  /** A short line for tweets / OG cards. */
  tagline?: string;
};

export const registry: RegistryEntry[] = [
  {
    slug: "wireframe-card",
    title: "Wireframe Card",
    description:
      "Project cards with a live wireframe cover: a camera flying through an endless 3D lattice of hairlines, with glowing nodes where the lines meet and dust in the air. Additive light on black, depth fog, feedback trails, bloom and a filmic tone curve, in the spirit of TouchDesigner. Hover to fly faster and steer, click to warp. Raw WebGL 2: the GPU projects the whole world each frame into half-float buffers; stops off-screen and holds a still frame under reduced motion.",
    tagline: "Fly through an endless lattice of light.",
    tags: ["surface", "pointer", "webgl", "motion"],
    date: "2026-10-02",
    status: "new",
    background: "plain",
  },
  {
    slug: "gradient-card",
    title: "Gradient Card",
    description:
      "Project cards with a live mesh gradient cover. Four colours drift on slow orbits through a noise-warped field, blended in linear light so the midpoints stay bright. Hover swirls the colours around the cursor; a click sends a pulse and crossfades to the next palette. Raw WebGL with film grain.",
    tagline: "Mesh gradients that swirl around your cursor.",
    tags: ["surface", "pointer", "webgl"],
    date: "2026-10-02",
    status: "new",
    background: "plain",
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
      "Project cards with a live, ordered-dither cover. Hover lights the field under the cursor and speeds it up, a click sends a ripple through it, and keyboard focus lights it from the centre. Raw WebGL, drawn at a third of the resolution and scaled up pixel-perfect.",
    tagline: "Bayer dithering that follows your cursor.",
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

export const allTags = Array.from(new Set(registry.flatMap((entry) => entry.tags))).sort();

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
