import { parts, type PartInfo } from "@/components/anatomy/parts";

/*
 * Studies that can be taken apart on their pages, and what each says about
 * its own parts where the general line in components/anatomy/parts.ts isn't
 * enough. A study is listed here once its parts carry `data-part`.
 */
export const anatomy: Record<string, Partial<Record<string, Partial<PartInfo>>>> = {
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
};

/** What the anatomy says about one of a study's parts. */
export function partInfo(slug: string, kind: string): PartInfo {
  const base = parts[kind] ?? { name: kind, tokens: [], note: "" };
  return { ...base, ...anatomy[slug]?.[kind] };
}
