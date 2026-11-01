"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A file browser with Quick Look, as one of the player's own screens: a
 * path along the top, the files in a list with the player's accent bar for
 * the selection, and a footer of tiny keys beside an LCD. Space slides a
 * preview of the selected file in from the right.
 *
 * One spring drives the bar and the previews. It runs in rows: the bar's
 * clip reads `--bar × --row`, and the previews stand in a column inside the
 * pane, each one pane-height below the last, translated by `-(--bar)`. So
 * as the bar glides down a row, the next file's preview rises into the pane
 * at exactly the same speed, and stopping halfway between two files shows
 * half of each. Only the previews within two files of the selection are
 * rendered; a long jump cuts the spring to a row and a half short and
 * glides the rest, as the bar does, so the column never shows a gap.
 *
 * The pane rides a second spring (`springs.snappy`) as `--open`, 0 to 1.
 * It clips itself from the left and slides its contents with the clip's
 * edge, so it never leaves its own box: the anatomy can take it apart open
 * or shut. The bar's clip draws in from the right with the pane's edge, and
 * the files' lengths fade out under it. A file with a `duration` plays
 * while it's previewed: a frame loop writes how far through it is as `--t`
 * (0 to 1) on the pane, for the preview to draw a playhead, and the time
 * straight into the LCD.
 *
 * Focus is the list (a listbox pointing at the selected option). ↑ ↓, Page
 * Up and Down, Home and End move; Space or → opens the preview and Space or
 * ← closes it; Enter opens the file; Escape closes the preview, then lets go
 * of the keyboard. The pointer selects what it moves over and clicks.
 */

export type FileItem = {
  id: string;
  name: string;
  /** A small glyph before the name. */
  icon?: ReactNode;
  /** A quiet detail at the right edge: a take's length and date. Fades out under the preview. */
  meta?: string;
  /** Seconds. A file with one plays while it's previewed. */
  duration?: number;
};

/** What the LCD shows instead of the count: "Loaded" "take_1202.wav". */
export type FileStatus = { text: string; detail?: string };

export type FileBrowserKey = "up" | "down" | "pageUp" | "pageDown" | "home" | "end" | "space" | "right" | "left" | "enter" | "escape";

export type FileBrowserHandle = {
  /** Presses a key as the keyboard would (its key in the footer goes down too). */
  press: (key: FileBrowserKey) => void;
};

type FileBrowserProps<T extends FileItem> = {
  items: T[];
  /** The selected file's id. */
  value: string | null;
  onChange: (id: string) => void;
  /** Whether the preview is open. */
  previewing: boolean;
  onPreviewChange: (open: boolean) => void;
  /** The selected file, large. It can read `--t`, 0 to 1, for how far a file with a duration has played. */
  renderPreview: (item: T) => ReactNode;
  /** Enter, or a double click. */
  onOpen?: (item: T) => void;
  /** The folders down to this one, outermost first: ["Library", "Session 12"]. */
  path?: string[];
  /** Shown on the LCD in place of the count, e.g. what just opened. */
  status?: FileStatus | null;
  /** The browser's accessible name. */
  label?: string;
  /** What a file is called, for the count: "take" gives "48 takes". */
  noun?: string;
  /** Rows the list shows. */
  rows?: number;
  ref?: Ref<FileBrowserHandle>;
  className?: string;
};

const ROW = 2.5; // em: every row is one height, so a row's place is its index times this
const OVERSCAN = 3; // rows rendered past each edge of the view
const CHUNK = 4; // the rendered window moves this many rows at a time, so scrolling rarely re-renders
const NEAR = 2; // previews rendered either side of the selection: enough for the spring's longest glide (1.5 rows)
const PANE = "56%"; // of the list's width, at the preview's widest

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A detent's pitch, varied a little so repeated ticks never sound identical. */
const detent = () => 0.97 + Math.random() * 0.06;
/** 0:04 */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** 2400 → "2,400", the same on the server and in every locale. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Drawn, what the site quietens with a muted colour is a lower opacity of the ink instead. */
const dim = "drawn:opacity-60!";

/* --- Parts ------------------------------------------------------------------ */

function FolderGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[1.1em] shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]">
      <path d="M2 4.5v8.25h12V6H8L6.5 4H2.5" />
    </svg>
  );
}

/** One row's contents. Drawn twice: in ink, and in white on the bar. */
function RowContent({ item, bar }: { item: FileItem; bar?: boolean }) {
  return (
    <>
      <span className={cx("grid size-[1.15em] shrink-0 place-items-center [&>svg]:size-full", bar ? "text-accent-ink" : cx("text-muted", dim))}>{item.icon}</span>
      <span className={cx("min-w-0 flex-1 truncate text-[1.06em] tracking-[-0.01em]", bar ? "text-accent-ink" : "text-ink")}>{item.name}</span>
      {item.meta && (
        // Under the preview the lengths go first, so a name keeps the room it has left.
        <span className={cx("shrink-0 text-[0.8em] tabular-nums [opacity:calc(1-var(--open,0)*2.5)]", bar ? "text-accent-ink/80" : cx("text-muted", dim))}>{item.meta}</span>
      )}
    </>
  );
}

const KEYS: Record<string, FileBrowserKey> = {
  ArrowDown: "down",
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowLeft: "left",
  PageDown: "pageDown",
  PageUp: "pageUp",
  Home: "home",
  End: "end",
  " ": "space",
  Enter: "enter",
  Escape: "escape",
};

/** The scroll thumb, written straight to CSS variables on the list's frame as it scrolls. */
function paintThumb(list: HTMLElement) {
  const range = list.scrollHeight - list.clientHeight;
  const frame = list.parentElement!;
  frame.style.setProperty("--sp", range > 0 ? (list.scrollTop / range).toFixed(4) : "0");
  frame.style.setProperty("--sv", Math.min(1, list.clientHeight / list.scrollHeight).toFixed(4));
  frame.toggleAttribute("data-scrolls", range > 1);
}

const rowClass = "absolute inset-x-0 flex h-(--row) items-center gap-[0.7em] pl-[1.05em] pr-[1.15em]";
/** The bar's clip: the overlay cut down to row `--bar`, a little in from the screen's edge and in from the right by the open pane. */
const barClip = `inset(calc(var(--bar, 0) * var(--row) + 0.08em) calc(0.45em + var(--open, 0) * ${PANE}) calc(100% - (var(--bar, 0) + 1) * var(--row) + 0.08em) 0.45em round 0.6em)`;
const thumb = "max(1.4em, calc(var(--sv, 1) * 100%))";
/** The pane's left edge, from its right side (0 shut) to its left (1 open). Clamped, so the spring's overshoot never pulls it past its box. */
const edge = "clamp(0%, calc((1 - var(--open, 0)) * 100%), 100%)";
/** A row's place: its index times the row height, worked out by CSS. */
const place = (row: number): CSSProperties => ({ top: `calc(${row} * var(--row))` });

/* --- The browser ------------------------------------------------------------- */

