import { parts, type PartInfo } from "@/components/anatomy/parts";

/*
 * Studies that can be taken apart on their pages, and what each says about
 * its own parts where the general line in components/anatomy/parts.ts isn't
 * enough. A study is listed here once its parts carry `data-part`.
 */
export const anatomy: Record<string, Partial<Record<string, Partial<PartInfo>>>> = {
  throttle: {
    key: { name: "Pedal", tokens: ["--device-wheel-face", "--device-key-shadow"], note: "Brushed aluminium with a pad of rubber studs in rows. It tilts back from its hinge on the rotate property inside a clipping well, and its face darkens with travel." },
    slot: { name: "Hinge", tokens: ["--device-rim"], note: "A black groove across the foot of the plate, where it is hinged." },
    well: { name: "Wells", note: "The shift-light strip, and the floor the pedal stands in." },
    light: { tokens: ["--device-meter-off", "--device-meter-on", "--device-rec"], note: "Twelve shift lights, the last three red. Each that comes on clicks a little higher, and all flash together at the limiter." },
    lcd: { note: "Revs in light tabular figures with a dim unit, written by the engine loop, with a chip for Idle, Rev and Limiter." },
  },
  "drive-mode": {
    collar: { note: "The rotary's seat, and the centre key's: round recesses pressed into the plate and the cap." },
    cap: { tokens: ["--device-wheel-face", "--device-wheel-shadow", "--device-key-shadow"], note: "A knurled cap turned by a conic gradient from var(--a), its pointer a wedge on the skirt. The centre cap is a key that sinks 2px." },
    light: { tokens: ["--device-meter-off", "--device-meter-on", "--device-rec"], note: "A light beside the chosen mode follows the cap; the ring of twenty goes out one a second over the 20 s boost, drawn from a frame loop." },
    lettering: { note: "The four modes and their detent marks, engraved round the collar." },
    lcd: { note: "The mode chip, and three bars that travel on springs to each mode's preset, with the boost count." },
  },
  "paddle-shifters": {
    key: { name: "Paddles", note: "Levers hung from a pivot: the face sinks 2px and leans about it on the rotate property, inside the key's own frame, so it never spills." },
    drum: { name: "Gear drum", note: "A column of figures on a spring (170, 21) that clicks for each figure it passes, higher for higher gears; a looser spring shakes it at either end." },
    light: { name: "Rev bar", tokens: ["--device-lcd-ink", "--device-rec"], note: "Blips up on a downshift, as a rev-match does, drops on an upshift, then settles. The last 22% is the red zone." },
    well: { note: "The wheel's hub, pressed into the plate." },
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
