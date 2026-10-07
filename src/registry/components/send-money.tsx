"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * Sending money, after a payment terminal: a screen set into the plate
 * behind a black bezel, a keypad of the player's keys and a wide SEND key
 * with a row of eight lights. Pick who to pay, type the amount, hold SEND.
 *
 * It moves from shot to shot by cuts, not slides or fades. Recent contacts
 * roll under a fixed accent bar, like cards on a drum, on the highlight
 * bar's spring, with a click for every row that passes. The bar is a second
 * copy of the rows in accent and white, clipped to the slot, so a name turns
 * white exactly where the bar is. Picking someone is a match cut: the slot's
 * row stays where it is and becomes the header of the amount shot while
 * everything around it changes at once. A tapped row rolls up into the slot
 * and the cut fires as it lands, a quarter of a row short, so the last of
 * the roll settles inside the next shot (a cut on action). Sending is a smash
 * cut: the screen inverts, ink for ground, with the amount large.
 *
 * Every cut is led by its sound: the next shot's cue plays, and the picture
 * follows 26ms later, so it paints 26 to 43ms after the sound, depending on
 * where the frame falls. The words said to a screen reader change with the
 * picture.
 *
 * The amount is one real input under drawn figures, so paste, autofill and
 * screen readers work. Each figure typed rises into place on a stiff spring
 * (700, 0.75 of critical), blurred vertically by its own speed through an
 * SVG filter, and the line glides to stay centred; one frame loop draws it
 * all through CSS variables and stops at rest. A deleted figure is cut.
 *
 * Hold SEND (pointer, Space or Enter, or Enter in the field or on the
 * keypad) and its lights fire one by one over 900ms, each click a little
 * higher; let go early and they run back. The list is one tab stop (arrows,
 * Home, End, type-ahead, Enter), the keypad another; it types without
 * focusing the field, so a phone's keyboard stays down. Under reduced motion
 * the list jumps and the figures land at once.
 */

export type Payee = { id: string; name: string; detail?: string };
export type Payment = { payee: Payee; amount: string; minor: number };
export type SendReceipt = { id: string; payee: string; amount: string; reference?: string; when?: string };
export type SendMoneyKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "delete" | "up" | "down" | "choose" | "back" | "done";

export type SendMoneyHandle = {
  /** Presses a key as a hand would: keypad keys sink, the list rolls, the bar flashes. Sounds only while the host's tape plays. */
  press: (key: SendMoneyKey) => void;
  /** Holds SEND down, or lets it go. */
  hold: (down: boolean) => void;
  /** Lifts a contact's row, as a pointer resting on it would. */
  hover: (id: string | null) => void;
  /** Taps a contact: it rolls into the slot and is chosen as it lands. */
  tap: (id: string) => void;
};

type SendMoneyProps = {
  contacts: Payee[];
  /** The contact being paid, by id; null while choosing. */
  payee: string | null;
  onPayeeChange: (id: string | null) => void;
  /** The amount as typed, in the currency's major units: "120", "85.5". */
  amount: string;
  onAmountChange: (amount: string) => void;
  /** SEND was held to the end. Set `sending` while it goes, and `receipt` once it has. */
  onSend: (payment: Payment) => void;
  /** The payment that went through: shows the receipt. */
  receipt?: SendReceipt | null;
  /** NEW PAYMENT on the receipt. */
  onDone?: () => void;
  /** The payment is on its way: SEND's lights hold red and the keys lock. */
  sending?: boolean;
  /** What it's for, printed under the amount: "take_04". */
  reference?: string;
  /** What can be sent, in major units. Shown, and the amount can't pass it. */
  balance?: number;
  currency?: string;
  locale?: string;
  /** ms SEND must be held. */
  hold?: number;
  /** The amount field's form name. */
  name?: string;
  label?: string;
  ref?: Ref<SendMoneyHandle>;
  className?: string;
};

type Scene = "choose" | "amount" | "sent";
type By = "pointer" | "key" | "ghost";
type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "delete";

const ROWS = 4; // rows the list shows, the slot first
const CHOOSE_AT = 0.25; // rows short of the slot: a tapped row is chosen as it lands, and finishes landing in the next shot
const LEAD = 26; // ms the picture waits after the sound: with the frame it waits for, it paints 26 to 43ms after it
const LIGHTS = 8;
const HOLD_LIT = 450; // ms the lights stay lit once the payment has gone
const REWIND = 220; // ms for a full row of lights to run back
const FLASH = 110; // ms a key stays down when pressed by the keyboard or a ghost
const MAX_FIGURES = 8; // figures and the point: 99,999.99
const STEP = 1 / 240;
const FIG = { k: 700, c: 2 * Math.sqrt(700) * 0.75 }; // a figure rising into place: 0.75 of critical, a hair of overshoot
const LINE = springs.snappy; // the line re-centring, and the shot's settle
const SMEAR = 0.45; // the blur's deviation, as a share of the distance a figure travels in a 60 Hz frame
const MAX_BLUR = 4; // px

const PAD: { key: PadKey; name: string }[] = [
  { key: "1", name: "1" },
  { key: "2", name: "2" },
  { key: "3", name: "3" },
  { key: "4", name: "4" },
  { key: "5", name: "5" },
  { key: "6", name: "6" },
  { key: "7", name: "7" },
  { key: "8", name: "8" },
  { key: "9", name: "9" },
  { key: ".", name: "Point" },
  { key: "0", name: "0" },
  { key: "delete", name: "Delete" },
];
const COLS = 3;

/** Each cut's cue, played before the picture changes. */
const CUES: Partial<Record<`${Scene}>${Scene}`, [SoundName, PlayOptions]>> = {
  "choose>amount": ["open", { gain: 0.55 }],
  "amount>sent": ["select", { gain: 0.7 }],
  "amount>choose": ["back", { gain: 0.6 }],
  "sent>choose": ["close", { gain: 0.5 }],
};

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A detent's pitch, varied a little so a run of rows never clicks the same twice. */
const detent = () => 0.97 + Math.random() * 0.06;
/** Each figure clicks at its own pitch, a little higher up the pad. */
const pitchOf = (key: string) => 0.9 + (key === "0" ? 10 : Number(key) || 0) * 0.018;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2);

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]";
/** A key's face: it sinks onto its base under the hand, or while `data-pressed` (the keyboard, the ghost). */
const sink =
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";
const face =
  "rounded-[0.65em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out";

/* --- Money ------------------------------------------------------------------ */

