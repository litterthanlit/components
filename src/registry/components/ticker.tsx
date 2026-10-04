"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { hostTransport, play } from "@/lib/sound";

/*
 * Notifications on a dot-matrix strip, after a recorder's status line: a
 * long LCD behind a black bezel, a tone light, and a white chip that counts
 * the queue.
 *
 * Text is set in the page's own typeface (read with getComputedStyle), drawn
 * into a small offscreen canvas a dot per pixel, at the matrix's height, and
 * thresholded into dots, so any characters work. The dots are drawn round on
 * a canvas sized for the screen's pixel ratio: lit ones in the LCD's ink with
 * a faint glow, unlit ones as ghosts. Colours come from the CSS variables and
 * follow the theme.
 *
 * A message that fits types on, column by column, and dwells. One that's
 * wider than the display scrolls at a constant speed in px/s, holding at its
 * start and its end. Hovering or focusing the strip pauses it; arrows step
 * through the queue. The canvas only redraws when a column changes, and its
 * loop stops while it's idle, paused or off-screen. Under reduced motion
 * nothing scrolls: a long message pages through, a screenful at a time.
 *
 * Screen readers hear each message once, from a polite status region; the
 * canvas is hidden from them.
 */

export type Tone = "info" | "warn" | "alert";
export type TickerMessage = { id: number; text: string; tone: Tone };

type Queue = { messages: TickerMessage[]; index: number; waiting: boolean };

/**
 * The queue behind a Ticker: `push` adds a message (shown at once if the
 * display is idle, queued if it's busy), and the display advances through
 * the queue by itself as each message finishes.
 */
export function useTicker({ limit = 9 }: { limit?: number } = {}) {
  const [queue, setQueue] = useState<Queue>({ messages: [], index: -1, waiting: false });
  const nextId = useRef(0);

  function push(text: string, { tone = "info" }: { tone?: Tone } = {}) {
    nextId.current += 1;
    const message = { id: nextId.current, text, tone };
    setQueue((q) => {
      const all = [...q.messages, message];
      const drop = Math.max(0, all.length - limit);
      const messages = all.slice(drop);
      // Idle, or the last message has had its turn: show this one now.
      if (q.index === -1 || q.waiting) return { messages, index: messages.length - 1, waiting: false };
      return { messages, index: Math.max(0, q.index - drop), waiting: false };
    });
    return message.id;
  }

  /** The display is done with message `id`: on to the next, or wait for one. */
  function finished(id: number) {
    setQueue((q) => {
      if (q.messages[q.index]?.id !== id) return q;
      return q.index < q.messages.length - 1 ? { ...q, index: q.index + 1 } : { ...q, waiting: true };
    });
  }

  function go(index: number) {
    setQueue((q) => (q.messages.length ? { ...q, index: Math.min(q.messages.length - 1, Math.max(0, index)), waiting: false } : q));
  }

  function clear() {
    setQueue({ messages: [], index: -1, waiting: false });
  }

  return {
    messages: queue.messages,
    index: queue.index,
    current: queue.messages[queue.index] ?? null,
    /** The last message has finished and nothing is queued. */
    waiting: queue.waiting,
    push,
    finished,
    go,
    clear,
  };
}

export type TickerController = ReturnType<typeof useTicker>;

/* --- The matrix ------------------------------------------------------------ */

const ROWS = 12;
const CAP = 7.5; // rows a capital stands
const BASELINE = 9; // rows from the top to the baseline: room above for accents, three below for descenders
const PITCH = 0.22; // em from one dot to the next
const THRESHOLD = 0.5; // coverage that lights a dot
const TYPE_RATE = 150; // columns a second while typing on
const DWELL = 2000; // ms a message that fits stays, plus a little per character
const HOLD = 1000; // ms a scrolling message holds at its start and its end
const PAGE = 2400; // ms per screenful under reduced motion
const SPACE = 3; // dark columns a space adds to the one between glyphs

type Bitmap = {
  cols: number;
  /** Column-major: bits[col * ROWS + row]. */
  bits: Uint8Array;
  /** Each word's columns, for paging. */
  words: [number, number][];
};

/** Graphemes, so an accent or an emoji stays one glyph. */
function graphemes(text: string) {
  if (typeof Intl.Segmenter === "function") return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return Array.from(text);
}

type Glyph = { cols: number; bits: Uint8Array };

