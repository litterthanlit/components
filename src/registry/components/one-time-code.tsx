"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A one-time code field after a device's LCD: a cell per figure, each a
 * seven-segment digit over the faint "8" of its unlit segments, and a keypad
 * of the player's keys.
 *
 * It is one real input, not six. The input lies over the cells with its text
 * and caret made invisible, so paste, SMS autofill (autocomplete
 * "one-time-code"), password managers, screen readers and native selection
 * all work as they do on any text field. The cells are drawn from the value
 * and the input's selection, followed through `selectionchange`. Typing goes
 * over the selection, or over the next figure once the field is full; a
 * pasted "482-913" or "482 913" lands as 482913. Where the browser offers
 * the Web OTP API, a code from an SMS fills the field by itself.
 *
 * The keypad types where the caret is, and never focuses the input, so a
 * phone's own keyboard stays down while it's in use. It's one tab stop:
 * arrows move, digits and Backspace work on it too.
 */

export type CodeStatus = "idle" | "pending" | "error" | "success";
export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "clear" | "back";

export type OneTimeCodeHandle = {
  /** Presses a keypad key: it sinks, clicks and types. A `ghost` press only sounds while the host's tape plays. */
  press: (key: KeypadKey, options?: { ghost?: boolean }) => void;
};

type OneTimeCodeProps = {
  /** Figures in the code. */
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Called once the last figure is in. */
  onComplete?: (code: string) => void;
  /** "pending" while the code is checked: the field is read-only and the figures dim. */
  status?: CodeStatus;
  label: string;
  /** Printed beside the label: where the code was sent. */
  hint?: string;
  /** Shown and announced for "error" and "success". */
  message?: string;
  keypad?: boolean;
  /** Ask the browser for the code from an SMS (Web OTP), where it can. */
  webOtp?: boolean;
  ref?: Ref<OneTimeCodeHandle>;
  className?: string;
};

/* --- Seven segments ------------------------------------------------------ */

/* A figure in viewBox units: segment centre lines, thickness and a slight italic slant. */
const T = 6.6;
const GAP = 1;
const X = [5.5, 31];
const Y = [5, 33, 61];
const SLANT = 0.09;
const VIEW = { w: 43, h: 66 };

/** A point on the figure, slanted, rounded so the server and the browser agree. */
const pt = (x: number, y: number) => `${(x + (Y[2] + T / 2 - y) * SLANT).toFixed(2)},${y.toFixed(2)}`;
const across = (y: number, a: number, b: number) =>
  [pt(a, y), pt(a + T / 2, y - T / 2), pt(b - T / 2, y - T / 2), pt(b, y), pt(b - T / 2, y + T / 2), pt(a + T / 2, y + T / 2)].join(" ");
const down = (x: number, a: number, b: number) =>
  [pt(x, a), pt(x + T / 2, a + T / 2), pt(x + T / 2, b - T / 2), pt(x, b), pt(x - T / 2, b - T / 2), pt(x - T / 2, a + T / 2)].join(" ");

const SEGMENTS = {
  a: across(Y[0], X[0] + GAP, X[1] - GAP),
  b: down(X[1], Y[0] + GAP, Y[1] - GAP),
  c: down(X[1], Y[1] + GAP, Y[2] - GAP),
  d: across(Y[2], X[0] + GAP, X[1] - GAP),
  e: down(X[0], Y[1] + GAP, Y[2] - GAP),
  f: down(X[0], Y[0] + GAP, Y[1] - GAP),
  g: across(Y[1], X[0] + GAP, X[1] - GAP),
};
type Segment = keyof typeof SEGMENTS;
const ORDER = Object.keys(SEGMENTS) as Segment[];

const FIGURES: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

/* --- Keypad -------------------------------------------------------------- */

const KEYS: { key: KeypadKey; letters?: string; name: string }[] = [
  { key: "1", name: "1" },
  { key: "2", letters: "ABC", name: "2" },
  { key: "3", letters: "DEF", name: "3" },
  { key: "4", letters: "GHI", name: "4" },
  { key: "5", letters: "JKL", name: "5" },
  { key: "6", letters: "MNO", name: "6" },
  { key: "7", letters: "PQRS", name: "7" },
  { key: "8", letters: "TUV", name: "8" },
  { key: "9", letters: "WXYZ", name: "9" },
  { key: "clear", name: "Clear" },
  { key: "0", name: "0" },
  { key: "back", name: "Delete" },
];
const COLS = 3;
const FLASH = 110; // ms a key stays down when pressed by a ghost or the keyboard