export function FileBrowser<T extends FileItem>({
  items,
  value,
  onChange,
  previewing,
  onPreviewChange,
  renderPreview,
  onOpen,
  path = [],
  status,
  label = "Files",
  noun = "file",
  rows = 6,
  ref,
  className,
}: FileBrowserProps<T>) {
  const ids = useId();
  const listId = `${ids}-list`;
  const optionId = (item: T) => `${ids}-${item.id}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const bar = useRef<Spring | null>(null);
  const open = useRef<Spring | null>(null);
  const placed = useRef(false); // the bar has a place: the next move glides
  const follow = useRef(false); // the last move came from a key: scroll it into view
  const rowPx = useRef(0);
  const pointer = useRef({ x: -1, y: -1 });
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused

  const total = items.length;
  const found = items.findIndex((item) => item.id === value);
  const current = total ? Math.max(0, found) : -1;
  const selected = current >= 0 ? items[current] : null;
  const playing = previewing && !!selected?.duration;

  // The rendered window: rows from `start`, `span` of them. The view sets both.
  const [view, setView] = useState({ start: 0, span: rows + 2 * OVERSCAN + CHUNK, rows });

  /** Sounds follow the host's tape (see hostTransport): aloud while it plays, or once a hand is on the browser. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }

  // Both springs write to the root, where the bar, the rows, the pane and its previews all read them.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const b = createSpring(0, springs.snappy, (v) => root.style.setProperty("--bar", v.toFixed(4)));
    const o = createSpring(0, springs.snappy, (v) => root.style.setProperty("--open", v.toFixed(4)));
    bar.current = b;
    open.current = o;
    return () => {
      b.stop();
      o.stop();
    };
  }, []);

  // The view's size: how many rows fit, and how tall one is in pixels for reading the scroll position.
  useLayoutEffect(() => {
    const list = listRef.current!;
    const observer = new ResizeObserver(() => {
      rowPx.current = parseFloat(getComputedStyle(list).fontSize) * ROW;
      const fit = Math.max(1, Math.round(list.clientHeight / rowPx.current));
      setView((v) => (v.rows === fit ? v : { ...v, rows: fit, span: fit + 2 * OVERSCAN + CHUNK }));
      paintThumb(list);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // The pane slides in or out on its spring.
  useLayoutEffect(() => {
    const o = open.current!;
    if (reducedMotion()) o.jump(previewing ? 1 : 0);
    else o.set(previewing ? 1 : 0);
  }, [previewing]);

  // The bar glides to the selected row, and the previews with it. A long jump (End, Page Down)
  // cuts to just short of it and glides the rest, so it still arrives from the right side.
  useLayoutEffect(() => {
    const s = bar.current!;
    if (current < 0) return;
    const calm = reducedMotion();
    if (!placed.current || calm) s.jump(current);
    else {
      if (Math.abs(current - s.value) > 1.5) s.jump(current + (current > s.value ? -1.5 : 1.5));
      s.set(current);
    }
    placed.current = true;

    // Keys keep a row of context above and below the selection; the pointer never scrolls.
    if (!follow.current) return;
    follow.current = false;
    const list = listRef.current!;
    const row = list.querySelector<HTMLElement>(`[data-row="${current}"]`);
    if (!row) return;
    const top = row.offsetTop - row.offsetHeight;
    const bottom = row.offsetTop + row.offsetHeight * 2;
    let next = list.scrollTop;
    if (top < next) next = Math.max(0, top);
    else if (bottom > next + list.clientHeight) next = bottom - list.clientHeight;
    if (next === list.scrollTop) return;
    const near = Math.abs(next - list.scrollTop) < list.clientHeight * 1.5;
    list.scrollTo({ top: next, behavior: near && !calm ? "smooth" : "auto" });
  }, [current]);

  // The previewed file plays from the top: `--t` on the pane and the time on the LCD, written each frame.
  useEffect(() => {
    const pane = paneRef.current!;
    const time = timeRef.current;
    pane.style.setProperty("--t", "0");
    if (!playing || !selected?.duration) return;
    const length = selected.duration;
    const from = performance.now();
    let raf = 0;
    let shown = -1;
    const frame = (now: number) => {
      const s = Math.min(length, (now - from) / 1000);
      pane.style.setProperty("--t", (s / length).toFixed(5));
      // The LCD changes once a second, not every frame.
      if (time && Math.floor(s) !== shown) {
        shown = Math.floor(s);
        time.textContent = clock(s);
      }
      if (s < length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, selected?.id, selected?.duration]);

  function onScroll() {
    const list = listRef.current!;
    paintThumb(list);
    if (!rowPx.current) return;
    const first = Math.floor(list.scrollTop / rowPx.current);
    const start = Math.max(0, Math.floor((first - OVERSCAN) / CHUNK) * CHUNK);
    setView((v) => (v.start === start ? v : { ...v, start }));
  }

  /* --- Moves ------------------------------------------------------------- */

  function moveTo(next: number, by: "key" | "pointer") {
    if (!total) return by === "key" && sound("bump", { gain: 0.6 });
    const to = clamp(next, 0, total - 1);
    if (to === current) return by === "key" && sound("bump", { gain: 0.6 });
    follow.current = by === "key";
    sound("tick", { gain: by === "pointer" ? 0.4 : 0.75, pitch: detent() });
    onChange(items[to].id);
  }

  function setPreview(next: boolean) {
    if (next === previewing || !selected) return sound("bump", { gain: 0.6 });
    sound(next ? "open" : "close", { gain: 0.7 });
    onPreviewChange(next);
  }

  function openFile() {
    if (!selected) return sound("bump", { gain: 0.6 });
    sound("select");
    // The bar lights up as it's pressed.
    const overlay = overlayRef.current!;
    overlay.setAttribute("data-flash", "");
    setTimeout(() => overlay.removeAttribute("data-flash"), 160);
    onOpen?.(selected);
  }

  function press(key: FileBrowserKey) {
    const page = Math.max(1, view.rows - 1);
    if (key === "down") moveTo(current + 1, "key");
    else if (key === "up") moveTo(current - 1, "key");
    else if (key === "pageDown") moveTo(current + page, "key");
    else if (key === "pageUp") moveTo(current - page, "key");
    else if (key === "home") moveTo(0, "key");
    else if (key === "end") moveTo(total - 1, "key");
    else if (key === "space") setPreview(!previewing);
    else if (key === "right") setPreview(true);
    else if (key === "left") setPreview(false);
    else if (key === "enter") openFile();
    else if (previewing) setPreview(false);
    else listRef.current?.blur();
  }

  /** Shows a key in the footer held down, or let up. */
  function hold(key: FileBrowserKey, down: boolean) {
    const cap = key === "pageDown" ? "down" : key === "pageUp" ? "up" : key;
    rootRef.current?.querySelector(`[data-cap="${cap}"]`)?.toggleAttribute("data-pressed", down);
  }

  useImperativeHandle(ref, () => ({
    press(key) {
      hold(key, true);
      setTimeout(() => hold(key, false), 140);
      press(key);
    },
  }));

  /* --- Input --------------------------------------------------------------- */

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const key = e.metaKey || e.altKey || e.ctrlKey ? undefined : KEYS[e.key];
    if (!key) return;
    // Escape with nothing to close lets go: left unhandled, so a host (the player) can take the keyboard back.
    if (key === "escape" && !previewing) return e.currentTarget.blur();
    e.preventDefault();
    if ((key === "enter" || key === "space") && e.repeat) return;
    hold(key, true);
    press(key);
  }

  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    const key = KEYS[e.key];
    if (key) hold(key, false);
  }

  /** The hand on the browser: focus goes to the list, quietly, so the keys always land there. */
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.pointerType === "touch") return;
    focusQuietly(listRef.current);
  }

  function onHover(e: PointerEvent<HTMLDivElement>, i: number) {
    if (e.pointerType !== "mouse") return;
    // Only a pointer that moves: rows scrolling under a resting one don't steal the selection.
    if (e.clientX === pointer.current.x && e.clientY === pointer.current.y) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    touched.current = true;
    if (i !== current) moveTo(i, "pointer");
  }

  /* --- Render --------------------------------------------------------------- */

  // The window, plus the selected row wherever it is, so aria-activedescendant always resolves.
  const end = Math.min(total, view.start + view.span);
  const shown: number[] = [];
  for (let i = view.start; i < end; i++) shown.push(i);
  if (current >= 0 && (current < view.start || current >= end)) shown.push(current);
  const near: number[] = [];
  for (let i = Math.max(0, current - NEAR); i <= Math.min(total - 1, current + NEAR); i++) near.push(i);

  const count = `${thousands(total)} ${total === 1 ? noun : `${noun}s`}`;
  const lcd = status ?? (playing ? null : { text: previewing ? "Preview" : count });

  return (
    <div className={cx("@container w-full", className)}>
      <div
        ref={rootRef}
        onPointerDownCapture={() => (touched.current = true)}
        onKeyDownCapture={() => (touched.current = true)}
        onPointerDown={onPointerDown}
        data-part="bezel"
        className="relative rounded-[1.5em] bg-(--device-rim) p-[0.4em] text-[clamp(11px,4.1cqw,14px)] [box-shadow:var(--device-rim-edge),0_1px_2px_rgb(0_0_0/0.12),0_18px_36px_-18px_rgb(0_0_0/0.4)]"
      >
        {/* The screen: the player's own ground under glass. */}
        <div data-part="screen" className="relative isolate flex animate-wake flex-col overflow-hidden rounded-[1.1em] bg-canvas text-ink" style={{ "--row": `${ROW}em` } as CSSProperties}>
          {/* Where the files are: the folders down to this one, the last in ink. */}
          <nav aria-label="Path" className="flex h-[2.6em] min-w-0 items-center gap-[0.45em] px-[1.05em] text-muted shadow-[0_1px_0_var(--line)] drawn:border-b">
            <FolderGlyph />
            <ol className="flex min-w-0 items-center gap-[0.45em] text-[0.92em] tracking-[-0.01em]">
              {path.map((folder, i) => (
                <li key={i} className={cx("flex min-w-0 items-center gap-[0.45em]", i < path.length - 1 ? "shrink-[2]" : "shrink")}>
                  {i > 0 && (
                    <span aria-hidden className={cx("text-subtle", dim)}>
                      /
                    </span>
                  )}
                  <span aria-current={i === path.length - 1 ? "location" : undefined} className={cx("truncate", i === path.length - 1 ? "text-ink" : dim)}>
                    {folder}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          {/* The files, and the preview over them. */}
          <div className="relative" style={{ "--pane": PANE } as CSSProperties}>
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              aria-activedescendant={selected ? optionId(selected) : undefined}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onScroll={onScroll}
              className="relative overflow-y-auto overscroll-contain outline-none! [scrollbar-width:none] [&:focus-visible:not([data-quiet])]:shadow-[inset_0_0_0_1.5px_var(--focus)] [&::-webkit-scrollbar]:hidden"
              style={{ height: `calc(${rows} * var(--row))` }}
            >
              <div className="relative" style={{ height: `calc(${total} * var(--row))` }}>
                {shown.map((i) => {
                  const item = items[i];
                  return (
                    <div
                      key={item.id}
                      id={optionId(item)}
                      role="option"
                      aria-selected={i === current}
                      aria-posinset={i + 1}
                      aria-setsize={total}
                      data-row={i}
                      onPointerMove={(e) => onHover(e, i)}
                      onClick={() => i !== current && moveTo(i, "pointer")}
                      onDoubleClick={openFile}
                      className={cx(rowClass, "cursor-default")}
                      style={place(i)}
                    >
                      <RowContent item={item} />
                    </div>
                  );
                })}

                {/* The bar: the same rows in accent and white, clipped to the selected one by a spring. */}
                <div
                  ref={overlayRef}
                  aria-hidden
                  data-bar
                  className={cx("group/bar pointer-events-none absolute inset-0 text-accent-ink", !total && "hidden")}
                  style={{ clipPath: barClip }}
                >
                  {/* Drawn, the bar is an ink outline a pixel inside the clip (so the clip never trims it), washed faintly as it opens. */}
                  <div
                    className="absolute inset-x-0 h-(--row) bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] transition-[filter] duration-(--duration-move) ease-out group-data-flash/bar:brightness-125 group-data-flash/bar:duration-0 drawn:left-[calc(0.45em+1px)] drawn:right-[calc(0.45em+var(--open,0)*var(--pane)+1px)] drawn:mt-[calc(0.08em+1px)] drawn:h-[calc(var(--row)-0.16em-2px)] drawn:rounded-[calc(0.6em-1px)] drawn:border drawn:border-(--device-draw-ink)! drawn:group-data-flash/bar:[background:color-mix(in_oklab,var(--device-draw-ink)_14%,transparent)]!"
                    style={{ top: "calc(var(--bar, 0) * var(--row))" }}
                  />
                  {shown.map((i) => (
                    <div key={items[i].id} className={rowClass} style={place(i)}>
                      <RowContent item={items[i]} bar />
                    </div>
                  ))}
                </div>
              </div>

              {!total && <p className="absolute inset-0 grid place-items-center px-[1.5em] text-center text-[0.95em] text-muted">This folder is empty</p>}
            </div>

            {/* The scroll thumb, as on the player's lists: tiny when the list is long. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-[0.5em] right-[0.2em] w-[0.16em] opacity-0 transition-opacity duration-(--duration-exit) [[data-scrolls]_&]:opacity-100">
              <div className="absolute inset-x-0 rounded-full bg-(--device-meter-off) drawn:bg-(--device-draw-ink)!" style={{ height: thumb, top: `calc(var(--sp, 0) * (100% - ${thumb}))` }} />
            </div>

            {/* The pane's shadow on the files, at its edge, deepening as it opens. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-[1.6em] bg-linear-to-l from-black/[0.07] to-transparent [opacity:var(--open,0)] dark:from-black/40 drawn:hidden"
              style={{ right: `calc(var(--open, 0) * var(--pane))` }}
            />

            {/* The preview: clipped from the left, its contents riding the clip's edge, so it slides without leaving its box. */}
            <div
              ref={paneRef}
              aria-hidden={!previewing}
              inert={!previewing}
              data-part="face"
              className="pointer-events-none absolute inset-y-0 right-0 w-(--pane) overflow-hidden"
              style={{ clipPath: `inset(0 0 0 ${edge})` }}
            >
              <div className="absolute inset-0 bg-surface shadow-[inset_1px_0_0_var(--line)] drawn:border-l" style={{ translate: `${edge} 0` }}>
                {near.map((i) => (
                  // A column of previews, one pane-height apart, risen by the bar's spring.
                  <div
                    key={items[i].id}
                    className="absolute inset-0"
                    style={{ translate: `0 calc((${i} - var(--bar, 0)) * 100%)`, ...(i === current ? null : { "--t": 0 }) } as CSSProperties}
                  >
                    {renderPreview(items[i])}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer: the keys that drive it, and the LCD. */}
          <div onMouseDown={(e) => e.preventDefault()} className="flex h-[2.75em] items-center gap-[0.3em] bg-panel px-[0.55em] shadow-[0_-1px_0_var(--line)] drawn:border-t">
            <FooterKey cap="up" onPress={() => press("up")} />
            <FooterKey cap="down" onPress={() => press("down")} />
            <FooterKey cap="space" onPress={() => press("space")} />

            <span
              aria-hidden
              data-part="lcd"
              className="ml-auto flex h-[1.95em] min-w-0 items-center gap-[0.45em] rounded-[0.5em] pl-[0.3em] pr-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
            >
              <span data-part="chip" className="grid h-[1.35em] w-[1.35em] shrink-0 place-items-center rounded-[0.3em] bg-white text-black">
                {status ? (
                  <span key={`${status.text}${status.detail}`} className="size-[0.5em] animate-enter rounded-full bg-black drawn:bg-(--device-draw-ink)!" />
                ) : playing ? (
                  <span className="size-[0.5em] animate-pulse rounded-full bg-(--device-rec) drawn:bg-(--device-rec)!" />
                ) : (
                  <svg viewBox="0 0 16 16" className="size-[0.85em] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
                    <path d="M2 4.5v8.25h12V6H8L6.5 4H2.5" />
                  </svg>
                )}
              </span>
              {lcd ? (
                <span key={`${lcd.text}|${lcd.detail ?? ""}`} className="min-w-0 animate-enter truncate text-[0.7em] leading-none tabular-nums">
                  <span className="font-semibold uppercase tracking-[0.06em]">{lcd.text}</span>
                  {lcd.detail && <span className={cx("text-(--device-lcd-dim)", dim)}> {lcd.detail}</span>}
                </span>
              ) : (
                // The time, written by the frame loop; its length beside it.
                <span key={selected!.id} className="animate-enter text-[0.78em] font-light leading-none tracking-[-0.01em] tabular-nums">
                  <span ref={timeRef}>0:00</span>
                  <span className={cx("text-(--device-lcd-dim)", dim)}> / {clock(selected!.duration!)}</span>
                </span>
              )}
            </span>
          </div>

          {/* Glass, and the backlight's bloom as the screen wakes. */}
          <div aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_var(--line)] [background:var(--screen-glass)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 animate-bloom [background:radial-gradient(50%_50%_at_50%_50%,var(--screen-glow),transparent)]" />
        </div>
      </div>

      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {status ? [status.text, status.detail].filter(Boolean).join(" ") : previewing && selected ? `Previewing ${selected.name}` : ""}
      </p>
    </div>
  );
}

const CAPS: Record<"up" | "down" | "space", ReactNode> = {
  up: <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />,
  down: <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />,
  space: null,
};

/** A tiny key in the footer: it drives the browser by hand, and goes down when its key on the keyboard does. */
function FooterKey({ cap, onPress }: { cap: keyof typeof CAPS; onPress: () => void }) {
  const up = (e: PointerEvent<HTMLSpanElement>) => e.currentTarget.removeAttribute("data-pressed");
  return (
    <span
      aria-hidden
      data-cap={cap}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setAttribute("data-pressed", "");
        onPress();
      }}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      data-part="key"
      className={cx(
        "group/key relative grid h-[1.75em] cursor-default place-items-center before:absolute before:-inset-x-[0.15em] before:-inset-y-[0.5em] before:content-[''] drawn:rounded-[0.42em]",
        cap === "space" ? "min-w-[3.6em]" : "min-w-[1.95em]",
      )}
    >
      <span className="grid h-full w-full place-items-center rounded-[0.42em] px-[0.4em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75 drawn:outline drawn:outline-1 drawn:outline-(--device-draw-line)">
        {cap === "space" ? (
          <span data-part="lettering" className="text-[0.66em] font-medium leading-none tracking-[0.02em] [text-shadow:var(--device-engrave)]">
            space
          </span>
        ) : (
          <svg viewBox="0 0 16 16" data-part="lettering" className="size-[0.95em] fill-none stroke-current [filter:var(--device-engrave-glyph)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6] drawn:[filter:none]!">
            {CAPS[cap]}
          </svg>
        )}
      </span>
    </span>
  );
}

/* --- Demo: a session's takes, and a ghost at the keys --------------------------- */

type Take = FileItem & { n: number; duration: number; date: string; channels: "Mono" | "Stereo" };

const FIRST = 1188; // take_1188 opens the session
const COUNT = 48;
const BARS = 44; // in a preview's waveform
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A number in [0, 1) from an integer: the same everywhere, so the server and the browser agree. */
function hash(n: number, salt: number) {
  let x = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A take's glyph: a few bars of its own waveform. */
function glyph(n: number) {
  const d = [2.5, 5.25, 8, 10.75, 13.5].map((x, i) => `M${x} ${(8 - (1 + hash(n, i + 3) * 4.5)).toFixed(1)}V${(8 + (1 + hash(n, i + 3) * 4.5)).toFixed(1)}`).join("");
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="fill-none stroke-current [stroke-linecap:round] [stroke-width:1.5]">
      <path d={d} />
    </svg>
  );
}

/** The whole take: an envelope that swells and dies away, roughened bar by bar. Rounded to two decimals for hydration. */
function wave(n: number) {
  let d = "";
  const peak = 0.3 + hash(n, 7) * 0.5; // where in the take it's loudest
  for (let j = 0; j < BARS; j++) {
    const x = 1 + j * (98 / (BARS - 1));
    const f = j / (BARS - 1);
    const env = Math.exp(-(((f - peak) / 0.42) ** 2));
    const half = 0.6 + env * (3 + hash(n * 64 + j, 9) * 11);
    d += `M${x.toFixed(2)} ${(16 - half).toFixed(2)}V${(16 + half).toFixed(2)}`;
  }
  return d;
}

/** A session: takes a few seconds to a few minutes long, over three days. */
const TAKES: Take[] = Array.from({ length: COUNT }, (_, i) => {
  const n = FIRST + i;
  const name = `take_${n}.wav`;
  const duration = 3 + Math.floor(Math.pow(hash(n, 1), 2.6) * 230);
  const date = `${22 + Math.floor((i * 3) / COUNT)} ${MONTHS[4]} ’25`;
  return {
    id: name,
    n,
    name,
    icon: glyph(n),
    duration,
    date,
    channels: hash(n, 5) < 0.7 ? "Mono" : "Stereo",
    meta: `${clock(duration)} · ${date}`,
  };
});

/** Quick Look for a take: its waveform played in ink as the red playhead crosses it, its name, its format. */
function TakePreview({ take }: { take: Take }) {
  const d = wave(take.n);
  return (
    <div className="flex h-full flex-col justify-center gap-[0.9em] px-[1.1em]">
      <div className="relative h-[4.6em]">
        <svg aria-hidden viewBox="0 0 100 32" preserveAspectRatio="none" className={cx("absolute inset-0 size-full fill-none stroke-current text-subtle [stroke-linecap:round]", dim)}>
          <path d={d} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <svg
          aria-hidden
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full fill-none stroke-current text-ink [stroke-linecap:round]"
          style={{ clipPath: "inset(0 calc((1 - var(--t, 0)) * 100%) 0 0)" }}
        >
          <path d={d} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="absolute -inset-y-[0.3em] w-px bg-(--device-rec) drawn:bg-(--device-draw-ink)!" style={{ left: "calc(var(--t, 0) * 100%)" }} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[1.05em] font-medium tracking-[-0.015em]">{take.name}</p>
        <p className={cx("mt-[0.3em] truncate text-[0.8em] tabular-nums text-muted", dim)}>
          {clock(take.duration)} · 48 kHz · 24 bit · {take.channels}
        </p>
      </div>
    </div>
  );
}

/** The ghost's rounds: keys pressed in turn, each with the pause before it. */
const ROUNDS: [wait: number, key: FileBrowserKey][][] = [
  [[380, "down"], [420, "space"], [700, "down"], [560, "down"], [560, "down"], [1500, "up"], [1300, "space"]],
  [[700, "down"], [480, "down"], [520, "space"], [1800, "down"], [700, "down"], [1600, "enter"], [1200, "escape"]],
  [[800, "pageDown"], [600, "space"], [900, "down"], [500, "down"], [500, "down"], [500, "down"], [1500, "left"]],
  [[900, "home"], [700, "down"], [500, "right"], [1700, "down"], [1500, "space"]],
];

export default function Demo() {
  const [value, setValue] = useState<string | null>(TAKES[0].id);
  const [previewing, setPreviewing] = useState(false);
  const [status, setStatus] = useState<FileStatus | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const browser = useRef<FileBrowserHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef(false); // the ghost is at the keys
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back

  function select(id: string) {
    setValue(id);
    setStatus(null);
  }

  /** Any real input takes over from the ghost, for good. */
  function takeOver() {
    touched.current = true;
    if (!live.current) return;
    live.current = false;
    clearTimeout(timer.current);
  }

  // The ghost: works the keys round after round, previewing as it goes. Its sounds are the browser's,
  // under the host rule, so it's quiet unless the host's tape plays.
  const start = useEffectEvent(() => {
    if (live.current || reducedMotion()) return;
    live.current = true;
    let round = 0;
    let steps: (typeof ROUNDS)[number] = [];
    const next = () => {
      if (!steps.length) steps = [...ROUNDS[round++ % ROUNDS.length]];
      const [wait, key] = steps.shift()!;
      timer.current = setTimeout(() => {
        if (!live.current) return;
        browser.current?.press(key);
        next();
      }, wait);
    };
    next();
  });

  // Start on mount unless the host's tape is stopped; follow the host's PLAY after that.
  useEffect(() => {
    const root = rootRef.current;
    if (hostTransport(root) !== "stop") start();
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && !touched.current && start());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = timer;
    return () => {
      observer.disconnect();
      clearTimeout(pending.current);
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
      // A mouse moving over the files selects them: that's a hand too.
      onPointerMove={(e) => e.pointerType === "mouse" && (e.target as Element).closest("[role=option]") && takeOver()}
      className="w-full max-w-[540px] select-none"
    >
      <FileBrowser
        ref={browser}
        items={TAKES}
        value={value}
        onChange={select}
        previewing={previewing}
        onPreviewChange={setPreviewing}
        renderPreview={(take) => <TakePreview take={take} />}
        onOpen={(take) => setStatus({ text: "Loaded", detail: take.name })}
        path={["Library", "Session 12"]}
        status={status}
        label="Session 12"
        noun="take"
      />
    </div>
  );
}