/** Glyphs already set, by font and grapheme. Cleared once the page's fonts have loaded. */
const glyphs = new Map<string, Glyph | null>();
let pen: CanvasRenderingContext2D | null = null;

/**
 * One grapheme in `font`, a dot per pixel, trimmed to the columns it lights.
 * A pixel lights when the glyph covers most of it. Null for blank glyphs.
 */
function glyph(g: string, font: string): Glyph | null {
  const key = `${font}\u0000${g}`;
  const hit = glyphs.get(key);
  if (hit !== undefined) return hit;
  pen ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const canvas = pen.canvas;
  pen.font = font;
  const m = pen.measureText(g);
  const width = Math.max(4, Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 4);
  canvas.width = width;
  canvas.height = ROWS;
  pen.font = font;
  pen.fillStyle = "#fff";
  pen.textBaseline = "alphabetic";
  pen.fillText(g, 2 + m.actualBoundingBoxLeft, BASELINE);
  const { data } = pen.getImageData(0, 0, width, ROWS);
  let first = width;
  let last = -1;
  const lit = (c: number, r: number) => data[(r * width + c) * 4 + 3] > THRESHOLD * 255;
  for (let c = 0; c < width; c++)
    for (let r = 0; r < ROWS; r++)
      if (lit(c, r)) {
        first = Math.min(first, c);
        last = Math.max(last, c);
      }
  let out: Glyph | null = null;
  if (last >= 0) {
    const cols = last - first + 1;
    const bits = new Uint8Array(cols * ROWS);
    for (let c = 0; c < cols; c++) for (let r = 0; r < ROWS; r++) bits[c * ROWS + r] = lit(first + c, r) ? 1 : 0;
    out = { cols, bits };
  }
  glyphs.set(key, out);
  return out;
}

/**
 * Sets text in the page's typeface, CAP dots to a capital: each glyph
 * trimmed to its lit columns and set one dark column after the last, as a
 * matrix display spaces its characters.
 */
function rasterize(text: string, family: string, weight: string): Bitmap {
  pen ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  pen.font = `${weight} 100px ${family}`;
  const cap = pen.measureText("H").actualBoundingBoxAscent / 100 || 0.7;
  const font = `${weight} ${(CAP / cap).toFixed(3)}px ${family}`;

  const parts: (Glyph | number)[] = []; // glyphs, and the blank columns between words
  const words: [number, number][] = [];
  let x = 0;
  let word = -1;
  for (const g of graphemes(text)) {
    const set = /\s/.test(g) ? null : glyph(g, font);
    if (!set) {
      if (word >= 0) words.push([word, x - 2]);
      word = -1;
      parts.push(SPACE);
      x += SPACE;
      continue;
    }
    if (word < 0) word = x;
    parts.push(set);
    x += set.cols + 1;
  }
  if (word >= 0) words.push([word, x - 2]);

  const cols = Math.max(1, x - 1);
  const bits = new Uint8Array(cols * ROWS);
  let at = 0;
  for (const part of parts) {
    if (typeof part === "number") {
      at += part;
      continue;
    }
    bits.set(part.bits, at * ROWS);
    at += part.cols + 1;
  }
  return { cols, bits, words };
}

/** Screenfuls of whole words, for reduced motion; a word too long for one is cut. */
function paginate({ cols, words }: Bitmap, width: number): [number, number][] {
  const pages: [number, number][] = [];
  let start = -1;
  let end = 0;
  for (const [a, b] of words) {
    if (start >= 0 && b - start + 1 <= width) {
      end = b + 1;
      continue;
    }
    if (start >= 0) pages.push([start, end]);
    start = a;
    while (b - start + 1 > width) {
      pages.push([start, start + width]);
      start += width;
    }
    end = b + 1;
  }
  if (start >= 0) pages.push([start, end]);
  return pages.length ? pages : [[0, cols]];
}

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const TONES: Record<Tone, { name: string; light: string; said: string }> = {
  info: { name: "Info", light: "bg-(--device-lcd-ink) shadow-[0_0_0.5em_rgb(255_255_255/0.7)]", said: "" },
  warn: { name: "Warn", light: "bg-(--device-hold) shadow-[0_0_0.5em_var(--device-hold)]", said: "Warning: " },
  alert: { name: "Alert", light: "animate-pulse bg-(--device-rec) shadow-[0_0_0.5em_var(--device-rec)] motion-reduce:animate-none", said: "Alert: " },
};

