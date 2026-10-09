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
};

/** What the anatomy says about one of a study's parts. */
export function partInfo(slug: string, kind: string): PartInfo {
  const base = parts[kind] ?? { name: kind, tokens: [], note: "" };
  return { ...base, ...anatomy[slug]?.[kind] };
}
