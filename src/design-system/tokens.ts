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
    muted: "#707070",
    subtle: "#a3a3a3",
    line: "rgb(0 0 0 / 0.08)",
    "line-strong": "rgb(0 0 0 / 0.14)",
    accent: "#384ecb",
    "accent-ink": "#ffffff",
    "accent-strong": "#384ecb",
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
    accent: "#384ecb",
    "accent-ink": "#ffffff",
    "accent-strong": "#8a9af2",
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
  { token: "accent", role: "Blue fill: status dots, highlights" },
  { token: "accent-ink", role: "Text on accent fills" },
  { token: "accent-strong", role: "Accent as text or stroke" },
  { token: "danger", role: "Destructive and negative values" },
];

/**
 * The player's hardware: the --device-* and --screen-* tokens. Gradients and
 * shadow lists are kept whole, as tokens.css writes them.
 */
export const device = {
  light: {
    frame: "linear-gradient(180deg, #c6c9ce 0%, #b9bcc2 55%, #adb0b6 100%)",
    "frame-edge": "inset 0 1px 0 rgb(255 255 255 / 0.7), inset 0 0 0 1px rgb(0 0 0 / 0.08), 0 0 0 0.5px rgb(0 0 0 / 0.16)",
    rim: "#0d0d0e",
    "rim-edge": "inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 -1px 0 rgb(255 255 255 / 0.06), 0 0 0 0.5px rgb(0 0 0 / 0.6)",
    body: "linear-gradient(180deg, #d9dce0 0%, #cdd0d5 55%, #c0c3c9 100%)",
    "body-edge": "inset 0 1px 0 rgb(255 255 255 / 0.75), inset 0 0 0 1px rgb(0 0 0 / 0.06)",
    "body-shadow": "0 1px 2px rgb(0 0 0 / 0.1), 0 18px 36px -18px rgb(0 0 0 / 0.28), 0 60px 100px -50px rgb(0 0 0 / 0.38)",
    grain: "0.3",
    well: "#c2c5cb",
    recess: "inset 0 1px 2px rgb(0 0 0 / 0.12), inset 0 0 0 1px rgb(0 0 0 / 0.05), 0 1px 0 rgb(255 255 255 / 0.55)",
    label: "#2e3035",
    "label-quiet": "#676a70",
    engrave: "0 1px 0 rgb(255 255 255 / 0.55)",
    "engrave-glyph": "drop-shadow(0 1px 0 rgb(255 255 255 / 0.55))",
    "key-face": "linear-gradient(#fbfbfc, #eceef1)",
    "key-ink": "#2a2c31",
    "key-shadow": "inset 0 1px 0 #ffffff, inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.14), 0 2px 0 0 #a3a7ae, 0 5px 12px -4px rgb(0 0 0 / 0.2)",
    "key-shadow-pressed": "inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.12), 0 0 0 1px rgb(0 0 0 / 0.16), 0 0 0 0 #a3a7ae, 0 1px 2px -1px rgb(0 0 0 / 0.14)",
    "wheel-face": "radial-gradient(120% 120% at 50% 0%, #ffffff 0%, #f3f4f6 55%, #e6e8ec 100%)",
    "wheel-shadow": "inset 0 1.5px 0 #ffffff, inset 0 -3px 8px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.12), 0 2px 0 0 #a8acb3, 0 12px 28px -12px rgb(0 0 0 / 0.3)",
    "wheel-shadow-pressed": "inset 0 1.5px 0 rgb(255 255 255 / 0.7), inset 0 -3px 8px rgb(0 0 0 / 0.06), 0 0 0 1px rgb(0 0 0 / 0.14), 0 0.5px 0 0 #a8acb3, 0 4px 10px -6px rgb(0 0 0 / 0.26)",
    "dial-face": "radial-gradient(120% 120% at 50% 0%, #2c2e33 0%, #1b1c20 55%, #111215 100%)",
    "dial-shadow": "inset 0 1.5px 0 rgb(255 255 255 / 0.14), inset 0 -3px 8px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(0 0 0 / 0.6), 0 2px 0 0 #08090a, 0 12px 28px -12px rgb(0 0 0 / 0.5)",
    "dial-shadow-pressed": "inset 0 1.5px 0 rgb(255 255 255 / 0.08), inset 0 -3px 8px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(0 0 0 / 0.6), 0 0.5px 0 0 #08090a, 0 4px 10px -6px rgb(0 0 0 / 0.45)",
    "dial-recess": "inset 0 1px 3px rgb(0 0 0 / 0.75), inset 0 0 0 1px rgb(0 0 0 / 0.5), 0 1px 0 rgb(255 255 255 / 0.08)",
    "dial-key-face": "radial-gradient(120% 120% at 50% 0%, #26282c 0%, #1a1b1f 60%, #141518 100%)",
    "dial-key-shadow": "inset 0 1px 0 rgb(255 255 255 / 0.12), inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.8), 0 2px 0 0 #050506, 0 5px 12px -4px rgb(0 0 0 / 0.6)",
    "dial-key-shadow-pressed": "inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.7), 0 0 0 1px rgb(0 0 0 / 0.8), 0 0 0 0 #050506, 0 1px 1px -1px rgb(0 0 0 / 0.5)",
    "dial-ink": "#d4d6db",
    "dial-engrave": "0 -1px 0 rgb(0 0 0 / 0.85)",
    "dial-engrave-glyph": "drop-shadow(0 -1px 0 rgb(0 0 0 / 0.85))",
    "dial-trail": "rgb(255 255 255 / 0.1)",
    lcd: "linear-gradient(112deg, #2d2d2e 0%, #252526 47%, #1b1b1c 47.2%, #151516 100%)",
    "lcd-edge": "inset 0 0 0 1px rgb(255 255 255 / 0.06), inset 0 1px 0 rgb(255 255 255 / 0.09), 0 1px 2px rgb(0 0 0 / 0.22)",
    "lcd-ink": "#f5f5f5",
    "lcd-dim": "rgb(255 255 255 / 0.64)",
    window: "radial-gradient(120% 90% at 50% 0%, #2a2a2b 0%, #141415 70%)",
    "window-edge": "inset 0 2px 7px rgb(0 0 0 / 0.65), inset 0 0 0 1px rgb(0 0 0 / 0.55), inset 0 -1px 0 rgb(255 255 255 / 0.06)",
    "meter-off": "rgb(0 0 0 / 0.15)",
    "meter-on": "#25272b",
    rec: "#e5484d",
    hold: "#ff7a1a",
    "draw-line": "rgb(10 10 10 / 0.38)",
    "draw-ink": "rgb(10 10 10 / 0.64)",
    "screen-glow": "rgb(255 255 255 / 0.7)",
    "screen-glass": "linear-gradient(158deg, rgb(255 255 255 / 0.07) 0%, rgb(255 255 255 / 0.02) 38%, transparent 38.2%)",
  },
  dark: {
    frame: "linear-gradient(180deg, #484a4f 0%, #3d3f44 55%, #34363a 100%)",
    "frame-edge": "inset 0 1px 0 rgb(255 255 255 / 0.14), inset 0 0 0 1px rgb(0 0 0 / 0.5), 0 0 0 0.5px rgb(0 0 0 / 0.8)",
    rim: "#000000",
    "rim-edge": "inset 0 1px 0 rgb(255 255 255 / 0.16), inset 0 0 0 1px rgb(255 255 255 / 0.05), 0 0 0 1px rgb(255 255 255 / 0.05)",
    body: "linear-gradient(180deg, #36383d 0%, #2f3135 55%, #282a2e 100%)",
    "body-edge": "inset 0 1px 0 rgb(255 255 255 / 0.09), inset 0 0 0 1px rgb(255 255 255 / 0.02)",
    "body-shadow": "0 1px 2px rgb(0 0 0 / 0.5), 0 18px 36px -18px rgb(0 0 0 / 0.7), 0 60px 100px -50px rgb(0 0 0 / 0.9)",
    grain: "0.3",
    well: "#1d1e22",
    recess: "inset 0 1px 2px rgb(0 0 0 / 0.6), inset 0 0 0 1px rgb(0 0 0 / 0.35), 0 1px 0 rgb(255 255 255 / 0.05)",
    label: "#c8cbd0",
    "label-quiet": "#7e8187",
    engrave: "0 -1px 0 rgb(0 0 0 / 0.8)",
    "engrave-glyph": "drop-shadow(0 -1px 0 rgb(0 0 0 / 0.8))",
    "key-face": "linear-gradient(#45474c, #3a3c41)",
    "key-ink": "#e3e5e9",
    "key-shadow": "inset 0 1px 0 rgb(255 255 255 / 0.12), inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.75), 0 2px 0 0 #0d0d0e, 0 5px 12px -4px rgb(0 0 0 / 0.7)",
    "key-shadow-pressed": "inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(0 0 0 / 0.75), 0 0 0 0 #0d0d0e, 0 1px 1px -1px rgb(0 0 0 / 0.5)",
    "wheel-face": "radial-gradient(120% 120% at 50% 0%, #46484d 0%, #3c3e43 55%, #34363a 100%)",
    "wheel-shadow": "inset 0 1.5px 0 rgb(255 255 255 / 0.12), inset 0 -3px 8px rgb(0 0 0 / 0.2), 0 0 0 1px rgb(0 0 0 / 0.75), 0 2px 0 0 #0d0d0e, 0 12px 28px -12px rgb(0 0 0 / 0.8)",
    "wheel-shadow-pressed": "inset 0 1.5px 0 rgb(255 255 255 / 0.06), inset 0 -3px 8px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(0 0 0 / 0.75), 0 0.5px 0 0 #0d0d0e, 0 4px 10px -6px rgb(0 0 0 / 0.7)",
    "dial-face": "radial-gradient(120% 120% at 50% 0%, #fafbfc 0%, #e6e8eb 55%, #d6d9dd 100%)",
    "dial-shadow": "inset 0 1.5px 0 #ffffff, inset 0 -3px 8px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.6), 0 2px 0 0 #0f1012, 0 12px 28px -12px rgb(0 0 0 / 0.85)",
    "dial-shadow-pressed": "inset 0 1.5px 0 rgb(255 255 255 / 0.6), inset 0 -3px 8px rgb(0 0 0 / 0.14), 0 0 0 1px rgb(0 0 0 / 0.6), 0 0.5px 0 0 #0f1012, 0 4px 10px -6px rgb(0 0 0 / 0.75)",
    "dial-recess": "inset 0 1px 2px rgb(0 0 0 / 0.2), inset 0 0 0 1px rgb(0 0 0 / 0.07), 0 1px 0 rgb(255 255 255 / 0.75)",
    "dial-key-face": "radial-gradient(120% 120% at 50% 0%, #ffffff 0%, #f3f4f6 60%, #e7e9ec 100%)",
    "dial-key-shadow": "inset 0 1px 0 #ffffff, inset 0 0 0 0 transparent, 0 0 0 1px rgb(0 0 0 / 0.16), 0 2px 0 0 #a2a6ad, 0 5px 12px -4px rgb(0 0 0 / 0.3)",
    "dial-key-shadow-pressed": "inset 0 1px 0 rgb(255 255 255 / 0), inset 0 1px 3px rgb(0 0 0 / 0.14), 0 0 0 1px rgb(0 0 0 / 0.18), 0 0 0 0 #a2a6ad, 0 1px 2px -1px rgb(0 0 0 / 0.18)",
    "dial-ink": "#2a2c31",
    "dial-engrave": "0 1px 0 rgb(255 255 255 / 0.8)",
    "dial-engrave-glyph": "drop-shadow(0 1px 0 rgb(255 255 255 / 0.8))",
    "dial-trail": "rgb(0 0 0 / 0.07)",
    lcd: "linear-gradient(112deg, #151516 0%, #111112 47%, #0b0b0c 47.2%, #080809 100%)",
    "lcd-edge": "inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 1px 0 rgb(255 255 255 / 0.07), 0 1px 0 rgb(255 255 255 / 0.04)",
    "lcd-ink": "#f2f2f2",
    "lcd-dim": "rgb(255 255 255 / 0.62)",
    window: "radial-gradient(120% 90% at 50% 0%, #19191a 0%, #070708 70%)",
    "window-edge": "inset 0 2px 7px rgb(0 0 0 / 0.8), inset 0 0 0 1px rgb(0 0 0 / 0.7), inset 0 -1px 0 rgb(255 255 255 / 0.05)",
    "meter-off": "rgb(255 255 255 / 0.13)",
    "meter-on": "#e6e8ec",
    rec: "#ff5c62",
    hold: "#ff8a33",
    "draw-line": "rgb(237 237 237 / 0.34)",
    "draw-ink": "rgb(237 237 237 / 0.64)",
    "screen-glow": "rgb(138 154 242 / 0.35)",
    "screen-glass": "linear-gradient(158deg, rgb(255 255 255 / 0.06) 0%, rgb(255 255 255 / 0.015) 38%, transparent 38.2%)",
  },
} as const;