type TickerProps = {
  controller: TickerController;
  label?: string;
  /** Scrolling speed, in CSS px per second. */
  speed?: number;
  className?: string;
};

type Engine = { show: (m: TickerMessage | null) => void; hold: (reason: string, on: boolean) => void };

export function Ticker({ controller, label = "Notifications", speed = 72, className = "" }: TickerProps) {
  const ids = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const speedRef = useRef(speed);
  const [hand, setHand] = useState({ hover: false, focus: false });
  const { messages, index, current } = controller;

  useLayoutEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Each message is announced once, when it first reaches the display, whichever order that happens in.
  const [heard, setHeard] = useState<{ ids: number[]; message: TickerMessage | null }>({ ids: [], message: null });
  if (current && !heard.ids.includes(current.id)) setHeard({ ids: [...heard.ids.slice(-63), current.id], message: current });

  const finished = useEffectEvent((id: number) => controller.finished(id));

  // The display: one loop draws the strip, and only while a column is changing.
  useLayoutEffect(() => {
    const strip = stripRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const ghosts = document.createElement("canvas");

    let w = 0;
    let h = 0;
    let dpr = 1;
    let pitch = 1;
    let cols = 0;
    let ink = "#f5f5f5";
    let family = "sans-serif";
    let weight = "500";

    let message: TickerMessage | null = null;
    let bmp: Bitmap | null = null;
    let phase: "idle" | "type" | "dwell" | "start" | "scroll" | "end" | "rest" | "page" = "idle";
    let offset = -1; // the bitmap column under the first screen column; -1 leaves a margin
    let limit = Infinity; // bitmap columns from here on stay dark (the next page's)
    let reveal = Infinity; // screen columns typed on so far
    let pages: [number, number][] = [];
    let page = 0;
    let acc = 0;

    const holds = new Set<string>();
    let raf = 0;
    let last = 0;
    let timer = 0;
    let timerFn: (() => void) | null = null;
    let timerLeft = 0;
    let timerAt = 0;

    /* Timers that stop while the display is held. */
    const arm = () => {
      timerAt = performance.now();
      timer = window.setTimeout(() => {
        const fn = timerFn;
        timerFn = null;
        fn?.();
      }, timerLeft);
    };
    const wait = (ms: number, fn: () => void) => {
      clearTimeout(timer);
      timerFn = fn;
      timerLeft = ms;
      if (!holds.size) arm();
    };

    const fits = () => !!bmp && bmp.cols + 2 <= cols;

    function measure() {
      const box = strip.getBoundingClientRect();
      dpr = Math.min(3, window.devicePixelRatio || 1);
      w = box.width;
      h = box.height;
      pitch = h / ROWS;
      cols = Math.max(1, Math.floor(w / pitch));
      canvas.width = ghosts.width = Math.round(w * dpr);
      canvas.height = ghosts.height = Math.round(h * dpr);
      if (bmp && phase === "page") pages = paginate(bmp, cols - 2);
      if (bmp && (phase === "scroll" || phase === "end")) offset = Math.min(offset, Math.max(-1, bmp.cols + 1 - cols));
    }

    function colours() {
      const style = getComputedStyle(strip);
      ink = style.getPropertyValue("--device-lcd-ink").trim() || "#f5f5f5";
      family = style.fontFamily;
      weight = style.fontWeight;
    }

    const x0 = () => (w - cols * pitch) / 2 + pitch / 2;

    function paintGhosts() {
      const g = ghosts.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.globalAlpha = 0.08;
      g.fillStyle = ink;
      g.beginPath();
      const r = pitch * 0.36;
      for (let c = 0; c < cols; c++)
        for (let row = 0; row < ROWS; row++) {
          const x = x0() + c * pitch;
          const y = pitch / 2 + row * pitch;
          g.moveTo(x + r, y);
          g.arc(x, y, r, 0, Math.PI * 2);
        }
      g.fill();
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(ghosts, 0, 0);
      if (!bmp) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = pitch * 0.36;
      const lit = new Path2D();
      const end = Math.min(bmp.cols, limit);
      for (let c = 0; c < cols && c < reveal; c++) {
        const col = offset + c;
        if (col < 0 || col >= end) continue;
        const x = x0() + c * pitch;
        for (let row = 0; row < ROWS; row++) {
          if (!bmp.bits[col * ROWS + row]) continue;
          const y = pitch / 2 + row * pitch;
          lit.moveTo(x + r, y);
          lit.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = ink;
      // The glow, then the dots themselves on top of it.
      ctx.globalAlpha = 0.55;
      ctx.shadowColor = ink;
      ctx.shadowBlur = pitch * dpr * 1.6;
      ctx.fill(lit);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fill(lit);
      // The write head: the column being typed on, faintly lit.
      if (phase === "type" && reveal < cols) {
        const x = x0() + Math.floor(reveal) * pitch;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        for (let row = 0; row < ROWS; row++) {
          const y = pitch / 2 + row * pitch;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function frame(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      raf = 0;
      if (!bmp) return;
      if (phase === "type") {
        const before = Math.floor(reveal);
        const span = Math.min(cols, bmp.cols + 2);
        reveal = Math.min(span, reveal + TYPE_RATE * dt);
        if (Math.floor(reveal) !== before) draw();
        if (reveal >= span) {
          reveal = Infinity;
          draw();
          typed();
          return;
        }
      } else if (phase === "scroll") {
        const end = bmp.cols + 1 - cols;
        acc += (speedRef.current * dt) / pitch;
        let moved = false;
        while (acc >= 1 && offset < end) {
          offset++;
          acc -= 1;
          moved = true;
        }
        if (moved) draw();
        if (offset >= end) {
          phase = "end";
          wait(HOLD, done);
          return;
        }
      } else return;
      run();
    }

    function run() {
      if (raf || holds.size) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function typed() {
      if (fits()) {
        phase = "dwell";
        wait(DWELL + (message?.text.length ?? 0) * 40, done);
      } else {
        phase = "start";
        wait(HOLD, () => {
          phase = "scroll";
          acc = 0;
          run();
        });
      }
    }

    function done() {
      const id = message?.id;
      const scrolled = !fits();
      phase = "rest";
      if (id !== undefined) finished(id);
      // Nothing after it: a long message comes back to its start and rests there.
      if (scrolled) {
        wait(HOLD, () => {
          offset = -1;
          draw();
        });
      }
    }

    function showPage() {
      const [a, b] = pages[page];
      offset = a - 1;
      limit = b;
      draw();
      wait(PAGE, () => {
        if (page < pages.length - 1) {
          page++;
          showPage();
        } else {
          phase = "rest";
          if (message) finished(message.id);
          // Back to the first screenful.
          if (pages.length > 1)
            wait(PAGE, () => {
              page = 0;
              showPage();
            });
        }
      });
    }

    function show(m: TickerMessage | null) {
      clearTimeout(timer);
      timerFn = null;
      cancelAnimationFrame(raf);
      raf = 0;
      message = m;
      bmp = m ? rasterize(m.text, family, weight) : null;
      offset = -1;
      limit = Infinity;
      reveal = Infinity;
      acc = 0;
      if (!bmp) {
        phase = "idle";
        draw();
      } else if (reducedMotion()) {
        phase = "page";
        pages = paginate(bmp, cols - 2);
        page = 0;
        showPage();
      } else {
        phase = "type";
        reveal = 0;
        draw();
        run();
      }
    }

    function hold(reason: string, on: boolean) {
      const was = holds.size > 0;
      if (on) holds.add(reason);
      else holds.delete(reason);
      const now = holds.size > 0;
      if (now === was) return;
      if (now) {
        cancelAnimationFrame(raf);
        raf = 0;
        if (timerFn) {
          clearTimeout(timer);
          timerLeft = Math.max(0, timerLeft - (performance.now() - timerAt));
        }
      } else {
        if (timerFn) arm();
        run();
      }
    }

    engine.current = { show, hold };
    colours();
    measure();
    paintGhosts();
    draw();

    // Size: the matrix keeps its pitch in em, so a wider strip shows more columns.
    const resize = new ResizeObserver(() => {
      measure();
      paintGhosts();
      draw();
    });
    resize.observe(strip);

    // Off-screen, nothing moves.
    const seen = new IntersectionObserver(([entry]) => hold("offscreen", !entry.isIntersecting));
    seen.observe(strip);

    // Theme: read the colours again and redraw.
    const retheme = () => {
      colours();
      paintGhosts();
      draw();
    };
    const theme = new MutationObserver(retheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", retheme);

    // Once the typeface has loaded, set the message again in it.
    let live = true;
    document.fonts?.ready.then(() => {
      if (!live) return;
      glyphs.clear();
      if (!message) return;
      colours();
      const fresh = rasterize(message.text, family, weight);
      if (bmp && fresh.cols === bmp.cols && fresh.bits.every((b, i) => b === bmp!.bits[i])) return;
      bmp = fresh;
      draw();
    });

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      resize.disconnect();
      seen.disconnect();
      theme.disconnect();
      scheme.removeEventListener("change", retheme);
      engine.current = null;
    };
  }, []);

  // A different message on the display.
  const shown = current?.id;
  const showCurrent = useEffectEvent(() => engine.current?.show(current));
  useEffect(() => {
    showCurrent();
  }, [shown]);

  // A hand on the strip holds it.
  useEffect(() => {
    engine.current?.hold("hand", hand.hover || hand.focus);
  }, [hand]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: messages.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (!messages.length || to < 0 || to >= messages.length || to === index) return play("bump", { gain: 0.6 });
    play("tick", { gain: 0.6 });
    controller.go(to);
  }

  const tone = current ? TONES[current.tone] : null;
  const held = hand.hover || hand.focus;

  return (
    <div className={cx("rounded-[0.9em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]", className)}>
      <div className="relative overflow-hidden rounded-[0.65em] px-[0.6em] pb-[0.6em] pt-[0.55em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)">
        <div aria-hidden className="flex items-center gap-[0.45em]">
          <span className={cx("size-[0.5em] shrink-0 rounded-full transition-[background-color,box-shadow] duration-(--duration-exit)", tone ? tone.light : "bg-white/15")} />
          <span key={current?.id} className="animate-enter text-[0.58em] font-semibold uppercase leading-none tracking-[0.14em] text-(--device-lcd-dim)">
            {tone ? tone.name : "Idle"}
          </span>
          {held && current && (
            <svg viewBox="0 0 8 8" className="size-[0.5em] fill-(--device-lcd-dim)">
              <path d="M1.2 1h1.9v6H1.2zM4.9 1h1.9v6H4.9z" />
            </svg>
          )}
          <span className="ml-auto inline-flex items-center rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
            <span className="text-[0.58em] font-semibold uppercase leading-none tabular-nums tracking-[0.02em]">
              Msg {messages.length ? `${index + 1}/${messages.length}` : "—"}
            </span>
          </span>
        </div>

        {/* The matrix. */}
        <div
          ref={stripRef}
          role="group"
          tabIndex={0}
          aria-label={label}
          aria-describedby={`${ids}-now ${ids}-hint`}
          onKeyDown={onKeyDown}
          onPointerEnter={(e: PointerEvent) => e.pointerType === "mouse" && setHand((h) => ({ ...h, hover: true }))}
          onPointerLeave={() => setHand((h) => ({ ...h, hover: false }))}
          onFocus={() => setHand((h) => ({ ...h, focus: true }))}
          onBlur={() => setHand((h) => ({ ...h, focus: false }))}
          onPointerDown={(e) => e.button === 0 && e.currentTarget.focus({ preventScroll: true, focusVisible: false } as FocusOptions)}
          className="relative mt-[0.45em] rounded-[0.2em] font-semibold outline-offset-4"
          style={{ height: `${ROWS * PITCH}em` }}
        >
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
        </div>
        {/* Glass. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:var(--screen-glass)]" />
      </div>

      <p id={`${ids}-now`} className="sr-only">
        {current ? `Message ${index + 1} of ${messages.length}: ${current.text}` : "No messages"}
      </p>
      <p id={`${ids}-hint`} className="sr-only">
        Hover or focus to pause. Left and right arrows step through the messages.
      </p>
      <div role="status" aria-live="polite" className="sr-only">
        {heard.message && (
          <p key={heard.message.id}>
            {TONES[heard.message.tone].said}
            {heard.message.text}
          </p>
        )}
      </div>
    </div>
  );
}

/* --- Demo: a recorder's status line ---------------------------------------- */

const ARRIVALS: { text: string; tone: Tone }[] = [
  { text: "EXPORT DONE · take_04.wav", tone: "info" },
  { text: "SYNCED 3 TAKES", tone: "info" },
  { text: "LOW BATTERY 12%", tone: "warn" },
  { text: "CARD FULL — FREE 2.1 GB TO KEEP RECORDING", tone: "alert" },
];
/** What Notify sends, in turn. */
const SAMPLES: { text: string; tone: Tone }[] = [
  { text: "TAKE 05 ARMED", tone: "info" },
  { text: "Zoë left 2 notes on take_04", tone: "info" },
  { text: "MIC 2 CLIPPING −0.3 dB", tone: "alert" },
  { text: "BACKUP DONE", tone: "info" },
  { text: "PHANTOM POWER ON INPUT 2", tone: "warn" },
  ...ARRIVALS,
];
const GAP = 2600; // ms between arrivals while untouched

type KeyId = "prev" | "next" | "notify" | "clear";
const KEYS: { id: KeyId; name: string; label?: string; glyph?: string }[] = [
  { id: "prev", name: "Previous message", glyph: "M9.5 3.5 5 8l4.5 4.5" },
  { id: "next", name: "Next message", glyph: "M6.5 3.5 11 8l-4.5 4.5" },
  { id: "notify", name: "Notify", label: "Notify" },
  { id: "clear", name: "Clear", label: "Clear" },
];

export default function Demo() {
  const ticker = useTicker();
  const rootRef = useRef<HTMLDivElement>(null);
  const auto = useRef(true); // messages arrive by themselves until a hand arrives
  const sample = useRef(0);

  function arrive(m: { text: string; tone: Tone }, byItself: boolean) {
    ticker.push(m.text, { tone: m.tone });
    if (!byItself || hostTransport(rootRef.current) === "play") play("open", { gain: 0.45, pitch: m.tone === "alert" ? 1.12 : m.tone === "warn" ? 1.05 : 1 });
  }

  // Untouched, the recorder reports in: four messages, a moment apart; once they've all shown, it starts over.
  const arriveNext = useEffectEvent((i: number) => arrive(ARRIVALS[i], true));
  const allShown = useEffectEvent(() => ticker.waiting);
  const restart = useEffectEvent(() => ticker.clear());
  useEffect(() => {
    const root = rootRef.current;
    if (hostTransport(root) === "stop") return;
    if (reducedMotion()) {
      const id = setTimeout(() => ARRIVALS.forEach((_, i) => arriveNext(i)), 300);
      return () => clearTimeout(id);
    }
    let i = 0;
    let id = 0;
    const step = () => {
      if (!auto.current) return;
      if (i < ARRIVALS.length) {
        arriveNext(i++);
        id = window.setTimeout(step, GAP);
      } else if (!allShown()) id = window.setTimeout(step, 400);
      else
        id = window.setTimeout(() => {
          if (!auto.current) return;
          restart();
          i = 0;
          id = window.setTimeout(step, 900);
        }, 2600);
    };
    id = window.setTimeout(step, 300);
    return () => clearTimeout(id);
  }, []);

  function notify() {
    const m = SAMPLES[sample.current % SAMPLES.length];
    sample.current += 1;
    arrive(m, false);
  }

  function clear() {
    if (!ticker.messages.length) return play("bump", { gain: 0.6 });
    ticker.clear();
    play("close", { gain: 0.5 });
  }

  function step(delta: number) {
    const to = ticker.index + delta;
    if (to < 0 || to >= ticker.messages.length) return play("bump", { gain: 0.6 });
    ticker.go(to);
  }

  function onKey(id: KeyId) {
    if (id === "prev") step(-1);
    else if (id === "next") step(1);
    else if (id === "notify") notify();
    else clear();
  }

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={() => (auto.current = false)}
      onKeyDownCapture={() => (auto.current = false)}
      className="@container w-full max-w-[440px] select-none"
    >
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4.4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <Ticker controller={ticker} />

        <div className="mt-[0.8em] flex items-center gap-[0.45em]">
          {KEYS.map((k) => (
            <button
              key={k.id}
              type="button"
              data-sound="key"
              aria-label={k.label ? undefined : k.name}
              onPointerDown={(e) => e.button === 0 && e.currentTarget.focus({ preventScroll: true, focusVisible: false } as FocusOptions)}
              onClick={() => onKey(k.id)}
              className={cx("group/key rounded-[0.7em] outline-offset-2", k.label ? "flex-1" : "w-[2.6em] shrink-0")}
            >
              <span className="grid h-[2.5em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
                {k.glyph ? (
                  <svg aria-hidden viewBox="0 0 16 16" className="size-[1.1em] fill-none stroke-current [filter:var(--device-engrave-glyph)]" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={k.glyph} />
                  </svg>
                ) : (
                  <span className="text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">{k.label}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