/** A currency's symbol, separators and minor units, read from Intl so any locale works. */
function moneyOf(locale: string, currency: string) {
  const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
  const parts = nf.formatToParts(12345.6);
  const value = (type: string) => parts.find((p) => p.type === type)?.value;
  const at = (type: string) => parts.findIndex((p) => p.type === type);
  return {
    symbol: value("currency") ?? currency,
    before: at("currency") < at("integer"),
    group: value("group") ?? ",",
    decimal: value("decimal") ?? ".",
    minor: nf.resolvedOptions().maximumFractionDigits ?? 2,
    format: (major: number) => nf.format(major),
  };
}
type Money = ReturnType<typeof moneyOf>;

/** "120.5" in minor units: 12050. */
const toMinor = (amount: string, minor: number) => Math.round(Number(amount || "0") * 10 ** minor);

/** The amount after a keypad key: the new string, null if the key does nothing, "over" past the limit. */
function typed(amount: string, key: PadKey, m: Money, limit: number): string | null | "over" {
  if (key === "delete") return amount ? (amount === "0." ? "" : amount.slice(0, -1)) : null;
  const [int, frac] = amount.split(".");
  if (key === ".") return m.minor === 0 || frac !== undefined ? null : `${int || "0"}.`;
  if (frac !== undefined && frac.length >= m.minor) return null;
  if (frac === undefined && int.length >= MAX_FIGURES - 1 - m.minor) return null;
  const next = amount === "0" ? (key === "0" ? null : key) : amount + key;
  if (next === null) return null;
  return toMinor(next, m.minor) > limit ? "over" : next;
}

/** Whatever was pasted or filled in ("£1,200.50", "1 200,5 €"), as an amount: "1200.50". */
function normalize(text: string, m: Money) {
  let t = text.replace(/\s/g, "");
  // The locale's own point; anything else between figures is grouping.
  t = m.decimal === "." ? t.replace(/[^\d.]/g, "") : t.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".").replace(/,/g, "");
  const [int = "", ...rest] = t.split(".");
  const whole = int.replace(/^0+(?=\d)/, "").slice(0, MAX_FIGURES - 1 - m.minor);
  if (!rest.length || m.minor === 0) return whole;
  return `${whole || "0"}.${rest.join("").slice(0, m.minor)}`;
}

/** The figures to draw for an amount: each digit and the point keyed by its place in the string; grouping printed between. */
function figuresOf(amount: string, m: Money) {
  const [int, frac] = amount.split(".");
  const out: { key: string; ch: string; i: number | null }[] = [];
  for (let i = 0; i < int.length; i++) {
    if (i > 0 && (int.length - i) % 3 === 0) out.push({ key: `g${int.length - i}`, ch: m.group, i: null });
    out.push({ key: `f${i}`, ch: int[i], i });
  }
  if (frac !== undefined) {
    out.push({ key: `f${int.length}`, ch: m.decimal, i: int.length });
    for (let j = 0; j < frac.length; j++) out.push({ key: `f${int.length + 1 + j}`, ch: frac[j], i: int.length + 1 + j });
  }
  return out;
}

/* --- Parts ------------------------------------------------------------------ */

/** A contact's row. Drawn twice: in ink, and in white on the bar. */
function RowContent({ payee, bar }: { payee: Payee; bar?: boolean }) {
  return (
    <>
      <span
        className={cx(
          "grid size-[1.65em] shrink-0 place-items-center rounded-full",
          bar ? "bg-white/20 text-accent-ink" : "bg-panel text-ink shadow-[inset_0_0_0_1px_var(--line)]",
        )}
      >
        <span className="text-[0.62em] font-semibold leading-none tracking-[0.02em]">{initials(payee.name)}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[1.02em] tracking-[-0.01em]">{payee.name}</span>
      {payee.detail && <span className={cx("shrink-0 truncate text-[0.8em]", bar ? "text-accent-ink/80" : "text-muted")}>{payee.detail}</span>}
    </>
  );
}

const rowClass = "absolute inset-x-0 flex h-(--row) items-center gap-[0.65em] px-[0.95em]";

type Figures = { sync: (shift: number, grew: number[], enter: boolean) => void };
type Hold = { press: (by: By) => void; release: () => void };

/* --- The terminal ------------------------------------------------------------- */

