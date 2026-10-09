/*
 * The parts a study is built from, as DESIGN.md names them under Materials,
 * each with the tokens that draw it and one line on why it looks the way it
 * does. A study marks its parts with `data-part="<kind>"`; the anatomy names
 * them from here, and a study's entry in src/registry/anatomy.ts can say
 * something more particular about its own.
 */

export type PartInfo = {
  name: string;
  /** The tokens that draw it, as they are written in tokens.css. */
  tokens: string[];
  /** One line on why it looks the way it does. */
  note: string;
};

export const parts: Record<string, PartInfo> = {
  plate: {
    name: "Plate",
    tokens: ["--device-body", "--device-body-edge", "--device-grain"],
    note: "The body's bead-blasted finish: a vertical gradient, a lit top edge and fine noise blended over it.",
  },
  well: {
    name: "Well",
    tokens: ["--device-well", "--device-recess"],
    note: "Pressed into the plate: a shade darker, shadowed inside and lit along its lower lip.",
  },
  collar: {
    name: "Collar",
    tokens: ["--device-recess"],
    note: "A round well, cut to seat a cap.",
  },
  key: {
    name: "Keys",
    tokens: ["--device-key-face", "--device-key-shadow"],
    note: "A face on a 2px base. Pressed, the face drops 2px and the base collapses under it.",
  },
  cap: {
    name: "Cap",
    tokens: ["--device-wheel-face", "--device-wheel-shadow"],
    note: "Round and lit from above, seated in its collar, so it sinks like a key.",
  },
  lcd: {
    name: "LCD",
    tokens: ["--device-lcd", "--device-lcd-edge", "--device-lcd-ink"],
    note: "Black glass whose sheen breaks hard at 47%, where the light catches it, with light figures on it.",
  },
  drum: {
    name: "Drums",
    tokens: [],
    note: "White figures on black drums, each turning on its own spring and clicking for every figure that passes the window.",
  },
  reel: {
    name: "Reels",
    tokens: ["--device-wheel-face", "--device-rim"],
    note: "A pack whose radius grows with the square root of the tape on it, round a hub that turns by its gradients, not a transform.",
  },
  tape: {
    name: "Tape",
    tokens: [],
    note: "Redrawn every frame as tangents to the two packs, over the guides and the head.",
  },
  face: {
    name: "Face",
    tokens: [],
    note: "A backlit face behind the glass, with its scale printed on it; artwork, so it keeps its own warm white in both themes.",
  },
  glass: {
    name: "Glass",
    tokens: ["--screen-glass"],
    note: "A sheen where the light catches it, breaking hard along one line, over whatever is behind it.",
  },
  window: {
    name: "Window",
    tokens: ["--device-window", "--device-window-edge"],
    note: "Smoked glass set deeper than an LCD, with a grille and a lamp's falloff behind it.",
  },
  bezel: {
    name: "Bezel",
    tokens: ["--device-rim", "--device-rim-edge"],
    note: "Black, with a polished edge catching the light, round glass set into the plate.",
  },
  slot: {
    name: "Slot",
    tokens: ["--device-rim"],
    note: "Cut through the well, dark and shadowed inside, for a cap's stem to run in.",
  },
  chip: {
    name: "Chip",
    tokens: [],
    note: "The state, white on the glass: the glyph says it before the word does.",
  },
  light: {
    name: "Lights",
    tokens: ["--device-meter-off", "--device-meter-on", "--device-rec"],
    note: "They come on at once and fade at exit speed. Red fires; orange is a hand on it.",
  },
  lettering: {
    name: "Lettering",
    tokens: ["--device-label", "--device-engrave"],
    note: "Printed into the surface: tracked capitals, with a 1px highlight on the side away from the light.",
  },
};

/** Top to bottom, for kinds that sit at the same height. */
export const stackOrder = ["lettering", "chip", "light", "glass", "tape", "cap", "key", "reel", "drum", "face", "lcd", "window", "bezel", "slot", "collar", "well", "plate"];