export type DeviceToken = keyof typeof device.light;

/** The CSS variable behind a device token: `--device-rim`, but `--screen-glow` as written. */
export const deviceVar = (token: DeviceToken) => (token.startsWith("screen-") ? `--${token}` : `--device-${token}`);

/** The hardware materials, each with the tokens it is made from. Documented on /system and in DESIGN.md. */
export const materials: { name: string; tokens: DeviceToken[]; use: string }[] = [
  { name: "Plate", tokens: ["body", "body-edge", "grain"], use: "The body's bead-blasted finish: a lit top edge, soft-light noise over a vertical gradient. Every study sits on one." },
  { name: "Frame", tokens: ["frame", "frame-edge", "body-shadow"], use: "The player's machined frame: a band a shade darker than the body (lighter, in dark), lit along its top edge." },
  { name: "Bezel", tokens: ["rim", "rim-edge"], use: "Black, round LCD cells, dot-matrix strips and a second screen, its polished edge catching the light." },
  { name: "Well", tokens: ["well", "recess"], use: "Anything pressed into the plate: the readout, the key row, a fader's slot, a collar." },
  { name: "Key", tokens: ["key-face", "key-ink", "key-shadow", "key-shadow-pressed"], use: "A raised key on a 2px base it sinks onto. Both shadows keep the same five layers, so they interpolate." },
  { name: "Cap", tokens: ["wheel-face", "wheel-shadow", "wheel-shadow-pressed"], use: "Round caps and the dial: lit from above, seated in a collar cut from the well." },
  { name: "LCD", tokens: ["lcd", "lcd-edge", "lcd-ink", "lcd-dim"], use: "Black glass with a diagonal sheen. Light figures, a white chip for the state, dim units." },
  { name: "Window", tokens: ["window", "window-edge"], use: "Smoked glass set deeper than the LCD: the maker's window, the reels, a fine grille behind it." },
  { name: "Lights", tokens: ["meter-on", "meter-off", "rec", "hold"], use: "Monochrome when lit, red for REC and the playhead, orange for a hand on it. Signal colours glow; meter segments don't." },
  { name: "Lettering", tokens: ["label", "label-quiet", "engrave", "engrave-glyph"], use: "Tiny tracked capitals printed on the body, with a 1px highlight on the side away from the light." },
  { name: "Glass", tokens: ["screen-glass", "screen-glow"], use: "Over a screen: a sheen where the light catches it, and the backlight's bloom as it wakes." },
  { name: "Drawing", tokens: ["draw-line", "draw-ink", "hold"], use: "A study taken apart, drawn: hairlines and lettering over the canvas, the picked layer in the hand's orange." },
];