export function SendMoney({
  contacts,
  payee,
  onPayeeChange,
  amount,
  onAmountChange,
  onSend,
  receipt,
  onDone,
  sending = false,
  reference,
  balance,
  currency = "GBP",
  locale = "en-GB",
  hold = 900,
  name,
  label = "Send money",
  ref,
  className,
}: SendMoneyProps) {
  const scene: Scene = receipt ? "sent" : payee ? "amount" : "choose";
  const money = useMemo(() => moneyOf(locale, currency), [locale, currency]);
  const limit = balance === undefined ? Infinity : Math.round(balance * 10 ** money.minor);
  const ids = useId();
  const uid = ids.replace(/[^\w-]/g, "");
  const optionId = (id: string) => `${uid}-c-${id}`;

  // What's on the screen: it follows the scene a beat behind, after the cue (see the cut's effect).
  const [shown, setShown] = useState<Scene>(scene);
  // The receipt on screen, kept while the screen cuts away from it.
  const [kept, setKept] = useState(receipt ?? null);
  if (receipt && receipt !== kept) setKept(receipt);

  // The row in the slot. Paying someone puts them there, however they were chosen.
  const [slot, setSlot] = useState(() => Math.max(0, contacts.findIndex((c) => c.id === payee)));
  const payeeAt = contacts.findIndex((c) => c.id === payee);
  if (scene === "amount" && payeeAt >= 0 && payeeAt !== slot) setSlot(payeeAt);
  // Back from a receipt, the list starts at the top.
  const [lastScene, setLastScene] = useState(scene);
  if (scene !== lastScene) {
    setLastScene(scene);
    if (lastScene === "sent" && scene === "choose" && slot !== 0) setSlot(0);
  }
  const at = clamp(slot, 0, Math.max(0, contacts.length - 1));
  const chosen = payeeAt >= 0 ? contacts[payeeAt] : null;
  const inSlot = contacts[at] ?? null;

  const [lifted, setLifted] = useState<string | null>(null); // a row a pointer rests on
  const [held, setHeld] = useState(false); // SEND is down
  const [down, setDown] = useState<PadKey | null>(null); // a keypad key shown down (keyboard, ghost)
  const [rove, setRove] = useState(0); // the keypad's tab stop
  const [refused, setRefused] = useState({ n: 0, words: "", shot: 0 }); // the shot it was said in

  /* --- Words ----------------------------------------------------------------------- */

  // Said once per shot, its words fixed when the picture changes, so a figure typed later isn't read out again.
  // Who's being paid falls back to the slot, so the beat before a cut back to the list isn't a change.
  const sayKey = `${shown}|${shown === "amount" ? (chosen?.id ?? inSlot?.id ?? "") : ""}|${shown === "sent" ? (kept?.id ?? "") : ""}|${sending}`;
  const [said, setSaid] = useState({ key: sayKey, n: 0, words: "" });
  if (said.key !== sayKey) {
    let words = "";
    if (shown === "choose") words = "Choose who to pay";
    else if (shown === "amount") words = sending ? "Sending" : `Paying ${chosen?.name ?? inSlot?.name ?? ""}${balance === undefined ? "" : `. ${money.format(balance)} available`}`;
    else if (kept) {
      const to = contacts.find((c) => c.id === kept.payee)?.name;
      words = `Sent ${money.format(toMinor(kept.amount, money.minor) / 10 ** money.minor)}${to ? ` to ${to}` : ""}${kept.reference ? ` for ${kept.reference}` : ""}`;
    }
    setSaid({ key: sayKey, n: said.n + 1, words });
  }

  const canSend = scene === "amount" && !!chosen && !sending && toMinor(amount, money.minor) > 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const totalRef = useRef<HTMLParagraphElement>(null);
  const roll = useRef<Spring | null>(null);
  const figures = useRef<Figures | null>(null);
  const engine = useRef<Hold | null>(null);
  const landing = useRef<{ to: number; done: () => void } | null>(null); // a tapped row, chosen as it lands
  const quiet = useRef(false); // the roll is jumping: no clicks
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused
  const focusNext = useRef<"pointer" | "key" | null>(null); // a hand's cut: focus follows it to the next shot
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shownRef = useRef(shown);
  const live = useRef<{ canSend: boolean; fire: (by: By) => void; hold: number }>({ canSend, fire: () => {}, hold });

  /** Sounds it makes by itself follow the host's transport; the hand's always play. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }
  const soundEvent = useEffectEvent(sound);

  /** SEND held to the end: the payment goes. */
  function fire(by: By) {
    if (!canSend || !chosen) return;
    if (by !== "ghost") focusNext.current = by;
    onSend({ payee: chosen, amount, minor: toMinor(amount, money.minor) });
  }

  useLayoutEffect(() => {
    shownRef.current = shown;
    live.current = { canSend, fire, hold };
  });

  /* --- The cut ------------------------------------------------------------- */

  // A new scene: its cue first, then the picture, so the sound leads the cut.
  const cue = useEffectEvent((from: Scene, to: Scene) => {
    const c = CUES[`${from}>${to}`];
    if (c) sound(...c);
  });
  const heard = useRef(scene);
  useLayoutEffect(() => {
    const from = heard.current;
    if (from === scene) return;
    heard.current = scene;
    cue(from, scene);
    const id = setTimeout(() => setShown(scene), LEAD);
    return () => clearTimeout(id);
  }, [scene]);

  // A hand's cut takes focus with it: to the field (or the keypad, after a pointer, so a phone's keyboard stays down),
  // the receipt's key, or the list. The ghost's cuts never move focus.
  useLayoutEffect(() => {
    const by = focusNext.current;
    if (!by) return;
    focusNext.current = null;
    const el =
      shown === "amount"
        ? by === "key"
          ? inputRef.current
          : padRef.current?.querySelector<HTMLElement>("[tabindex='0']")
        : shown === "sent"
          ? doneRef.current
          : listRef.current;
    if (!el) return;
    if (by === "key") el.focus({ preventScroll: true });
    else focusQuietly(el);
  }, [shown]);

  // The smash cut's settle: the amount lands a hair large and comes to size.
  useLayoutEffect(() => {
    if (shown !== "sent" || reducedMotion()) return;
    totalRef.current?.animate([{ transform: "scale(1.045)" }, { transform: "scale(1)" }], { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }, [shown]);

  /* --- The roll -------------------------------------------------------------- */

  // The list rolls in rows under the fixed bar, on the highlight bar's spring, and clicks once per row that passes.
  useLayoutEffect(() => {
    const win = windowRef.current!;
    let row = 0;
    const s = createSpring(0, springs.snappy, (r) => {
      win.style.setProperty("--roll", r.toFixed(4));
      const near = Math.round(r);
      if (near !== row) {
        row = near;
        if (!quiet.current) soundEvent("tick", { gain: 0.5, pitch: detent() });
      }
      const land = landing.current;
      if (land && Math.abs(r - land.to) < CHOOSE_AT) {
        landing.current = null;
        queueMicrotask(land.done);
      }
    });
    roll.current = s;
    return () => s.stop();
  }, []);

  // A new slot: the list rolls to it, or jumps (its first place, reduced motion, or behind the receipt).
  const placed = useRef(false);
  useLayoutEffect(() => {
    const s = roll.current!;
    if (!placed.current || reducedMotion() || shownRef.current === "sent") {
      placed.current = true;
      quiet.current = true;
      s.jump(at);
      quiet.current = false;
    } else s.set(at);
  }, [at]);

  // Scrolling over the list rolls it a row at a time.
  const wheel = useEffectEvent((forward: boolean) => move(at + (forward ? 1 : -1), "pointer"));
  useEffect(() => {
    const el = windowRef.current!;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (shownRef.current !== "choose") return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 30) return;
      wheel(acc > 0);
      acc = 0;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* --- The figures ----------------------------------------------------------- */

  // One frame loop: the line re-centring and settling, and each new figure rising into place, blurred by its speed.
  useLayoutEffect(() => {
    const row = rowRef.current!;
    const blurs = [...defsRef.current!.querySelectorAll<SVGFEGaussianBlurElement>("[data-blur]")];
    const reduced = reducedMotion();
    let dx = 0; // px
    let vx = 0;
    let dy = 0; // em
    let vy = 0;
    let figs: { el: HTMLElement; i: number; y: number; v: number; blur: number }[] = [];
    let travel = 30; // px a figure rises, measured at each change
    let raf = 0;
    let last = 0;
    let acc = 0;

    const draw = () => {
      row.style.setProperty("--dx", `${dx.toFixed(2)}px`);
      row.style.setProperty("--dy", dy.toFixed(4));
      for (const f of figs) {
        f.el.style.setProperty("--y", f.y.toFixed(4));
        const sigma = reduced ? 0 : Math.min(MAX_BLUR, (Math.abs(f.v) * travel * SMEAR) / 60);
        if (Math.abs(sigma - f.blur) > 0.05 || (sigma === 0 && f.blur !== 0)) {
          f.blur = sigma;
          blurs[f.i]?.setAttribute("stdDeviation", `0 ${sigma.toFixed(2)}`);
          f.el.style.filter = sigma > 0.1 ? `url(#${uid}-blur-${f.i})` : "";
        }
      }
    };
    const step = () => {
      vx += (-LINE.stiffness * dx - LINE.damping * vx) * STEP;
      dx += vx * STEP;
      vy += (-LINE.stiffness * dy - LINE.damping * vy) * STEP;
      dy += vy * STEP;
      for (const f of figs) {
        f.v += (-FIG.k * f.y - FIG.c * f.v) * STEP;
        f.y += f.v * STEP;
      }
    };
    const rest = () => {
      if (Math.abs(dx) < 0.05 && Math.abs(vx) < 1) dx = vx = 0;
      if (Math.abs(dy) < 0.002 && Math.abs(vy) < 0.02) dy = vy = 0;
      let still = dx === 0 && dy === 0;
      for (const f of figs) {
        if (Math.abs(f.y) < 0.002 && Math.abs(f.v) < 0.02) f.y = f.v = 0;
        else still = false;
      }
      return still;
    };
    const frame = (now: number) => {
      const t = now / 1000;
      acc += Math.min(0.064, t - last);
      last = t;
      for (; acc >= STEP; acc -= STEP) step();
      const still = rest();
      draw();
      raf = still ? 0 : requestAnimationFrame(frame);
    };
    const wake = () => {
      if (raf) return;
      last = performance.now() / 1000;
      acc = 0;
      raf = requestAnimationFrame(frame);
    };

    figures.current = {
      sync(shift, grew, enter) {
        // Figures keep their motion by place; a new element at a place starts afresh.
        const before = new Map(figs.map((f) => [f.i, f]));
        figs = [...row.querySelectorAll<HTMLElement>("[data-fig]")].map((el) => {
          const i = Number(el.dataset.fig);
          const f = before.get(i);
          return f && f.el === el ? f : { el, i, y: 0, v: 0, blur: 0 };
        });
        if (reduced) {
          dx = vx = dy = vy = 0;
          draw();
          return;
        }
        travel = parseFloat(getComputedStyle(row).fontSize) * 1.2;
        dx += shift;
        if (enter) {
          dy = 0.3;
          vy = 0;
        }
        for (const f of figs) {
          if (!grew.includes(f.i)) continue;
          f.y = 1; // a line below, out of the window
          f.v = 0;
        }
        draw();
        wake();
      },
    };
    return () => cancelAnimationFrame(raf);
  }, [uid]);

  // Each change to the amount: new figures rise, and the line glides from where it was to stay centred.
  const measured = useRef<{ amount: string; left: number; shown: Scene } | null>(null);
  useLayoutEffect(() => {
    const left = rowRef.current!.offsetLeft;
    const prev = measured.current;
    measured.current = { amount, left, shown };
    if (!prev || (prev.amount === amount && prev.shown === shown)) return;
    const grew = amount.length > prev.amount.length && amount.startsWith(prev.amount) ? Array.from({ length: amount.length - prev.amount.length }, (_, k) => prev.amount.length + k) : [];
    figures.current!.sync(prev.amount === amount ? 0 : prev.left - left, grew, shown === "amount" && prev.shown !== "amount");
  }, [amount, shown]);

  /* --- Hold to send ------------------------------------------------------------ */

  // The lights fill while SEND is held, a ratchet click each, and run back when it's let go. Drawn straight to the DOM.
  useLayoutEffect(() => {
    const key = sendRef.current!;
    const lights = [...key.querySelectorAll<HTMLElement>("[data-light]")];
    let p = 0;
    let lit = 0;
    let holding: By | null = null;
    let litUntil = 0;
    let raf = 0;
    let last = 0;

    const draw = () => {
      const next = Math.min(LIGHTS, Math.floor(p * LIGHTS + 1e-6));
      if (next === lit) return;
      lights.forEach((light, i) => light.toggleAttribute("data-on", i < next));
      if (holding && next > lit) soundEvent("tick", { gain: 0.7, pitch: 0.88 + next * 0.045 });
      lit = next;
    };
    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      if (holding) {
        p = Math.min(1, p + dt / live.current.hold);
        if (p >= 1) {
          const by = holding;
          holding = null;
          litUntil = now + HOLD_LIT;
          draw();
          setHeld(false);
          live.current.fire(by);
        }
      } else if (now >= litUntil) p = Math.max(0, p - dt / REWIND);
      draw();
      raf = holding || p > 0 ? requestAnimationFrame(frame) : 0;
    };
    const run = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    engine.current = {
      press(by) {
        if (holding || performance.now() < litUntil) return;
        if (!live.current.canSend) {
          if (by !== "ghost") soundEvent("bump", { gain: 0.6 });
          return;
        }
        holding = by;
        setHeld(true);
        soundEvent("press", { gain: 0.8 });
        run();
      },
      release() {
        if (!holding) return;
        holding = null;
        setHeld(false);
        soundEvent("release", { gain: 0.7 });
        if (p > 0) soundEvent("bump", { gain: 0.6 });
        run();
      },
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  /* --- Moves --------------------------------------------------------------------- */

  /** Rolls the slot to row `to`. */
  function move(to: number, by: By) {
    if (scene !== "choose" || !contacts.length) return;
    landing.current = null;
    const next = clamp(to, 0, contacts.length - 1);
    if (next === at) return sound("bump", { gain: by === "pointer" ? 0.4 : 0.6 });
    setSlot(next); // the roll clicks as each row passes
  }

  /** The bar lights up as it's pressed; the flash carries across the cut on the same bar. */
  function flashBar() {
    const overlay = overlayRef.current!;
    overlay.setAttribute("data-flash", "");
    setTimeout(() => overlay.removeAttribute("data-flash"), 160);
  }

  /** Pays this contact: the cut to the amount. */
  function pick(id: string | undefined, by: By) {
    if (!id || scene !== "choose") return;
    flashBar();
    if (by !== "ghost") focusNext.current = by;
    onPayeeChange(id);
  }

  /** A tap on a row: it rolls up into the slot and is chosen as it lands. */
  function tapRow(i: number, by: By) {
    if (scene !== "choose") return;
    const id = contacts[i]?.id;
    if (!id) return;
    if (by === "ghost") {
      const el = document.getElementById(optionId(id));
      el?.setAttribute("data-tapped", "");
      setTimeout(() => el?.removeAttribute("data-tapped"), 120);
    }
    if (i === at && Math.abs((roll.current?.value ?? at) - i) < CHOOSE_AT) return pick(id, by);
    landing.current = { to: i, done: () => pick(id, by) };
    if (i !== at) setSlot(i);
  }

  function back(by: By) {
    if (scene !== "amount") return false;
    if (by !== "ghost") focusNext.current = by;
    onPayeeChange(null);
    return true;
  }

  function finish(by: By) {
    if (scene !== "sent" || !onDone) return false;
    if (by !== "ghost") focusNext.current = by;
    onDone();
    return true;
  }

  function refuse(over: boolean, by: By) {
    sound("bump", { gain: by === "pointer" ? 0.5 : 0.6 });
    if (over && balance !== undefined) setRefused((r) => ({ n: r.n + 1, words: `Up to ${money.format(balance)}`, shot: said.n }));
  }

  /** A keypad key, whoever pressed it. In the list, a figure pays whoever's in the slot and starts the amount. */
  function typeKey(key: PadKey, by: By) {
    if (sending || scene === "sent") return refuse(false, by);
    const from = scene === "choose" ? "" : amount;
    const next = typed(from, key, money, limit);
    if (next === null || next === "over") return refuse(next === "over", by);
    if (scene === "choose") pick(inSlot?.id, by);
    onAmountChange(next);
    // A hand's click on a key is its press and release (data-sound); the keyboard and the ghost click at the key's pitch.
    if (by !== "pointer") sound("tick", { gain: by === "ghost" ? 0.75 : 0.6, pitch: key === "delete" ? 0.8 : pitchOf(key) });
  }

  function flash(key: PadKey) {
    clearTimeout(flashTimer.current);
    setDown(key);
    flashTimer.current = setTimeout(() => setDown(null), FLASH);
  }

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useImperativeHandle(ref, () => ({
    press(key) {
      if (key === "up" || key === "down") return move(at + (key === "down" ? 1 : -1), "ghost");
      if (key === "choose") return pick(inSlot?.id, "ghost");
      if (key === "back") return void back("ghost");
      if (key === "done") {
        const el = doneRef.current;
        el?.setAttribute("data-pressed", "");
        setTimeout(() => el?.removeAttribute("data-pressed"), FLASH);
        return void finish("ghost");
      }
      flash(key);
      typeKey(key, "ghost");
    },
    hold(isDown) {
      if (isDown) engine.current?.press("ghost");
      else engine.current?.release();
    },
    hover(id) {
      setLifted(id);
    },
    tap(id) {
      tapRow(
        contacts.findIndex((c) => c.id === id),
        "ghost",
      );
    },
  }));

  /* --- Keys and the field ---------------------------------------------------------- */

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === "ArrowDown" || k === "ArrowUp") move(at + (k === "ArrowDown" ? 1 : -1), "key");
    else if (k === "Home") move(0, "key");
    else if (k === "End") move(contacts.length - 1, "key");
    else if (k === "Enter" || k === " ") {
      if (!e.repeat) pick(inSlot?.id, "key");
    } else if (/^\d$/.test(k) || k === ".") {
      flash(k as PadKey);
      typeKey(k as PadKey, "key");
    } else if (k.length === 1 && k.toLowerCase() !== k.toUpperCase()) {
      // Type-ahead: the next contact whose name starts with the letter.
      const n = contacts.length;
      for (let s = 1; s <= n; s++) {
        const i = (at + s) % n;
        if (contacts[i].name.toLowerCase().startsWith(k.toLowerCase())) {
          move(i, "key");
          break;
        }
      }
    } else return;
    e.preventDefault();
  }

  /** A key on the keypad, the field or the list's digits: Enter held is SEND held. */
  function padKeyOf(k: string): PadKey | null {
    if (/^\d$/.test(k)) return k as PadKey;
    if (k === "." || k === money.decimal) return ".";
    if (k === "Backspace" || k === "Delete") return "delete";
    return null;
  }

  function onPadKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (e.key in moves) {
      e.preventDefault();
      const next = rove + moves[e.key];
      const blocked = next < 0 || next >= PAD.length || (Math.abs(moves[e.key]) === 1 && Math.floor(next / COLS) !== Math.floor(rove / COLS));
      if (blocked) return sound("bump", { gain: 0.5 });
      sound("tick", { gain: 0.45 });
      setRove(next);
      padRef.current?.querySelector<HTMLElement>(`[data-pad="${next}"]`)?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) engine.current?.press("key");
      return;
    }
    if (e.key === "Escape") {
      if (back("key") || finish("key")) e.preventDefault();
      return;
    }
    const key = padKeyOf(e.key);
    if (!key || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    flash(key);
    typeKey(key, "key");
  }

  // Typing in the field: figures go in by hand, through the same rules as the keypad.
  const beforeInput = useEffectEvent((e: InputEvent) => {
    if (e.inputType !== "insertText" || e.data == null || !e.cancelable) return;
    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const all = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0;
    if (all || e.data.length > 1) {
      const next = normalize((all ? "" : amount) + e.data, money);
      if (toMinor(next, money.minor) > limit) return refuse(true, "key");
      if (next !== amount) onAmountChange(next);
      return sound("tick", { gain: 0.6 });
    }
    const key = padKeyOf(e.data);
    if (!key) return refuse(false, "key");
    typeKey(key, "key");
  });
  useEffect(() => {
    const input = inputRef.current!;
    const before = (e: Event) => beforeInput(e as InputEvent);
    input.addEventListener("beforeinput", before);
    return () => input.removeEventListener("beforeinput", before);
  }, []);

  // Deletions and autofill: whatever arrives, as an amount.
  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const next = normalize(e.currentTarget.value, money);
    if (next === amount) return;
    if (toMinor(next, money.minor) > limit) return refuse(true, "key");
    if (next.length < amount.length) sound("tick", { gain: 0.5, pitch: 0.8 });
    onAmountChange(next);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const next = normalize(e.clipboardData.getData("text"), money);
    if (!next) return refuse(false, "key");
    if (toMinor(next, money.minor) > limit) return refuse(true, "key");
    onAmountChange(next);
    sound("tick", { gain: 0.6 });
  }

  function onFieldKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) engine.current?.press("key");
    } else if (e.key === "Escape" && back("key")) e.preventDefault();
  }

  // The caret stays at the end: figures are added and taken from the right. Select-all is kept, to type over.
  function onSelect(e: { currentTarget: HTMLInputElement }) {
    const el = e.currentTarget;
    const n = el.value.length;
    const all = el.selectionStart === 0 && el.selectionEnd === n;
    if (!all && (el.selectionStart !== n || el.selectionEnd !== n)) el.setSelectionRange(n, n);
  }

  const releaseHold = () => engine.current?.release();
  const releaseOn = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") releaseHold();
  };
  const viaKey = (e: MouseEvent) => (e.detail === 0 ? "key" : "pointer");

  /* --- Render ------------------------------------------------------------------------ */

  const figs = figuresOf(amount, money);
  const keptTo = kept ? contacts.find((c) => c.id === kept.payee) : null;
  const total = kept ? money.format(toMinor(kept.amount, money.minor) / 10 ** money.minor) : "";
  const symbol = <span className={amount ? "" : "text-muted"}>{money.symbol}</span>;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-scene={shown}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("@container/send w-full", className)}
    >
      <div className="grid gap-[0.6em] @[28rem]/send:grid-cols-[minmax(0,1fr)_auto] @[28rem]/send:gap-[0.7em]">
        {/* The screen: the site's own ground under glass, behind a bezel set into the plate. The bezel draws the field's and the list's focus ring. */}
        <div className="rounded-[1.05em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] outline-offset-2 has-[[data-ring]:focus-visible:not([data-quiet])]:outline-2 has-[[data-ring]:focus-visible:not([data-quiet])]:outline-(--focus) dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
          <div className="relative isolate flex animate-wake flex-col overflow-hidden rounded-[0.75em] bg-canvas text-ink [--row:2.3em] @[28rem]/send:[--row:2.6em]">
            {/* The strip: where you are, and what you have. */}
            <div className="flex h-[1.9em] shrink-0 items-center gap-[0.6em] px-[0.95em] shadow-[0_1px_0_var(--line)]">
              {shown === "amount" ? (
                <button
                  type="button"
                  aria-label="Back to recent"
                  onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
                  onClick={(e) => back(viaKey(e))}
                  className="-ml-[0.4em] flex h-[1.5em] items-center gap-[0.15em] rounded-[0.45em] pl-[0.2em] pr-[0.4em] text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)"
                >
                  <svg aria-hidden viewBox="0 0 16 16" className="size-[1em] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]">
                    <path d="M10 3.5 5.5 8l4.5 4.5" />
                  </svg>
                  <span className="text-[0.82em] leading-none">Recent</span>
                </button>
              ) : (
                <span className={cx(engraved, "text-[0.6em] text-(--device-label-quiet)")}>Recent</span>
              )}
              {balance !== undefined && (
                <span id={`${uid}-balance`} className="ml-auto truncate text-[0.78em] tabular-nums text-muted">
                  {money.format(balance)} available
                </span>
              )}
            </div>

            {/* The rows: the list, the bar fixed in the slot, and the amount under the slot. */}
            <div ref={windowRef} className="relative overflow-hidden [--roll:0]" style={{ height: `calc(${ROWS} * var(--row))` }}>
              <div
                ref={listRef}
                role="listbox"
                tabIndex={shown === "choose" ? 0 : -1}
                aria-label="Recent"
                aria-activedescendant={inSlot ? optionId(inSlot.id) : undefined}
                data-ring
                onKeyDown={onListKey}
                onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
                className={cx("absolute inset-0 outline-none!", shown !== "choose" && "invisible")}
              >
                <div className="absolute inset-x-0 top-0 [transform:translateY(calc(var(--roll)*var(--row)*-1))]">
                  {contacts.map((c, i) => (
                    <div
                      key={c.id}
                      id={optionId(c.id)}
                      role="option"
                      aria-selected={i === at}
                      data-lifted={lifted === c.id && i !== at ? "" : undefined}
                      onPointerEnter={(e) => e.pointerType === "mouse" && setLifted(c.id)}
                      onPointerLeave={() => setLifted((l) => (l === c.id ? null : l))}
                      onClick={() => tapRow(i, "pointer")}
                      className={cx(rowClass, "group/row cursor-default")}
                      style={{ top: `calc(${i} * var(--row))` }}
                    >
                      {/* A row a pointer rests on lifts off the screen; pressed, it gives. */}
                      <span
                        aria-hidden
                        className="absolute inset-x-[0.45em] inset-y-[0.12em] -z-10 rounded-[0.6em] bg-surface opacity-0 shadow-sm transition-[opacity,transform] duration-(--duration-exit) ease-out group-active/row:scale-[0.98] group-active/row:duration-75 group-data-lifted/row:-translate-y-px group-data-lifted/row:opacity-100 group-data-lifted/row:duration-(--duration-enter) group-data-tapped/row:scale-[0.98] group-data-tapped/row:opacity-100 group-data-tapped/row:duration-75"
                      />
                      <RowContent payee={c} />
                    </div>
                  ))}
                </div>
              </div>

              {/* The bar: the same rows in accent and white, clipped to the slot. In the amount shot it's the header. */}
              <div
                ref={overlayRef}
                aria-hidden
                className={cx("group/bar pointer-events-none absolute inset-0 text-accent-ink", (shown === "sent" || !contacts.length) && "invisible")}
                style={{ clipPath: "inset(0.12em 0.45em calc(100% - var(--row) + 0.12em) 0.45em round 0.6em)" }}
              >
                <div className="absolute inset-x-0 top-0 h-(--row) bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] transition-[filter] duration-(--duration-move) ease-out group-data-flash/bar:brightness-125 group-data-flash/bar:duration-0" />
                <div className="absolute inset-x-0 top-0 [transform:translateY(calc(var(--roll)*var(--row)*-1))]">
                  {contacts.map((c, i) => (
                    <div key={c.id} className={rowClass} style={{ top: `calc(${i} * var(--row))` }}>
                      <RowContent payee={c} bar />
                    </div>
                  ))}
                </div>
              </div>

              {/* The amount: drawn figures, and the one real field over them. */}
              <div className={cx("absolute inset-x-0 bottom-0 top-(--row) flex flex-col items-center justify-center gap-[0.2em] px-[0.95em]", shown !== "amount" && "invisible")}>
                <div className="relative w-full">
                  <div aria-hidden className="relative flex h-[1.2em] justify-center overflow-hidden text-[2.5em] font-light leading-[1.2] tracking-[-0.03em] tabular-nums @[28rem]/send:text-[2.7em]">
                    <div ref={rowRef} className="inline-flex whitespace-pre [--dx:0px] [--dy:0] [transform:translate(var(--dx),calc(var(--dy)*1em))]">
                      {money.before && symbol}
                      {amount ? (
                        figs.map((f) =>
                          f.i === null ? (
                            <span key={f.key}>{f.ch}</span>
                          ) : (
                            <span key={f.key} data-fig={f.i} className="inline-block [--y:0] [transform:translateY(calc(var(--y)*1.2em))]">
                              {f.ch}
                            </span>
                          ),
                        )
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                      {!money.before && <span className="ml-[0.2em]">{symbol}</span>}
                      <span className="ml-[0.05em] h-[0.95em] w-[0.06em] self-center animate-caret rounded-full bg-accent motion-reduce:animate-none" />
                    </div>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="transaction-amount"
                    enterKeyHint="send"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    name={name}
                    value={amount}
                    readOnly={sending}
                    tabIndex={shown === "amount" ? 0 : -1}
                    aria-label={chosen ? `Amount to ${chosen.name}` : "Amount"}
                    aria-describedby={balance === undefined ? undefined : `${uid}-balance`}
                    aria-busy={sending}
                    data-ring
                    onChange={onInput}
                    onPaste={onPaste}
                    onKeyDown={onFieldKey}
                    onKeyUp={releaseOn}
                    onSelect={onSelect}
                    // Text, caret and selection invisible (important: the page's own ::selection is unlayered). 16px keeps iOS from zooming in.
                    className="absolute inset-0 size-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent outline-none! selection:bg-transparent! selection:text-transparent! [-webkit-text-fill-color:transparent] autofill:[transition:background-color_600000s_0s]"
                  />
                </div>
                {reference && <p className="max-w-full truncate text-[0.85em] text-muted">For {reference}</p>}
                {/* Each figure's motion blur: vertical only, its deviation written by the frame loop. */}
                <svg aria-hidden className="absolute size-0">
                  <defs ref={defsRef}>
                    {Array.from({ length: MAX_FIGURES }, (_, i) => (
                      <filter key={i} id={`${uid}-blur-${i}`} x="-20%" y="-50%" width="140%" height="200%">
                        <feGaussianBlur data-blur stdDeviation="0 0" />
                      </filter>
                    ))}
                  </defs>
                </svg>
              </div>
            </div>

            {/* The receipt: the smash cut, the screen inverted. */}
            <div
              hidden={shown !== "sent"}
              onKeyDown={(e) => e.key === "Escape" && finish("key") && e.preventDefault()}
              className="absolute inset-0 z-10 flex flex-col bg-ink text-canvas"
            >
              <div className="flex h-[1.9em] shrink-0 items-center justify-between gap-[0.6em] px-[0.95em]">
                <span className="flex items-center gap-[0.35em] text-[0.88em] font-medium leading-none">
                  <svg aria-hidden viewBox="0 0 16 16" className="size-[1em] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]">
                    <path d="m3.5 8.5 3 3 6-7" />
                  </svg>
                  Sent
                </span>
                {kept?.when && <span className="text-[0.78em] tabular-nums text-canvas/70">{kept.when}</span>}
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.35em] px-[0.95em]">
                <p ref={totalRef} className="text-[2.9em] font-light leading-none tracking-[-0.035em] tabular-nums @[28rem]/send:text-[3.3em]">
                  {total}
                </p>
                <p className="max-w-full truncate text-[0.9em] text-canvas/70">
                  {keptTo ? `to ${keptTo.name}` : ""}
                  {keptTo && kept?.reference ? " · " : ""}
                  {kept?.reference}
                </p>
              </div>
              <div className="px-[0.5em] pb-[0.5em]">
                <button
                  ref={doneRef}
                  type="button"
                  tabIndex={shown === "sent" ? 0 : -1}
                  onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
                  // Enter still held from SEND repeats onto this key once focus follows the cut: a repeat isn't a press.
                  onKeyDown={(e) => e.repeat && (e.key === "Enter" || e.key === " ") && e.preventDefault()}
                  onClick={(e) => finish(viaKey(e))}
                  className="flex h-[2.2em] w-full items-center justify-center rounded-[0.55em] bg-canvas/10 text-[0.92em] font-medium transition-[background-color,transform] duration-(--duration-exit) ease-out hover:bg-canvas/15 active:scale-[0.97] data-pressed:scale-[0.97]"
                >
                  New payment
                </button>
              </div>
            </div>

            {/* Glass, and the backlight's bloom as the screen wakes. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] shadow-[inset_0_0_0_1px_var(--line)] [background:var(--screen-glass)]" />
            <div aria-hidden className="pointer-events-none absolute inset-0 z-20 animate-bloom [background:radial-gradient(50%_50%_at_50%_50%,var(--screen-glow),transparent)]" />
          </div>
        </div>

        {/* The keypad and SEND, in a well. */}
        <div className="flex flex-col gap-[0.32em] rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
          <div
            ref={padRef}
            role="group"
            aria-label="Keypad"
            onKeyDown={onPadKey}
            onKeyUp={(e) => {
              setDown(null);
              if (e.key === "Enter") releaseHold();
            }}
            className="grid grid-cols-3 gap-[0.32em] @[28rem]/send:grid-cols-[repeat(3,3.4em)]"
          >
            {PAD.map(({ key, name: keyName }, i) => (
              <button
                key={key}
                type="button"
                data-sound="key"
                data-pad={i}
                data-pressed={down === key || undefined}
                tabIndex={i === rove ? 0 : -1}
                aria-label={keyName}
                onFocus={() => setRove(i)}
                onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
                onClick={(e) => typeKey(key, e.detail === 0 ? "key" : "pointer")}
                className="group/key rounded-[0.65em] outline-offset-2"
              >
                <span className={cx("grid h-[2.1em] place-items-center", face, sink)}>
                  {key === "delete" ? (
                    <svg aria-hidden viewBox="0 0 20 14" className="h-[0.9em] w-auto fill-none stroke-current [filter:var(--device-engrave-glyph)]" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                      <path d="M6.2 1.5H17a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H6.2L1.5 7z" />
                      <path d="m9.5 4.8 4.4 4.4M13.9 4.8 9.5 9.2" />
                    </svg>
                  ) : (
                    <span className="text-[1.05em] font-medium leading-none tabular-nums [text-shadow:var(--device-engrave)]">{key === "." ? money.decimal : key}</span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* SEND: its lights glow orange when it's ready for a hand, and fire red one by one as it's held. */}
          <button
            ref={sendRef}
            type="button"
            data-pressed={held || undefined}
            data-ready={canSend || undefined}
            data-sending={sending || undefined}
            aria-disabled={!canSend}
            aria-describedby={`${uid}-hint`}
            tabIndex={canSend ? 0 : -1}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (canSend) focusQuietly(e.currentTarget);
              engine.current?.press("pointer");
            }}
            onPointerUp={releaseHold}
            onPointerLeave={releaseHold}
            onPointerCancel={releaseHold}
            onKeyDown={(e) => {
              if (e.key !== " " && e.key !== "Enter") return;
              e.preventDefault();
              if (!e.repeat) engine.current?.press("key");
            }}
            onKeyUp={releaseOn}
            onContextMenu={(e) => e.preventDefault()}
            className={cx("group/key block w-full touch-none rounded-[0.65em] outline-offset-2 [-webkit-touch-callout:none]", !canSend && "cursor-default")}
          >
            <span className={cx("relative flex h-[2.5em] flex-col items-center justify-center gap-[0.42em]", face, canSend && sink)}>
              <span aria-hidden className="flex gap-[0.2em]">
                {Array.from({ length: LIGHTS }, (_, i) => (
                  <span
                    key={i}
                    data-light
                    className="h-[0.22em] w-[0.6em] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) group-data-ready/key:bg-(--device-hold) group-data-ready/key:shadow-[0_0_0.4em_var(--device-hold)] group-data-ready/key:duration-0 group-data-sending/key:animate-pulse group-data-sending/key:bg-(--device-rec)! motion-reduce:animate-none data-on:bg-(--device-rec)! data-on:shadow-[0_0_0.45em_var(--device-rec)]! data-on:duration-0!"
                  />
                ))}
              </span>
              <span className="text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">Hold to send</span>
            </span>
          </button>
        </div>
      </div>

      <span id={`${uid}-hint`} className="sr-only">
        Press and hold to send
      </span>
      <div role="status" className="sr-only">
        <p key={said.n}>{said.words}</p>
      </div>
      <div role="status" className="sr-only">
        <p key={refused.n}>{refused.shot === said.n ? refused.words : ""}</p>
      </div>
    </div>
  );
}

/* --- Demo: paying the session players for their takes, and a ghost at the keys ---- */

const CONTACTS: Payee[] = [
  { id: "ade", name: "Ade", detail: "Drums" },
  { id: "kit", name: "Kit", detail: "Guitar" },
  { id: "zoe", name: "Zoe", detail: "Bass" },
  { id: "mia", name: "Mia", detail: "Keys" },
  { id: "omar", name: "Omar", detail: "Strings" },
  { id: "ines", name: "Ines", detail: "Vocals" },
];

/** The ghost's rounds: who, how much, for which take, and whether it taps the row or uses the keys. */
const ROUNDS: { payee: string; amount: string; take: string; by: "tap" | "keys" }[] = [
  { payee: "zoe", amount: "120", take: "take_04", by: "tap" },
  { payee: "kit", amount: "85.50", take: "take_05", by: "keys" },
  { payee: "mia", amount: "60", take: "take_06", by: "tap" },
];

const BALANCE = 124000; // pence: £1,240.00
const OPENS = 14 * 60 + 31; // minutes: the first payment goes at 14:32
const HOLD = 900; // ms
/** The gap between the ghost's figures: quick, a little uneven, like a thumb. */
const beat = () => 210 + Math.random() * 70;

export default function Demo() {
  const [contacts, setContacts] = useState(CONTACTS);
  const [payee, setPayee] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<SendReceipt | null>(null);
  const [pence, setPence] = useState(BALANCE);
  const [round, setRound] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const box = useRef<SendMoneyHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const order = useRef(contacts); // the list as the ghost will find it
  const clock = useRef(OPENS);
  const paid = useRef(0);
  const started = useRef(false);
  const live = useRef(false); // the ghost is at the keys
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back

  useLayoutEffect(() => {
    order.current = contacts;
  });

  function onSend(p: Payment) {
    clock.current += 1;
    paid.current += 1;
    const when = `${Math.floor(clock.current / 60)}:${String(clock.current % 60).padStart(2, "0")}`;
    setReceipt({ id: `pay-${paid.current}`, payee: p.payee.id, amount: p.amount, reference: ROUNDS[round].take, when });
    setPence((b) => b - p.minor);
    // The one just paid goes to the top of Recent.
    setContacts((cs) => [p.payee, ...cs.filter((c) => c.id !== p.payee.id)]);
  }

  function onDone() {
    setReceipt(null);
    setPayee(null);
    setAmount("");
    const next = (round + 1) % ROUNDS.length;
    setRound(next);
    // The reel starts over with the balance it began with.
    if (next === 0 && live.current) setPence(BALANCE);
  }

  /** One round of the ghost: pick the payee, type the amount, hold SEND, and leave the receipt for the next. */
  function perform(r: number) {
    const { payee: id, amount: figures, by } = ROUNDS[r];
    const at = order.current.findIndex((c) => c.id === id);
    let t = 0;
    const step = (wait: number, act: () => void) => {
      t += wait;
      timers.current.push(setTimeout(() => live.current && act(), t));
    };
    if (by === "tap") {
      step(200, () => box.current?.hover(id));
      step(480, () => {
        box.current?.hover(null);
        box.current?.tap(id);
      });
    } else {
      for (let i = 0; i < at; i++) step(i ? 300 : 350, () => box.current?.press("down"));
      step(380, () => box.current?.press("choose"));
    }
    [...figures].forEach((ch, i) => step(i === 0 ? (by === "tap" ? 620 : 500) : beat(), () => box.current?.press(ch as SendMoneyKey)));
    step(480, () => box.current?.hold(true));
    step(HOLD + 150, () => box.current?.hold(false));
    step(1550, () => box.current?.press("done"));
    step(380, () => perform((r + 1) % ROUNDS.length));
  }

  /** Any real input takes over from the ghost, for good. Whatever it was doing waits for the hand. */
  function takeOver() {
    touched.current = true;
    if (!live.current) return;
    live.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    box.current?.hover(null);
    box.current?.hold(false);
  }

  // On power-up the ghost starts paying at once, unless the host's tape is stopped: then it waits for PLAY.
  // Under reduced motion there is no ghost: one still frame, Zoe's amount typed and SEND lit for the hand.
  const powerUp = useEffectEvent(() => {
    if (started.current) return;
    if (reducedMotion()) {
      started.current = true;
      setPayee("zoe");
      setAmount("120");
      return;
    }
    if (hostTransport(rootRef.current) === "stop") return;
    started.current = true;
    if (touched.current) return;
    live.current = true;
    perform(0);
  });
  useEffect(() => {
    const root = rootRef.current;
    const id = setTimeout(powerUp, 0);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = timers;
    return () => {
      clearTimeout(id);
      observer.disconnect();
      pending.current.forEach(clearTimeout);
      live.current = false;
    };
  }, []);

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={takeOver}
      onKeyDownCapture={takeOver}
      onFocusCapture={takeOver}
      onWheelCapture={takeOver}
      // A mouse moving over the contacts lifts them: that's a hand too.
      onPointerMove={(e) => e.pointerType === "mouse" && (e.target as Element).closest("[role=option]") && takeOver()}
      className="@container w-full max-w-[540px] select-none"
    >
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[30rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
        <SendMoney
          ref={box}
          contacts={contacts}
          payee={payee}
          onPayeeChange={setPayee}
          amount={amount}
          onAmountChange={setAmount}
          onSend={onSend}
          receipt={receipt}
          onDone={onDone}
          reference={ROUNDS[round].take}
          balance={pence / 100}
        />
      </div>
    </div>
  );
}
