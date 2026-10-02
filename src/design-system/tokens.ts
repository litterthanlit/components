/**
 * TypeScript mirror of ./tokens.css, for places CSS variables can't reach
 * (OG image generation) and for the /system documentation page.
 * Keep in sync with tokens.css.
 */
export const colors = {
  light: {
    canvas: "#fafafa",
    panel: "#f5f5f5",
    surface: "#ffffff",
    ink: "#0a0a0a",
    muted: "#737373",
    subtle: "#a3a3a3",
    line: "rgb(0 0 0 / 0.08)",
    "line-strong": "rgb(0 0 0 / 0.14)",
    accent: "#c2ff4d",
    "accent-ink": "#0a0a0a",
    "accent-strong": "#4d7c0f",
    danger: "#d93036",
  },
  dark: {
    canvas: "#0a0a0a",
    panel: "#111111",
    surface: "#171717",
    ink: "#ededed",
    muted: "#8f8f8f",
    subtle: "#5c5c5c",
    line: "rgb(255 255 255 / 0.08)",
    "line-strong": "rgb(255 255 255 / 0.15)",
    accent: "#c2ff4d",
    "accent-ink": "#0a0a0a",
    "accent-strong": "#c2ff4d",
    danger: "#ff6166",
  },
} as const;

export type ColorToken = keyof typeof colors.light;

export const colorRoles: { token: ColorToken; role: string }[] = [
  { token: "canvas", role: "Page ground" },
  { token: "panel", role: "Recessed areas, stages, code" },
  { token: "surface", role: "Raised objects: cards, menus, toasts" },
  { token: "ink", role: "Primary text and solid buttons" },
  { token: "muted", role: "Secondary text, meta, icons" },
  { token: "subtle", role: "Decoration and disabled only" },
  { token: "line", role: "Hairline borders and dividers" },
  { token: "line-strong", role: "Hover borders, inputs" },
  { token: "accent", role: "Lime fill: status dots, highlights" },
  { token: "accent-ink", role: "Text on accent fills" },
  { token: "accent-strong", role: "Accent as text or stroke" },
  { token: "danger", role: "Destructive and negative values" },
];

export const typeScale = [
  { token: "display", size: 32, leading: 1.15, tracking: "-0.035em", weight: 500, use: "Page titles, rarely" },
  { token: "title", size: 20, leading: 1.35, tracking: "-0.018em", weight: 500, use: "Component and section titles" },
  { token: "lead", size: 17, leading: 1.55, tracking: "-0.011em", weight: 400, use: "Intro paragraphs" },
  { token: "body", size: 14, leading: 1.6, tracking: "-0.006em", weight: 400, use: "Default text" },
  { token: "meta", size: 12, leading: 1.4, tracking: "-0.005em", weight: 400, use: "Dates, labels, captions" },
] as const;

export const radii = [
  { token: "sm", px: 6, use: "Chips, kbd, small buttons" },
  { token: "md", px: 8, use: "Buttons, inputs" },
  { token: "lg", px: 12, use: "Cards, previews, toasts" },
  { token: "xl", px: 16, use: "Stages, large panels" },
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
  ],
} as const;
