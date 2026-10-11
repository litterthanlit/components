import { parts, type PartInfo } from "@/components/anatomy/parts";

/*
 * Studies that can be taken apart on their pages, and what each says about
 * its own parts where the general line in components/anatomy/parts.ts isn't
 * enough. A study is listed here once its parts carry `data-part`.
 */
export const anatomy: Record<string, Partial<Record<string, Partial<PartInfo>>>> = {
  "gauge-cluster": {
    bezel: { tokens: ["--race-well"], note: "Black, with a hairline lit edge, round each face. The large one stands proud of the two behind it and throws a hard shadow on them." },
    face: { tokens: ["--race-glass", "--race-ink", "--race-red", "--race-red-deep"], note: "Black glass with white condensed italic figures; the tach adds a thin red ring and a red pointer at twelve. The red needles glow and leave four ghost needles, all drawn through SVG attributes by a spring in degrees, never a transform." },
    glass: { tokens: ["--race-scanlines"], note: "Scanlines and a sheen over each face and the LCD." },
    chip: { tokens: ["--race-red-deep", "--race-red-ink", "--race-red", "--race-faint"], note: "The gear in white on deep red inside the tach, and the automation's mode on the strip, lit red in Touch." },
    light: { name: "Shift lights", tokens: ["--race-led-off", "--race-ink", "--race-red", "--race-glow-white", "--race-glow-red"], note: "Ten shift lights, four white then six red, lit from 5,500 rpm and all flashing red at the limiter, and a red light for Touch." },
    lcd: { tokens: ["--race-glass", "--race-scanlines"], note: "The mode and the throttle in race-face figures, on the strip under the cluster." },
    well: { tokens: ["--race-well", "--race-recess"], note: "The cluster's pocket in the plate." },
  },
  throttle: {
    key: { name: "Pedal", tokens: ["--race-metal", "--race-key-shadow", "--race-faint", "--race-red"], note: "Dark machined metal with six fine ribs; the toe rib turns red with travel. It tilts back from its hinge on the rotate property inside a clipping well." },
    slot: { name: "Hinge", tokens: ["--race-well", "--race-red"], note: "A thin line on the floor at the foot of the plate, faint red at rest and brighter as the pedal goes down." },
    well: { name: "Pedal box", tokens: ["--race-well", "--race-recess"], note: "The pocket the pedal stands in, pressed into the plate." },
    light: { name: "Rev hairline", tokens: ["--race-faint", "--race-ink", "--race-red"], note: "A 2px line under the figure, white to the redline and red beyond it, with a fine red tick. It follows the integrator and pulses calmly at the limiter." },
    lettering: { name: "Revs", tokens: ["--race-ink", "--race-red", "--race-dim"], note: "The rpm in race-face figures, white, and red at the limiter, with a small dim rpm." },
  },
  "drive-mode": {
    collar: { note: "The rotary's seat, and the centre key's: round black recesses pressed into the well and the cap." },
    cap: { tokens: ["--race-key-face", "--race-key-shadow", "--race-faint", "--race-red"], note: "A black knurled cap turned by a conic gradient from var(--a), its pointer a lit red wedge on the skirt. The centre cap is a key that sinks 2px." },
    light: { tokens: ["--race-led-off", "--race-red", "--race-glow-red"], note: "A light beside the chosen mode follows the cap, lit red. The ring of twenty glows red and goes out one a second over the 20 s boost, drawn from a frame loop." },
    lettering: { note: "The four modes and their detent marks, engraved round the collar, the chosen one lit red; the red rule and chevrons on the plate and LCD." },
    lcd: { tokens: ["--race-glass", "--race-red", "--race-ink", "--race-glow-white"], note: "Black glass with the mode in condensed italic red figures, three red LED bars that travel on springs to each mode's preset, and the boost count in white." },
    glass: { tokens: ["--race-scanlines"], note: "Scanlines over the LCD, a 1px line every 3px." },
    well: { tokens: ["--race-well", "--race-recess"], note: "The switch's pocket, pressed into the plate." },
  },
  "paddle-shifters": {
    key: { name: "Paddles", tokens: ["--race-metal", "--race-key-shadow", "--race-red"], note: "Slim dark blades hung from a pivot, with a swept tip and a thin red edge on the inner side. The face sinks 2px and leans about the pivot on the rotate property inside the key's own frame, settling with one small overshoot." },
    drum: { name: "Gear drum", tokens: ["--race-ink"], note: "A column of huge condensed white figures on a spring (300, 25) that ticks for each figure it passes; a looser spring shakes it at either end." },
    light: { name: "Rev hairline", tokens: ["--race-faint", "--race-ink", "--race-red"], note: "One thin line under the gear, white with red near the top, driven by the rev spring: up on a downshift, down on an upshift." },
  },
  chrono: {
    face: { tokens: ["--race-well", "--race-ink", "--race-dim", "--race-faint", "--race-red"], note: "A black dial on the black plate: fine white ticks, condensed italic figures at 60, 15, 30 and 45, a thirty-minute sub-dial with a white hand, and one red seconds hand on a small hub with a faint halo." },
    key: { tokens: ["--race-key-face", "--race-key-shadow", "--race-key-shadow-pressed"], note: "Two quiet dark keys that sink 2px onto their base: Start and Stop, and Lap, which is Reset once stopped." },
    light: { tokens: ["--race-led-off", "--race-red", "--race-glow-red"], note: "A single small red dot on Start and Stop: on at once while the clock runs, off softly." },
    lettering: { tokens: ["--race-ink", "--race-faint"], note: "Plain white capitals on the keys; dim when Reset has nothing to clear." },
  },
  "start-key": {
    collar: { tokens: ["--race-well", "--race-recess"], note: "The barrel's seat, black with a fine knurl round its rim. The stops are engraved outside it: Off, On, and a fine red dashed run to Start, where the key is spring-loaded." },
    cap: { tokens: ["--race-glass"], note: "The barrel face in black glass, fixed in place. The key turns on top of it." },
    key: { name: "Bow", tokens: ["--race-red"], note: "A clean dark key bow with one thin red pointer, turned on the rotate property by an integrator: detents at Off and On, a stiffening return spring past On, hard stops at each end." },
    light: { name: "Warning lights", tokens: ["--race-led-off", "--race-red", "--race-ink"], note: "Three small glyphs on the plate, nearly invisible until the light check. Battery and oil stay red until the engine catches." },
    lettering: { name: "Stops and revs", tokens: ["--race-ink", "--race-dim", "--race-red"], note: "The stops, dim until the key is at one: that stop turns white. The revs, one large white figure on the plate, sweep to 2,500 and settle to 850 on a spring that also drives the engine." },
  },
  knob: {
    cap: { note: "Knurled round its skirt by a conic gradient from var(--a), so it turns without a transform." },
    light: { tokens: ["--device-meter-off", "--device-meter-on"], note: "Fifteen strokes round the collar, lit by the same spring that turns the cap and clicks the detents." },
    lcd: { note: "The spring writes the value straight into the glass, so it counts through the detents with the clicks." },
  },
  "hold-to-confirm": {
    light: { tokens: ["--device-meter-off", "--device-rec"], note: "Twelve lights, one click a little higher as each comes on, drawn from a frame loop so holding never re-renders." },
    cap: { tokens: ["--device-wheel-face", "--device-key-shadow"], note: "A cap with a key's shadows, so it sinks 2px while held. Its mark glows as the hold builds." },
  },
  switch: {
    key: { name: "Caps", note: "A knurled key on an over-centre spring: it lags the finger toward the centre, then snaps through onto the far stop." },
    well: { name: "Tracks", note: "Recessed into the plate; the orange stripe in each is uncovered as its cap slides on." },
    light: { tokens: ["--device-meter-off", "--device-hold"], note: "Orange when a switch is on, lit on the frame the cap snaps over, not when React hears about it." },
  },
  fader: {
    key: { name: "Caps", note: "A ridged key riding the slot. Values from outside travel on a motor; a hand's land at once, and the motor lets go." },
    lettering: { note: "The scale, engraved beside the slot, with 0 dB in the stronger grey: the unity detent catches the cap there." },
    light: { tokens: ["--device-meter-off", "--device-meter-on", "--device-hold"], note: "Each channel's automation: grey in Read, orange while a hand is on the cap in Touch." },
  },
  "one-time-code": {
    lcd: { name: "Cells", note: "Seven segments over the faint 8 of their unlit ones, drawn under one real input, so paste and autofill just work." },
    bezel: { note: "Black, with a polished edge, round the cells: a strip of glass set into the plate." },
    light: { tokens: ["--device-meter-off", "--device-hold", "--device-rec"], note: "Orange while the code is checked, red when it is wrong." },
  },
  "vu-meter": {
    face: { note: "Backlit paper behind the glass: a scale linear in voltage, 0 VU seven tenths of the way across, and a needle with VU ballistics." },
    glass: { tokens: [], note: "A sheen over each face, breaking at 36%, and the lamp's falloff toward the corners." },
    light: { tokens: ["--device-meter-off", "--device-rec"], note: "The peak lights hold 600 ms past +3 VU; Slate's lights while the 1 kHz tone plays." },
  },
  "number-ticker": {
    bezel: { note: "The tape counter's window: black, set into the well, with the separators printed on its frame between the drums." },
    light: { tokens: ["--device-lcd-ink", "--device-rec"], note: "Which way the count went: white for up, red for down." },
  },
  "tape-reels": {
    window: { note: "Smoked glass set deeper than an LCD, with a fine grille behind it and the lamp that lights the transport." },
    glass: { tokens: [], note: "The window's sheen, breaking hard at 44%." },
  },
  "step-sequencer": {
    key: { name: "Steps", note: "Sixty-four keys, each with a light in a window across its top: grey when set, red as the playhead fires it." },
    light: { tokens: ["--device-meter-off", "--device-meter-on", "--device-rec"], note: "Read from the same audio-clock queue as the notes, so they land with the sound." },
  },
  "agent-status": {
    lcd: { note: "The run's readout: the state's chip, a clock in minutes, seconds and frames that counts only while the run is live, and the step." },
    light: { tokens: ["--device-meter-off", "--device-meter-on", "--device-rec", "--device-hold"], note: "Each phase latches once the run has passed it; the one firing flickers with every chunk of tokens through a 90 ms detector." },
    well: { name: "Wells", note: "Pressed into the plate: the readout's, and the small recess each light sits in." },
  },
  ticker: {
    matrix: { note: "Any text, set in the page's own typeface, rasterized at the matrix's height and thresholded into dots; the canvas redraws only when a column changes." },
    glass: { note: "The strip's sheen, over the dots." },
    light: { tokens: ["--device-meter-off", "--device-rec", "--device-hold"], note: "The tone of the message showing, in a light beside its name." },
  },
  "agent-indicators": {
    lcd: { note: "Seven segments chasing round, meters taking tokens in, a matrix working through interference: each a face of the same glass." },
    window: { note: "Smoked glass for the tuner's needle and the reels that write to tape." },
    well: { name: "Wells", note: "Pressed into the plate: one for the indicator in use, one under each of the six, and a recess for every step light." },
  },
  "dither-card": {
    key: { note: "A key with a screen in its face: only the face sinks, so the hit area never moves under the finger." },
    lcd: { name: "Screens", note: "Raw WebGL at half resolution in three-tone ordered dither, scaled up pixel for pixel; a hand lights the screen under it." },
  },
  "gradient-keys": {
    screen: { note: "Long exposures in traditional Japanese palettes: noise sweeping across as it flows along. The work, so it keeps its own colours in both themes." },
    glass: { note: "A sheen over each screen and its edge, where the light catches the glass." },
    light: { tokens: ["--device-meter-off", "--device-meter-on"], note: "On at once under the selection, off at exit speed." },
  },
  "command-menu": {
    bezel: { note: "Black, with a polished edge, round the player's own screen: the menu is a second screen, not a card." },
    screen: { name: "Screen", note: "The site's own ground under glass: its canvas and type, and the accent bar gliding on a spring between rows." },
    glass: { note: "The screen's sheen, and the backlight's bloom as it wakes." },
  },
};

/** What the anatomy says about one of a study's parts. */
export function partInfo(slug: string, kind: string): PartInfo {
  const base = parts[kind] ?? { name: kind, tokens: [], note: "" };
  return { ...base, ...anatomy[slug]?.[kind] };
}
