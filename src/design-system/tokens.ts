/**
 * TypeScript mirror of ./tokens.css, for places CSS variables can't reach
 * (OG image generation) and for the /system documentation page.
 * Keep in sync with tokens.css.
 */
export const colors = {
  light: {
    canvas: "#f4f2ed",
    panel: "#ebe8e1",
    surface: "#fbfaf7",
    ink: "#141413",
    muted: "#67645d",
    subtle: "#a29e94",
    line: "rgb(20 20 19 / 0.1)",
    "line-strong": "rgb(20 20 19 / 0.2)",
    accent: "#c2ff4d",
    "accent-ink": "#141413",
    "accent-strong": "#4d7c0f",
    proof: "#e5402a",
    danger: "#d1361f",
  },
  dark: {
    canvas: "#0e0e0d",
    panel: "#151513",
    surface: "#1c1c1a",
    ink: "#edebe5",
    muted: "#9a968c",
    subtle: "#5f5c55",
    line: "rgb(237 235 229 / 0.09)",
    "line-strong": "rgb(237 235 229 / 0.17)",
    accent: "#c2ff4d",
    "accent-ink": "#141413",
    "accent-strong": "#c2ff4d",
    proof: "#ff5a3d",
    danger: "#ff6a4d",
  },
} as const;

export type ColorToken = keyof typeof colors.light;

export const colorRoles: { token: ColorToken; role: string }[] = [
  { token: "canvas", role: "Paper: the page ground" },
  { token: "panel", role: "Recessed paper: stages, code" },
  { token: "surface", role: "A sheet laid on top: cards, menus, toasts" },
  { token: "ink", role: "Text, rules, halftone, solid buttons" },
  { token: "muted", role: "Secondary text, meta, icons" },
  { token: "subtle", role: "Decoration and disabled only" },
  { token: "line", role: "Hairline rules and dividers" },
  { token: "line-strong", role: "Hover rules, inputs, crop marks" },
  { token: "accent", role: "Lime means live: shipped, success, new" },
  { token: "accent-ink", role: "Text on lime fills" },
  { token: "accent-strong", role: "Lime as text or stroke" },
  { token: "proof", role: "Proof red means look here: markup, focus, active crop marks" },
  { token: "danger", role: "Proof red, tuned for destructive fills" },
];

/** The four hues and what they mean. Everything else is a density of ink. */
export const legend = [
  { token: "canvas", name: "Paper", meaning: "The ground every proof is printed on." },
  { token: "ink", name: "Ink", meaning: "Words, rules and the halftone. Density, not hue, sets emphasis." },
  { token: "accent", name: "Lime", meaning: "Live. Shipped, new, success. Never decoration." },
  { token: "proof", name: "Proof red", meaning: "Look here. Markup, focus, destructive, the active crop mark." },
] as const;

/** Halftone density dial, coarse to fine. Turn this before adding a hue. */
export const density = [
  { step: "Whisper", opacity: 0.05, pitch: 8, use: "Behind long text" },
  { step: "Ground", opacity: 0.09, pitch: 6, use: "Stages and empty plates" },
  { step: "Field", opacity: 0.18, pitch: 5, use: "Hero bleed, section breaks" },
  { step: "Solid", opacity: 0.4, pitch: 4, use: "Loading plates, emphasis" },
] as const;

export const typeScale = [
  { token: "headline", size: 88, leading: 0.98, tracking: "-0.025em", weight: 400, font: "display", use: "One story line per page" },
  { token: "heading", size: 36, leading: 1.05, tracking: "-0.015em", weight: 400, font: "display", use: "Component and section titles" },
  { token: "title", size: 20, leading: 1.35, tracking: "-0.018em", weight: 500, font: "sans", use: "Card titles in product UI" },
  { token: "lead", size: 17, leading: 1.55, tracking: "-0.011em", weight: 400, font: "sans", use: "Intro paragraphs" },
  { token: "body", size: 14, leading: 1.6, tracking: "-0.006em", weight: 400, font: "sans", use: "Default text" },
  { token: "meta", size: 12, leading: 1.4, tracking: "-0.005em", weight: 400, font: "sans", use: "Captions and help text" },
  { token: "label", size: 11, leading: 1.4, tracking: "0.04em", weight: 400, font: "mono", use: "NO. 07 · BUILD 4F2A1C · 12MS" },
] as const;

export const radii = [
  { token: "sm", px: 4, use: "Chips, kbd, small buttons" },
  { token: "md", px: 6, use: "Buttons, inputs" },
  { token: "lg", px: 8, use: "Cards, toasts" },
  { token: "xl", px: 10, use: "Plates and large panels" },
] as const;

export const motion = {
  curves: [
    { token: "ease-out", value: "cubic-bezier(0.23, 1, 0.32, 1)", use: "Default for anything entering or responding to input" },
    { token: "ease-in-out", value: "cubic-bezier(0.77, 0, 0.175, 1)", use: "Things moving on screen from A to B" },
    { token: "ease-drawer", value: "cubic-bezier(0.32, 0.72, 0, 1)", use: "Sheets and drawers (iOS-like)" },
    { token: "ease-spring", value: "cubic-bezier(0.34, 1.36, 0.64, 1)", use: "Small overshoot for playful returns" },
  ],
  durations: [
    { token: "duration-exit", ms: 150, use: "Leaving, closing, hover-out" },
    { token: "duration-enter", ms: 210, use: "Appearing, opening, hover-in" },
    { token: "duration-move", ms: 400, use: "Layout and position changes" },
    { token: "stagger", ms: 50, use: "Delay between siblings entering together; cap at 8 items" },
  ],
  springs: [
    { token: "snappy", stiffness: 520, damping: 40, use: "Follows input: indicators, toggles" },
    { token: "gentle", stiffness: 170, damping: 22, use: "Settling into place" },
    { token: "bouncy", stiffness: 260, damping: 12, use: "Playful returns: magnetic, dropped items" },
  ],
} as const;