export const typeScale = [
  { token: "display", size: 32, leading: 1.15, tracking: "-0.035em", weight: 500, use: "Page titles, rarely" },
  { token: "title", size: 20, leading: 1.35, tracking: "-0.018em", weight: 500, use: "Component and section titles" },
  { token: "lead", size: 17, leading: 1.55, tracking: "-0.011em", weight: 400, use: "Intro paragraphs" },
  { token: "body", size: 14, leading: 1.6, tracking: "-0.006em", weight: 400, use: "Default text" },
  { token: "meta", size: 12, leading: 1.4, tracking: "-0.005em", weight: 400, use: "Dates, labels, captions" },
] as const;

export const radii = [
  { token: "key", px: 2, use: "Buttons" },
  { token: "sm", px: 6, use: "Chips, kbd" },
  { token: "md", px: 8, use: "Inputs" },
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
    { token: "stagger", ms: 50, use: "Delay between siblings entering together; cap at 8 items" },
  ],
  springs: [
    { token: "snappy", stiffness: 520, damping: 40, use: "Follows input: indicators, toggles" },
    { token: "gentle", stiffness: 170, damping: 22, use: "Settling into place" },
    { token: "bouncy", stiffness: 260, damping: 12, use: "Playful returns: magnetic, dropped items" },
  ],
} as const;