/** Each figure clicks at its own pitch, a little higher up the pad. */
const pitchOf = (key: string) => 0.9 + (key === "0" ? 10 : Number(key) || 0) * 0.018;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.14em] [text-shadow:var(--device-engrave)]";

const SHAKE: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-0.32em)" },
  { transform: "translateX(0.26em)" },
  { transform: "translateX(-0.18em)" },
  { transform: "translateX(0.1em)" },
  { transform: "translateX(0)" },
];

export function OneTimeCode({
  length = 6,
  value,
  onChange,
  onComplete,
  status = "idle",
  label,
  hint,
  message,
  keypad = true,
  webOtp = true,
  ref,
  className = "",
}: OneTimeCodeProps) {
  const ids = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellsRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false); // a hand has worked it: its own sounds may play while the host is paused
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [sel, setSel] = useState({ start: value.length, end: value.length }); // the input's selection, kept after it blurs
  const [engaged, setEngaged] = useState(false); // focus is in the field or on its keypad
  const [down, setDown] = useState<KeypadKey | null>(null);
  const [rove, setRove] = useState(0); // the keypad's tab stop
  const [selfTest, setSelfTest] = useState(true); // every segment lit, as the display powers up

  const code = value.replace(/\D/g, "").slice(0, length);
  const start = Math.min(sel.start, code.length);
  const end = Math.min(sel.end, code.length);
  const locked = status === "pending";

  /* --- Editing ------------------------------------------------------------ */

  function commit(next: string, caret: number) {
    setSel({ start: caret, end: caret });
    if (next === code) return;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  }

  /** Digits over the selection, or over the next figure once the field is full. A whole code replaces the field. */
  function insert(text: string, from: number, to: number) {
    const digits = text.replace(/\D/g, "");
    if (!digits || locked) return false;
    if (digits.length >= length) {
      commit(digits.slice(0, length), length);
      return true;
    }
    let a = Math.min(from, code.length);
    let b = Math.min(to, code.length);
    if (a === b && code.length >= length) {
      if (a >= length) return false;
      b = Math.min(length, a + digits.length);
    }
    const next = (code.slice(0, a) + digits + code.slice(b)).slice(0, length);
    a = Math.min(next.length, a + digits.length);
    commit(next, a);
    return true;
  }

  function erase(from: number, to: number) {
    if (locked) return false;
    if (from === to) {
      if (from === 0) return false;
      from -= 1;
    }
    commit(code.slice(0, from) + code.slice(to), from);
    return true;
  }

  /** The keypad, whoever presses it. True if the key did something. */
  function press(key: KeypadKey, { ghost = false } = {}) {
    if (ghost) flash(key);
    let done: boolean;
    if (key === "clear") {
      done = !locked && code.length > 0;
      if (done) commit("", 0);
    } else if (key === "back") done = erase(start, end);
    else done = insert(key, start, end);
    if (ghost && hostTransport(rootRef.current) !== "play") return done;
    if (!done) play("bump", { gain: 0.6 });
    else if (ghost) play("tick", { gain: 0.75, pitch: pitchOf(key) });
    return done;
  }

  function flash(key: KeypadKey) {
    clearTimeout(flashTimer.current);
    setDown(key);
    flashTimer.current = setTimeout(() => setDown(null), FLASH);
  }

  useImperativeHandle(ref, () => ({ press }));

  /* --- The input ---------------------------------------------------------- */

  // Typing: digits go in by hand, so a full field can be typed over. Anything else is left to the browser.
  const beforeInput = useEffectEvent((e: InputEvent) => {
    if (e.inputType !== "insertText" || e.data == null || !e.cancelable) return;
    const input = e.target as HTMLInputElement;
    e.preventDefault();
    const ok = insert(e.data, input.selectionStart ?? code.length, input.selectionEnd ?? code.length);
    play(ok ? "tick" : "bump", { gain: 0.6, pitch: ok ? pitchOf(e.data.slice(-1)) : 1 });
  });
  const selectionChanged = useEffectEvent(() => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    const a = input.selectionStart ?? 0;
    const b = input.selectionEnd ?? 0;
    setSel((s) => (s.start === a && s.end === b ? s : { start: a, end: b }));
  });
  useEffect(() => {
    const input = inputRef.current!;
    const before = (e: Event) => beforeInput(e as InputEvent);
    const select = () => selectionChanged();
    input.addEventListener("beforeinput", before);
    input.addEventListener("select", select);
    document.addEventListener("selectionchange", select);
    return () => {
      input.removeEventListener("beforeinput", before);
      input.removeEventListener("select", select);
      document.removeEventListener("selectionchange", select);
    };
  }, []);

  // After an edit the browser puts the caret at the end; put it back where the edit left it.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || document.activeElement !== input) return;
    if (input.selectionStart !== start || input.selectionEnd !== end) input.setSelectionRange(start, end);
  }, [code, start, end]);

  // Deletions, autofill and drops: whatever arrives, keep its digits.
  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const raw = input.value;
    const next = raw.replace(/\D/g, "").slice(0, length);
    const caret = Math.min(next.length, raw.slice(0, input.selectionStart ?? raw.length).replace(/\D/g, "").length);
    if (next.length < code.length) play("tick", { gain: 0.5, pitch: 0.8 });
    commit(next, caret);
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const input = e.currentTarget;
    const ok = insert(e.clipboardData.getData("text"), input.selectionStart ?? code.length, input.selectionEnd ?? code.length);
    play(ok ? "tick" : "bump", { gain: 0.6 });
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const a = input.selectionStart ?? 0;
    const collapsed = a === input.selectionEnd;
    if (e.key === "Backspace" && collapsed && a === 0) play("bump", { gain: 0.6 });
    else if (e.key === "ArrowLeft" && collapsed && !e.shiftKey) play(a === 0 ? "bump" : "tick", { gain: 0.45 });
    else if (e.key === "ArrowRight" && collapsed && !e.shiftKey) play(a >= code.length ? "bump" : "tick", { gain: 0.45 });
  }

  // A click lands on the cell under it: a filled one is selected, to be typed over.
  function onClick(e: MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    if (e.detail > 1 || input.selectionStart !== input.selectionEnd) return;
    const cells = [...cellsRef.current!.querySelectorAll<HTMLElement>("[data-cell]")];
    const i = cells.findIndex((c) => e.clientX < c.getBoundingClientRect().right);
    const at = Math.min(i === -1 ? length : i, code.length);
    input.setSelectionRange(at, at < code.length ? at + 1 : at);
  }

  // Web OTP: where the browser can read the code from an SMS, it fills the field. Silent anywhere else.
  const received = useEffectEvent((otp: string) => {
    if (insert(otp, 0, length)) play("tick", { gain: 0.6 });
  });
  useEffect(() => {
    if (!webOtp || !("OTPCredential" in window) || !navigator.credentials) return;
    const abort = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: abort.signal } as CredentialRequestOptions)
      .then((credential) => {
        const otp = (credential as { code?: string } | null)?.code;
        if (otp) received(otp);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [webOtp]);

  /* --- Status ------------------------------------------------------------- */

  // The display powers up with every segment lit.
  useEffect(() => {
    const id = setTimeout(() => setSelfTest(false), reducedMotion() ? 0 : 480);
    return () => {
      clearTimeout(id);
      clearTimeout(flashTimer.current);
    };
  }, []);

  // A verdict: wrong shakes the cells with a bump, right lights them with the centre button's chime.
  useEffect(() => {
    if (status !== "error" && status !== "success") return;
    if (touched.current || hostTransport(rootRef.current) === "play") play(status === "error" ? "bump" : "select", { gain: status === "error" ? 0.9 : 0.6 });
    if (status === "error" && !reducedMotion()) cellsRef.current?.animate(SHAKE, { duration: 380, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" });
  }, [status]);

  /* --- Keypad ------------------------------------------------------------- */

  function onKeypadKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = rove;
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    if (e.key in moves) {
      e.preventDefault();
      const next = i + moves[e.key];
      const blocked = next < 0 || next >= KEYS.length || (Math.abs(moves[e.key]) === 1 && Math.floor(next / COLS) !== Math.floor(i / COLS));
      if (blocked) return play("bump", { gain: 0.5 });
      play("tick", { gain: 0.45 });
      setRove(next);
      rootRef.current?.querySelector<HTMLElement>(`[data-key-index="${next}"]`)?.focus();
      return;
    }
    const key: KeypadKey | null = /^\d$/.test(e.key) ? (e.key as KeypadKey) : e.key === "Backspace" ? "back" : e.key === "Escape" || e.key === "Delete" ? "clear" : null;
    if (!key || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    flash(key);
    if (press(key) && key !== "back" && key !== "clear") play("tick", { gain: 0.6, pitch: pitchOf(key) });
  }

  /* --- Render ------------------------------------------------------------- */

  const half = length >= 6 && length % 2 === 0 ? length / 2 : -1; // a dash between the halves: 482–913
  const cursor = !locked && start === end && start < length && (engaged || (code.length > 0 && code.length < length)) ? start : -1;
  const said = status === "error" ? (message ?? "That code didn't work") : status === "success" ? (message ?? "Verified") : status === "pending" ? "Checking" : "";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={`${ids}-label`}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEngaged(false);
      }}
      className={cx("w-full", className)}
    >
      <div className="flex items-center justify-between gap-[0.8em]">
        <label id={`${ids}-label`} htmlFor={`${ids}-input`} data-part="lettering" className={cx(engraved, "truncate text-[0.6em] text-(--device-label)")}>
          {label}
        </label>
        <span id={`${ids}-status`} className="flex min-w-0 items-center gap-[0.4em]">
          <span
            aria-hidden
            data-part="light"
            className={cx(
              "size-[0.42em] shrink-0 rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)",
              // Drawn, a lit light is a dot of ink and an unlit one the part's own hairline ring; only the error stays red.
              status === "error"
                ? "bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)] drawn:bg-(--device-rec)!"
                : status === "success"
                  ? "bg-(--device-meter-on) drawn:bg-(--device-draw-ink)!"
                  : status === "pending"
                    ? "animate-pulse bg-(--device-hold) shadow-[0_0_0.45em_var(--device-hold)] motion-reduce:animate-none drawn:bg-(--device-draw-ink)!"
                    : "bg-(--device-meter-off)",
            )}
          />
          <span
            key={said || hint}
            data-part="lettering"
            className={cx(
              engraved,
              "animate-enter truncate text-[0.6em] tabular-nums tracking-[0.1em]",
              status === "error" ? "text-(--device-rec) [text-shadow:none] drawn:text-(--device-rec)!" : status === "idle" ? "text-(--device-label-quiet)" : "text-(--device-label)",
            )}
          >
            {said || hint}
          </span>
        </span>
      </div>

      {/* The cells, behind a black bezel set into the body, with the one real input laid over them. */}
      <div data-part="bezel" className="mt-[0.55em] overflow-hidden rounded-[0.8em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] outline-offset-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-(--focus) dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
        <div ref={cellsRef} className="relative flex items-center gap-[0.22em]">
          {Array.from({ length }, (_, i) => {
            const char = selfTest ? "8" : (code[i] ?? "");
            const lit = FIGURES[char] ?? "";
            const selected = engaged && start !== end && i >= start && i < end;
            return (
              <div key={i} className="contents">
                {i === half && <span aria-hidden className="h-[0.16em] w-[0.4em] shrink-0 rounded-full bg-white/20 drawn:bg-(--device-draw-ink)!" />}
                <div
                  data-cell
                  data-part="lcd"
                  data-selected={selected || undefined}
                  data-caret={i === cursor || undefined}
                  aria-hidden
                  className={cx(
                    "relative grid h-[3.9em] min-w-0 flex-1 place-items-center overflow-hidden rounded-[0.5em] [background:var(--device-lcd)] shadow-(--device-lcd-edge) transition-colors duration-(--duration-exit)",
                    status === "error" ? "text-(--device-rec) drawn:text-(--device-rec)!" : status === "success" ? "text-[#141415]" : "text-(--device-lcd-ink)",
                  )}
                  style={{ transitionDelay: status === "success" ? `${i * 55}ms` : undefined }}
                >
                  {/* The backlight: on when the code is accepted, sweeping across. Drawn, a frame of ink inside the cell. */}
                  <span
                    className={cx(
                      "absolute inset-0 bg-[linear-gradient(160deg,#ffffff,#e9e9e7)] transition-opacity duration-(--duration-enter) drawn:inset-[0.22em]! drawn:rounded-[0.3em]! drawn:shadow-[inset_0_0_0_1px_var(--device-draw-ink)]!",
                      status === "success" ? "opacity-100" : "opacity-0",
                    )}
                    style={{ transitionDelay: status === "success" ? `${i * 55}ms` : undefined }}
                  />
                  {/* Selected figures, and the figure the caret sits on. */}
                  <span className={cx("absolute inset-0 bg-white/[0.16] transition-opacity duration-75", selected ? "opacity-100" : "opacity-0")} />
                  {i === cursor && char !== "" && <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.55)]" />}
                  <svg
                    viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
                    className={cx(
                      "relative h-[70%] w-auto transition-opacity duration-(--duration-enter) drawn:filter-none!",
                      status === "pending" && "opacity-50",
                      status === "success" ? "" : status === "error" ? "[filter:drop-shadow(0_0_0.22em_rgb(229_72_77/0.55))]" : "[filter:drop-shadow(0_0_0.2em_rgb(255_255_255/0.3))]",
                    )}
                  >
                    {ORDER.map((s) => (
                      <polygon
                        key={s}
                        points={SEGMENTS[s]}
                        className={cx(
                          // Like a real LCD, a segment comes on at once and fades as it goes off.
                          "fill-current transition-opacity",
                          // Drawn, a lit segment is filled in ink and an unlit one only outlined, so the faint 8 stays whole.
                          lit.includes(s)
                            ? "opacity-100 duration-0"
                            : cx("duration-150 drawn:fill-none! drawn:stroke-(--device-draw-line)! drawn:opacity-100! drawn:[vector-effect:non-scaling-stroke]", status === "success" ? "opacity-[0.07]" : "opacity-[0.1]"),
                        )}
                      />
                    ))}
                    {i === cursor && char === "" && <polygon points={SEGMENTS.d} className="animate-caret fill-current motion-reduce:animate-none" />}
                  </svg>
                </div>
              </div>
            );
          })}
          <input
            ref={inputRef}
            id={`${ids}-input`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={length}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            value={code}
            readOnly={locked}
            aria-invalid={status === "error"}
            aria-busy={status === "pending"}
            aria-describedby={`${ids}-status`}
            onChange={onInput}
            onPaste={onPaste}
            onKeyDown={onInputKey}
            onClick={onClick}
            // The text, caret and selection are invisible (important: the page's own ::selection is unlayered). 16px keeps iOS from zooming in.
            className="absolute inset-0 z-10 size-full cursor-text bg-transparent text-[16px] text-transparent caret-transparent outline-none selection:bg-transparent! selection:text-transparent! [-webkit-text-fill-color:transparent] autofill:[transition:background-color_600000s_0s]"
          />
        </div>
      </div>

      {/* The keypad: it types where the caret is. */}
      {keypad && (
        <div
          role="group"
          aria-label="Keypad"
          onKeyDown={onKeypadKey}
          onKeyUp={() => setDown(null)}
          data-part="well"
          className="mt-[0.65em] grid grid-cols-3 gap-[0.36em] rounded-[0.95em] bg-(--device-well) p-[0.42em] shadow-(--device-recess)"
        >
          {KEYS.map(({ key, letters, name }, i) => (
            <button
              key={key}
              type="button"
              data-sound="key"
              data-key-index={i}
              data-pressed={down === key || undefined}
              tabIndex={i === rove ? 0 : -1}
              aria-label={name}
              onFocus={() => setRove(i)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                focusQuietly(e.currentTarget);
              }}
              onClick={() => press(key)}
              data-part="key"
              className="group/key h-[2.45em] rounded-[0.6em] outline-offset-2"
            >
              <span className="relative flex h-full flex-col items-center justify-center gap-[0.18em] rounded-[0.6em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
                {key === "back" ? (
                  <svg aria-hidden data-part="lettering" viewBox="0 0 20 14" className="h-[0.95em] w-auto fill-none stroke-current [filter:var(--device-engrave-glyph)] drawn:filter-none!" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                    <path d="M6.2 1.5H17a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H6.2L1.5 7z" />
                    <path d="m9.5 4.8 4.4 4.4M13.9 4.8 9.5 9.2" />
                  </svg>
                ) : key === "clear" ? (
                  <span data-part="lettering" className="text-[0.62em] font-semibold uppercase leading-none tracking-[0.1em] [text-shadow:var(--device-engrave)]">Clear</span>
                ) : (
                  <>
                    <span data-part="lettering" className="text-[1.05em] font-medium leading-none tabular-nums [text-shadow:var(--device-engrave)]">{key}</span>
                    <span data-part="lettering" className="h-[0.42em] text-[0.42em] font-semibold leading-none tracking-[0.16em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)] drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_80%,transparent)]!">
                      {letters}
                    </span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <p role="status" className="sr-only">
        {status === "success" || status === "pending" ? said : ""}
      </p>
      <p role="alert" className="sr-only">
        {status === "error" ? said : ""}
      </p>
    </div>
  );
}

/* --- Demo: a sign-in's second step, typed by a ghost ------------------------ */

type Round = { sent: string; slip?: string };

/** Codes as the SMS sends them; on the second round the ghost swaps two figures, then fixes them. */
const ROUNDS: Round[] = [{ sent: "482913" }, { sent: "730516", slip: "730561" }, { sent: "159260" }, { sent: "604871", slip: "604817" }];
const VERIFY = 520; // ms the server takes to check a code
const START = 650; // ms before the ghost's first press: after the display's self-test

/** The gap between a ghost's presses: quick, uneven, like a thumb reading a code off a message. */
const beat = () => 150 + Math.random() * 90;
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export default function Demo() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<CodeStatus>("idle");
  const [round, setRound] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const otp = useRef<OneTimeCodeHandle>(null);
  const ghost = useRef(true); // the ghost has the keypad until a hand arrives
  const edits = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const sent = ROUNDS[round % ROUNDS.length].sent;

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
  const stopGhost = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /** The ghost presses keys one after another, from `at` ms. Returns when its last press lands. */
  function type(keys: string[], at: number) {
    let t = at;
    for (const key of keys) {
      later(t, () => otp.current?.press(key as KeypadKey, { ghost: true }));
      t += beat();
    }
    return t;
  }

  /** One round: type the code (or a slip of it), and leave the rest to the verdict. */
  function playRound(r: number, at: number) {
    if (!ghost.current || hostTransport(rootRef.current) === "stop") return;
    const { sent, slip } = ROUNDS[r % ROUNDS.length];
    type([...(slip ?? sent)], at);
  }

  // The verdict: right lights the cells, wrong shakes them. The ghost then clears, or fixes its slip.
  function verify(code: string) {
    setStatus("pending");
    const r = round;
    later(VERIFY, () => {
      const ok = code === sent;
      setStatus(ok ? "success" : "error");
      if (!ghost.current) {
        // The viewer's own code: once it's in, a new one is sent, unless they've edited the field since.
        const at = edits.current;
        if (ok)
          later(2200, () => {
            if (edits.current !== at) return;
            setValue("");
            setStatus("idle");
            setRound(r + 1);
          });
        return;
      }
      if (ok) {
        later(1500, () => otp.current?.press("clear", { ghost: true }));
        later(1500 + 380, () => {
          setRound(r + 1);
          playRound(r + 1, 360);
        });
      } else {
        // Two back, and the last two figures again.
        const t = type(["back", "back"], 900);
        type([...sent.slice(4)], t + 140);
      }
    });
  }

  function onChange(next: string) {
    edits.current += 1;
    setValue(next);
    if (status === "error" || status === "success") setStatus("idle");
  }

  // Power up: the ghost starts typing after the self-test. Under reduced motion there is no ghost.
  const powerUp = useEffectEvent(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) ghost.current = false;
    else playRound(0, START);
  });
  useEffect(() => {
    const pending = timers;
    powerUp();
    return () => pending.current.forEach(clearTimeout);
  }, []);

  // A hand on it ends the rehearsal: the field clears for the viewer's own code.
  function takeOver() {
    if (!ghost.current) return;
    ghost.current = false;
    stopGhost();
    setValue("");
    setStatus("idle");
  }

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={takeOver}
      onKeyDownCapture={takeOver}
      onFocusCapture={takeOver}
      className="@container w-full max-w-[300px] select-none"
    >
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4.4cqw,13.5px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
        <OneTimeCode
          ref={otp}
          label="Verification code"
          hint={`SMS · ${spaced(sent)}`}
          message={status === "error" ? "Wrong code" : undefined}
          value={value}
          status={status}
          onChange={onChange}
          onComplete={verify}
        />
      </div>
    </div>
  );
}
