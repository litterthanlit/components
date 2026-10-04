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
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createSpring, springs, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A command menu (⌘K) as one of the player's own screens: a search field
 * like the player's Find panel, results in groups, the player's accent bar
 * for the highlight, and a footer of tiny keys beside an LCD.
 *
 * Matching is fuzzy: each word of the query has to appear in order in a
 * label, and the best way it fits is scored (a dynamic program, so `sap`
 * finds Split·at·playhead by its word starts rather than the first letters
 * it meets). Starts of labels and words, and runs of letters, score; gaps
 * cost. Ties keep the order items were given in. The whole list, thousands
 * of rows, is ranked in well under a millisecond.
 *
 * Only the rows in view are rendered (a fixed row height, plus a few rows
 * either side), and the highlight bar is positioned from its row's index,
 * so it glides on its spring however far down the list it goes. The bar is
 * a second copy of those rows in accent and white, clipped to the
 * selection, so the text inside it changes colour exactly where it is.
 *
 * Focus stays in the field (a combobox pointing at the highlighted option).
 * ↑ ↓, Page Up and Down, Home and End move; Enter runs; Escape clears the
 * query, then lets go of the keyboard. The pointer highlights what it moves
 * over and runs what it clicks.
 */

export type CommandItem = {
  id: string;
  label: string;
  /** The heading it's listed under. Groups appear in the order their best match ranks. */
  group: string;
  /** A small glyph before the label. */
  icon?: ReactNode;
  /** Keys that run it directly, drawn as keycaps: ["⌘", "E"]. */
  shortcut?: string[];
  /** A quiet detail at the right edge: a take's length and date. */
  meta?: string;
};

/** What the LCD shows instead of the count: "Exported" "take_04.wav". */
export type CommandStatus = { text: string; detail?: string };

export type CommandMenuKey = "up" | "down" | "pageUp" | "pageDown" | "home" | "end" | "enter" | "escape";

export type CommandMenuHandle = {
  /** Presses a key as the keyboard would (its key in the footer goes down too). */
  press: (key: CommandMenuKey) => void;
};

type CommandMenuProps<T extends CommandItem> = {
  items: T[];
  query: string;
  onQueryChange: (query: string) => void;
  onRun: (item: T) => void;
  /** Shown on the LCD in place of the result count, e.g. what just ran. */
  status?: CommandStatus | null;
  /** The menu's accessible name. */
  label?: string;
  placeholder?: string;
  /** Someone else is typing (a demo, a shared session): show their caret while the field isn't focused. */
  ghost?: boolean;
  /** With ⌘ or Ctrl, focuses the field from anywhere on the page. `null` for none. */
  hotkey?: string | null;
  /** Rows the screen shows (headings count as rows). */
  rows?: number;
  ref?: Ref<CommandMenuHandle>;
  className?: string;
};

const ROW = 2.5; // em: options and group headings share one height, so any row's place is its index times this
const OVERSCAN = 3; // rows rendered past each edge of the view
const CHUNK = 4; // the rendered window moves this many rows at a time, so scrolling rarely re-renders
const SETTLE = 450; // ms the query rests before the result count is announced

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A detent's pitch, varied a little so repeated ticks never sound identical. */
const detent = () => 0.97 + Math.random() * 0.06;
/** 2400 → "2,400", the same on the server and in every locale. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]";

/* --- Fuzzy matching -------------------------------------------------------- */

const BONUS = { start: 12, word: 9, run: 7 };
const GAP = 1; // per letter skipped between two matched letters

/** A label as lower-case char codes, and what matching each letter is worth. Typed arrays: the inner loops never touch a string. */
type Prepared = { codes: Uint16Array; bonus: Uint8Array };

/** A query word as char codes. */
const codesOf = (text: string) => Uint16Array.from(text, (c) => c.charCodeAt(0));

const isSeparator = (c: string) => c === " " || c === "_" || c === "-" || c === "." || c === "/" || c === ":";
const isDigit = (c: string) => c >= "0" && c <= "9";
const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();

/** A label, lower-cased, with what matching each of its letters is worth: most at the start, then at word starts. */
function prepare(label: string): Prepared {
  const bonus = new Uint8Array(label.length);
  for (let j = 0; j < label.length; j++) {
    const c = label[j];
    const p = label[j - 1];
    if (j === 0) bonus[j] = BONUS.start;
    else if (isSeparator(c)) continue;
    // After a separator, at a camelCase hump, or where letters turn to digits (take_1203, mp3).
    else if (isSeparator(p) || (p === p.toLowerCase() && c !== c.toLowerCase()) || (isDigit(p) !== isDigit(c) && isLetter(p) !== isLetter(c))) bonus[j] = BONUS.word;
  }
  return { codes: codesOf(label.toLowerCase()), bonus };
}

// Scratch for the alignment, one stretch per letter of the word: where in the label that letter
// occurs, the best score with it there, and which entry of the letter before led to it.
let where = new Int32Array(1024);
let worth = new Float64Array(1024);
let via = new Int32Array(1024);

/**
 * The best way one word of the query fits a label, in order, or -Infinity.
 * With `out`, pushes the matched positions onto it.
 *
 * A dynamic program over the places each letter occurs, rather than every
 * cell of word × label: as a gap costs the same per letter, the best letter
 * before a gap is a running maximum of (score + GAP × position), so each
 * place needs one look back, plus one for a run.
 */
function align(word: Uint16Array, { codes, bonus }: Prepared, out?: number[]) {
  const m = word.length;
  const n = codes.length;
  // Most labels don't contain the word at all: a single pass rules them out.
  let k = 0;
  for (let j = 0; j < n && k < m; j++) if (codes[j] === word[k]) k++;
  if (k < m) return -Infinity;

  if (where.length < m * n) {
    where = new Int32Array(m * n * 2);
    worth = new Float64Array(m * n * 2);
    via = new Int32Array(m * n * 2);
  }
  let prev = 0; // the letter before's entries: [prev, end)
  let end = 0;
  for (let i = 0; i < m; i++) {
    const c = word[i];
    const row = i * n;
    let count = row;
    let p = prev; // the next entry of the letter before not yet folded into `gap`
    let gap = -Infinity; // best (score + GAP × position) at least two letters back
    let gapVia = -1;
    // Letter i can only sit where there's room for the letters before and after it.
    for (let j = i; j <= n - m + i; j++) {
      if (codes[j] !== c) continue;
      let best = -Infinity;
      let from = -1;
      if (i === 0) best = 0;
      else {
        for (; p < end && where[p] <= j - 2; p++) {
          const reach = worth[p] + GAP * where[p];
          if (reach > gap) {
            gap = reach;
            gapVia = p;
          }
        }
        // Across a gap, a point less for every letter skipped; or straight on from the letter before, a run.
        if (gap > -Infinity) {
          best = gap - GAP * (j - 1);
          from = gapVia;
        }
        if (p < end && where[p] === j - 1 && worth[p] + BONUS.run >= best) {
          best = worth[p] + BONUS.run;
          from = p;
        }
        if (from < 0) continue;
      }
      where[count] = j;
      worth[count] = best + bonus[j];
      via[count] = from;
      count++;
    }
    if (count === row) return -Infinity;
    prev = row;
    end = count;
  }

  // The best place for the last letter (the first on a tie), then back through the letters before it.
  let last = prev;
  for (let e = prev + 1; e < end; e++) if (worth[e] > worth[last]) last = e;
  if (out) {
    const first = out.length;
    out.length += m;
    for (let i = m - 1, e = last; i >= 0; e = via[e], i--) out[first + i] = where[e];
  }
  return worth[last];
}

/** Every label prepared once, and each item's group as a number. */
type Index = { prepared: Prepared[]; group: Int32Array; names: string[] };

function indexItems(items: CommandItem[]): Index {
  const names: string[] = [];
  const group = new Int32Array(items.length);
  items.forEach((item, i) => {
    let g = names.indexOf(item.group);
    if (g < 0) g = names.push(item.group) - 1;
    group[i] = g;
  });
  return { prepared: items.map((item) => prepare(item.label)), group, names };
}

/**
 * A ranking: item indices best first, gathered into groups (in the order of
 * each group's best match). Rows are those groups' headings and options in
 * turn, so a row's place follows from the group sizes alone.
 */
type Results = { words: Uint16Array[]; order: Int32Array; groups: { name: string; first: number; size: number }[]; ms: number };

// Scores are whole numbers, so a score and an item's index pack into one float that sorts best first, ties in order.
const SLOT = 2 ** 21; // room for two million items
const OFFSET = 2 ** 20;

/** Ranks items against a query: words match independently, scores add up, ties keep their order. Allocates almost nothing per item. */
function search({ prepared, group, names }: Index, query: string): Results {
  const started = performance.now();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).map(codesOf);
  const n = prepared.length;
  let ranked = new Int32Array(n);
  let count = 0;
  if (!words.length) for (; count < n; count++) ranked[count] = count;
  else {
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let score = 0;
      for (let w = 0; w < words.length && score > -Infinity; w++) score += align(words[w], prepared[i]);
      if (score > -Infinity) keys[count++] = (OFFSET - score) * SLOT + i;
    }
    // One native numeric sort: no comparator to call thousands of times.
    const sorted = keys.subarray(0, count).sort();
    for (let k = 0; k < count; k++) ranked[k] = sorted[k] % SLOT;
  }
  ranked = ranked.subarray(0, count);

  // Gather into groups, keeping rank within each: a counting pass, then a placing pass.
  const seen = new Int32Array(names.length).fill(-1);
  const groups: Results["groups"] = [];
  for (const i of ranked) {
    const g = group[i];
    if (seen[g] < 0) {
      seen[g] = groups.length;
      groups.push({ name: names[g], first: 0, size: 0 });
    }
    groups[seen[g]].size++;
  }
  for (let g = 1; g < groups.length; g++) groups[g].first = groups[g - 1].first + groups[g - 1].size;
  const order = new Int32Array(count);
  const next = groups.map((g) => g.first);
  for (const i of ranked) order[next[seen[group[i]]]++] = i;
  return { words, order, groups, ms: performance.now() - started };
}

/** Where a query's words fell in a label, in reading order: worked out only for the rows on screen. */
function locate(words: Uint16Array[], p: Prepared) {
  const out: number[] = [];
  for (const word of words) align(word, p, out);
  if (words.length < 2) return out;
  // Several words can land on the same letter: keep each once (an insertion sort, as there are only a few).
  let w = 0;
  for (let r = 0; r < out.length; r++) {
    const v = out[r];
    let a = w;
    while (a > 0 && out[a - 1] > v) a--;
    if (a > 0 && out[a - 1] === v) continue;
    for (let b = w; b > a; b--) out[b] = out[b - 1];
    out[a] = v;
    w++;
  }
  out.length = w;
  return out;
}

/** The row of option `i`: options plus the headings above them. */
function rowOf({ groups }: Results, i: number) {
  let g = 0;
  while (g < groups.length - 1 && i >= groups[g + 1].first) g++;
  return i + g + 1;
}

/** What's on row `r`: a group's heading, or an option. */
function atRow({ groups }: Results, r: number): { group: number; option: number } {
  for (let g = 0; g < groups.length; g++) {
    const heading = groups[g].first + g;
    if (r === heading) return { group: g, option: -1 };
    if (r <= heading + groups[g].size) return { group: g, option: r - g - 1 };
  }
  return { group: -1, option: -1 };
}

/** A label with the letters the query matched in ink, the rest quieter. */
function Highlighted({ text, matches, hit, rest }: { text: string; matches: number[]; hit: string; rest: string }) {
  if (!matches.length) return text;
  const parts: ReactNode[] = [];
  let k = 0;
  for (let i = 0; i < text.length; ) {
    const on = matches[k] === i;
    let j = i;
    while (j < text.length && (matches[k] === j) === on) {
      if (on) k++;
      j++;
    }
    parts.push(
      <span key={i} className={on ? hit : rest}>
        {text.slice(i, j)}
      </span>,
    );
    i = j;
  }
  return parts;
}

/* --- Parts ------------------------------------------------------------------ */

function SearchGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[1.15em] shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-width:1.5]">
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.2 10.2 3.3 3.3" />
    </svg>
  );
}

/** Keycaps for a shortcut: tiny keys off the player's deck, their 2px base scaled down to a hairline. */
function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 gap-[0.22em]">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="grid h-[1.6em] min-w-[1.6em] place-items-center rounded-[0.38em] px-[0.38em] font-sans text-[0.72em] font-medium leading-none text-(--device-key-ink) [background:var(--device-key-face)] shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_0_0_0.5px_rgb(0_0_0/0.16),0_1px_0_0.5px_rgb(0_0_0/0.1)] [text-shadow:var(--device-engrave)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_0_0_0.5px_rgb(0_0_0/0.8),0_1px_0_0.5px_rgb(0_0_0/0.7)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** One row's contents. Drawn twice: in ink, and in white on the bar. */
function RowContent({ item, matches, bar }: { item: CommandItem; matches: number[]; bar?: boolean }) {
  return (
    <>
      <span className={cx("grid size-[1.15em] shrink-0 place-items-center [&>svg]:size-full", bar ? "text-accent-ink" : "text-muted")}>{item.icon}</span>
      <span className="min-w-0 flex-1 truncate text-[1.06em] tracking-[-0.01em]">
        <Highlighted
          text={item.label}
          matches={matches}
          hit={bar ? "text-accent-ink" : "text-ink"}
          rest={bar ? "text-accent-ink/70" : "text-muted"}
        />
      </span>
      {item.shortcut ? (
        <Keycaps keys={item.shortcut} />
      ) : item.meta ? (
        <span className={cx("shrink-0 text-[0.8em] tabular-nums", bar ? "text-accent-ink/80" : "text-muted")}>{item.meta}</span>
      ) : null}
    </>
  );
}

const KEYS: Record<string, CommandMenuKey> = {
  ArrowDown: "down",
  ArrowUp: "up",
  PageDown: "pageDown",
  PageUp: "pageUp",
  Home: "home",
  End: "end",
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
const headingClass = "absolute inset-x-0 flex h-(--row) items-end gap-[0.7em] pb-[0.55em] pl-[1.05em] pr-[1.15em]";
/** The bar's clip: the overlay cut down to row `--bar`, a little in from the screen's edges. */
const barClip = "inset(calc(var(--bar, 0) * var(--row) + 0.08em) 0.45em calc(100% - (var(--bar, 0) + 1) * var(--row) + 0.08em) 0.45em round 0.6em)";
const thumb = "max(1.4em, calc(var(--sv, 1) * 100%))";
/** A row's place: its index times the row height, worked out by CSS. */
const place = (row: number): CSSProperties => ({ top: `calc(${row} * var(--row))` });

/* --- The menu ---------------------------------------------------------------- */

export function CommandMenu<T extends CommandItem>({
  items,
  query,
  onQueryChange,
  onRun,
  status,
  label = "Command menu",
  placeholder = "Type a command or search…",
  ghost = false,
  hotkey = "k",
  rows = 6,
  ref,
  className,
}: CommandMenuProps<T>) {
  const ids = useId();
  const listId = `${ids}-list`;
  const optionId = (item: T) => `${ids}-${item.id}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bar = useRef<Spring | null>(null);
  const placed = useRef(false); // the bar has a place: the next move glides
  const follow = useRef(false); // the last move came from a key: scroll it into view
  const rowPx = useRef(0);
  const pointer = useRef({ x: -1, y: -1 });
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused

  const index = useMemo(() => indexItems(items), [items]);
  const results = useMemo(() => search(index, query), [index, query]);
  const { order, groups, words, ms } = results;
  const total = order.length; // options; rows are these plus a heading per group

  // The highlight is an option's index; a new query puts it back on the best match.
  const [active, setActive] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }
  const current = Math.min(active, total - 1);
  const activeRow = current >= 0 ? rowOf(results, current) : -1;

  // The rendered window: rows from `start`, `span` of them. The view sets both.
  const [view, setView] = useState({ start: 0, span: rows + 2 * OVERSCAN + CHUNK, rows });

  // The result count, announced once the typing rests.
  const [announced, setAnnounced] = useState("");
  const countText = !words.length ? `${thousands(items.length)} items` : total ? `${thousands(total)} ${total === 1 ? "match" : "matches"}` : "No match";
  useEffect(() => {
    const id = setTimeout(() => setAnnounced(query.trim() ? (total ? countText : `No match for ${query.trim()}`) : ""), SETTLE);
    return () => clearTimeout(id);
  }, [query, total, countText]);

  /** Sounds follow the host's tape (see hostTransport): aloud while it plays, or once a hand is on the menu. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }

  // The bar's spring runs in rows: the clip reads `--bar × --row`, so it never measures the DOM.
  useLayoutEffect(() => {
    const overlay = overlayRef.current!;
    const s = createSpring(0, springs.snappy, (v) => overlay.style.setProperty("--bar", v.toFixed(4)));
    bar.current = s;
    return () => s.stop();
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

  // ⌘K (or Ctrl-K) from anywhere: into the field, query selected, ready to type over.
  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== hotkey) return;
      e.preventDefault();
      touched.current = true;
      if (document.activeElement !== input) play("open", { gain: 0.6 });
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  // A new query starts at the top of its results.
  useLayoutEffect(() => {
    const list = listRef.current!;
    list.scrollTop = 0;
    paintThumb(list);
  }, [query]);

  // The bar glides to the highlighted row. A long jump (End, Page Down through thousands of
  // rows) cuts to just short of it and glides the rest, so it still arrives from the right side.
  useLayoutEffect(() => {
    const s = bar.current!;
    if (activeRow < 0) return;
    const calm = reducedMotion();
    if (!placed.current || calm) s.jump(activeRow);
    else {
      if (Math.abs(activeRow - s.value) > view.rows * 1.5) s.jump(activeRow + (activeRow > s.value ? -1.5 : 1.5));
      s.set(activeRow);
    }
    placed.current = true;

    // Keys keep a row of context above and below the highlight; the pointer never scrolls.
    if (!follow.current) return;
    follow.current = false;
    const list = listRef.current!;
    const row = list.querySelector<HTMLElement>(`[data-row="${activeRow}"]`);
    if (!row) return;
    const top = row.offsetTop - row.offsetHeight;
    const bottom = row.offsetTop + row.offsetHeight * 2;
    let next = list.scrollTop;
    if (top < next) next = Math.max(0, top);
    else if (bottom > next + list.clientHeight) next = bottom - list.clientHeight;
    if (next === list.scrollTop) return;
    const near = Math.abs(next - list.scrollTop) < list.clientHeight * 1.5;
    list.scrollTo({ top: next, behavior: near && !calm ? "smooth" : "auto" });
  }, [activeRow, view.rows]);

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
    setActive(to);
  }

  function run(i: number) {
    if (i < 0 || i >= total) return sound("bump", { gain: 0.6 });
    sound("select");
    // The bar lights up as it's pressed.
    const overlay = overlayRef.current!;
    overlay.setAttribute("data-flash", "");
    setTimeout(() => overlay.removeAttribute("data-flash"), 160);
    onRun(items[order[i]]);
  }

  function press(key: CommandMenuKey) {
    const page = Math.max(1, view.rows - 1);
    if (key === "down") moveTo(current + 1, "key");
    else if (key === "up") moveTo(current - 1, "key");
    else if (key === "pageDown") moveTo(current + page, "key");
    else if (key === "pageUp") moveTo(current - page, "key");
    else if (key === "home") moveTo(0, "key");
    else if (key === "end") moveTo(total - 1, "key");
    else if (key === "enter") run(current);
    else if (query) {
      sound("back", { gain: 0.7 });
      onQueryChange("");
    } else inputRef.current?.blur();
  }

  /** Shows a key in the footer held down, or let up. */
  function hold(key: CommandMenuKey, down: boolean) {
    const cap = rootRef.current?.querySelector(`[data-cap="${key === "pageDown" ? "down" : key === "pageUp" ? "up" : key}"]`);
    cap?.toggleAttribute("data-pressed", down);
  }

  useImperativeHandle(ref, () => ({
    press(key) {
      hold(key, true);
      setTimeout(() => hold(key, false), 140);
      press(key);
    },
  }));

  /* --- Input --------------------------------------------------------------- */

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    // Ctrl-N and Ctrl-P move too, as in most palettes and every terminal.
    const key = e.ctrlKey && (e.key === "n" || e.key === "p") ? (e.key === "n" ? "down" : "up") : e.metaKey || e.altKey || e.ctrlKey ? undefined : KEYS[e.key];
    if (!key) return;
    // Escape on an empty field lets go: left unhandled, so a host (the player) can take the keyboard back.
    if (key === "escape" && !query) return e.currentTarget.blur();
    e.preventDefault();
    if (key === "enter" && e.repeat) return;
    hold(key, true);
    press(key);
  }

  function onKeyUp(e: KeyboardEvent<HTMLInputElement>) {
    const key = KEYS[e.key];
    if (key) hold(key, false);
  }

  /** The hand on the menu: focus goes to the field, quietly, so typing always lands there. */
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.pointerType === "touch" || e.target === inputRef.current) return;
    inputRef.current?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }

  function onHover(e: PointerEvent<HTMLDivElement>, option: number) {
    if (e.pointerType !== "mouse") return;
    // Only a pointer that moves: rows scrolling under a resting one don't steal the highlight.
    if (e.clientX === pointer.current.x && e.clientY === pointer.current.y) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    touched.current = true;
    if (option !== current) moveTo(option, "pointer");
  }

  /* --- Render --------------------------------------------------------------- */

  // The window, plus the highlighted row wherever it is, so aria-activedescendant always resolves.
  // Matched letters are worked out here, for these rows only.
  const rowCount = total + groups.length;
  const end = Math.min(rowCount, view.start + view.span);
  const shown: { row: number; option: number; group: number; item: T; matches: number[] }[] = [];
  const add = (row: number, { group, option }: { group: number; option: number }) =>
    shown.push({ row, option, group, item: items[order[option]], matches: locate(words, index.prepared[order[option]]) });
  for (let r = view.start; r < end; r++) {
    const at = atRow(results, r);
    if (at.option >= 0) add(r, at);
  }
  if (activeRow >= 0 && (activeRow < view.start || activeRow >= end)) add(activeRow, atRow(results, activeRow));

  const lcd = status ?? { text: countText };

  return (
    <div className={cx("@container w-full", className)}>
      <div
        ref={rootRef}
        onPointerDownCapture={() => (touched.current = true)}
        onKeyDownCapture={() => (touched.current = true)}
        onPointerDown={onPointerDown}
        className="relative rounded-[1.5em] bg-(--device-rim) p-[0.4em] text-[clamp(11px,4.1cqw,14px)] [box-shadow:var(--device-rim-edge),0_1px_2px_rgb(0_0_0/0.12),0_18px_36px_-18px_rgb(0_0_0/0.4)]"
      >
        {/* The screen: the player's own ground under glass. */}
        <div className="relative isolate flex animate-wake flex-col overflow-hidden rounded-[1.1em] bg-canvas text-ink" style={{ "--row": `${ROW}em` } as CSSProperties}>
          {/* The search field, as on the player's Find panel. */}
          <div className="px-[0.55em] pb-[0.35em] pt-[0.55em]">
            <label className="group/field flex h-[2.8em] items-center gap-[0.6em] rounded-[0.75em] bg-panel px-[0.85em] text-muted shadow-[inset_0_0_0_1px_var(--line)] transition-shadow duration-(--duration-exit) focus-within:text-ink focus-within:shadow-[inset_0_0_0_1px_var(--line-strong)] has-[input:focus-visible]:shadow-[inset_0_0_0_1.5px_var(--focus)]">
              <SearchGlyph />
              <span className="relative flex min-w-0 flex-1 items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  onKeyUp={onKeyUp}
                  placeholder={placeholder}
                  aria-label={label}
                  role="combobox"
                  aria-expanded={total > 0}
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={current >= 0 ? optionId(items[order[current]]) : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  className="peer w-full min-w-0 bg-transparent text-[1.08em] tracking-[-0.01em] text-ink outline-none placeholder:text-muted"
                />
                {/* Someone else's caret, while they type into a field that isn't focused. */}
                {ghost && (
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[1.08em] tracking-[-0.01em] peer-focus:hidden">
                    <span className="invisible whitespace-pre">{query}</span>
                    <span className="ml-px h-[1.1em] w-[2px] animate-caret rounded-full bg-accent" />
                  </span>
                )}
              </span>
              {/* The way back in, shown while the field is elsewhere. */}
              {hotkey && (
                <span aria-hidden className="transition-opacity duration-(--duration-exit) group-focus-within/field:opacity-0">
                  <Keycaps keys={["⌘", hotkey.toUpperCase()]} />
                </span>
              )}
            </label>
          </div>

          {/* The results. */}
          <div className="relative">
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={`${label}: results`}
              tabIndex={-1}
              onScroll={onScroll}
              onMouseDown={(e) => e.preventDefault()}
              className="relative overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ height: `calc(${rows} * var(--row))` }}
            >
              <div className="relative" style={{ height: `calc(${rowCount} * var(--row))` }}>
                {groups.map((group, g) => {
                  const members = shown.filter((s) => s.group === g);
                  if (!members.length) return null;
                  // Every group with a row on screen keeps its heading, so its label always resolves.
                  return (
                    <div key={group.name} role="group" aria-labelledby={`${ids}-g${g}`}>
                      <div id={`${ids}-g${g}`} aria-hidden className={headingClass} style={place(group.first + g)}>
                        <span className={cx(engraved, "text-[0.6em] text-(--device-label-quiet)")}>{group.name}</span>
                        <span className="ml-auto text-[0.66em] tabular-nums leading-none text-(--device-label-quiet)">{thousands(group.size)}</span>
                      </div>
                      {members.map(({ row, option: i, item, matches }) => (
                        <div
                          key={item.id}
                          id={optionId(item)}
                          role="option"
                          aria-selected={i === current}
                          aria-posinset={i + 1}
                          aria-setsize={total}
                          data-row={row}
                          onPointerMove={(e) => onHover(e, i)}
                          onClick={() => {
                            if (i !== current) moveTo(i, "pointer");
                            run(i);
                          }}
                          className={cx(rowClass, "cursor-default")}
                          style={place(row)}
                        >
                          <RowContent item={item} matches={matches} />
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* The bar: the same rows in accent and white, clipped to the highlighted one by a spring. */}
                <div
                  ref={overlayRef}
                  aria-hidden
                  data-bar
                  className={cx("group/bar pointer-events-none absolute inset-0 text-accent-ink", !total && "hidden")}
                  style={{ clipPath: barClip }}
                >
                  <div
                    className="absolute inset-x-0 h-(--row) bg-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] transition-[filter] duration-(--duration-move) ease-out group-data-flash/bar:brightness-125 group-data-flash/bar:duration-0"
                    style={{ top: "calc(var(--bar, 0) * var(--row))" }}
                  />
                  {shown.map(({ row, item, matches }) => (
                    <div key={item.id} className={rowClass} style={place(row)}>
                      <RowContent item={item} matches={matches} bar />
                    </div>
                  ))}
                </div>
              </div>

              {!total && (
                <p className="absolute inset-0 grid place-items-center px-[1.5em] text-center text-[0.95em] text-muted">
                  <span className="max-w-full truncate">No match for “{query.trim()}”</span>
                </p>
              )}
            </div>

            {/* The scroll thumb, as on the player's lists: tiny when the list is long. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-[0.5em] right-[0.2em] w-[0.16em] opacity-0 transition-opacity duration-(--duration-exit) [[data-scrolls]_&]:opacity-100">
              <div className="absolute inset-x-0 rounded-full bg-(--device-meter-off)" style={{ height: thumb, top: `calc(var(--sp, 0) * (100% - ${thumb}))` }} />
            </div>
          </div>

          {/* Footer: the keys that drive it, and the LCD. */}
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-[2.75em] items-center gap-[0.3em] bg-panel px-[0.55em] shadow-[0_-1px_0_var(--line)]"
          >
            <FooterKey cap="up" onPress={() => press("up")} />
            <FooterKey cap="down" onPress={() => press("down")} />
            <FooterKey cap="enter" onPress={() => press("enter")} />
            <FooterKey cap="escape" onPress={() => press("escape")} />

            <span
              aria-hidden
              className="ml-auto flex h-[1.95em] min-w-0 items-center gap-[0.45em] rounded-[0.5em] pl-[0.3em] pr-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
            >
              <span className="grid h-[1.35em] w-[1.35em] shrink-0 place-items-center rounded-[0.3em] bg-white text-black">
                {status ? (
                  <span key={`${status.text}${status.detail}`} className="size-[0.5em] animate-enter rounded-full bg-(--device-rec)" />
                ) : (
                  <svg viewBox="0 0 16 16" className="size-[0.85em] fill-none stroke-current [stroke-linecap:round] [stroke-width:2]">
                    <circle cx="7" cy="7" r="4.25" />
                    <path d="m10.2 10.2 3.3 3.3" />
                  </svg>
                )}
              </span>
              <span key={`${lcd.text}|${lcd.detail ?? ""}`} className="min-w-0 animate-enter truncate text-[0.7em] leading-none tabular-nums">
                <span className="font-semibold uppercase tracking-[0.06em]">{lcd.text}</span>
                {lcd.detail && <span className="text-(--device-lcd-dim)"> {lcd.detail}</span>}
                {!status && query.trim() && (
                  <span suppressHydrationWarning className="hidden text-(--device-lcd-dim) @[26rem]:inline">
                    {" "}
                    · {ms < 0.1 ? "<0.1" : ms.toFixed(1)} ms
                  </span>
                )}
              </span>
            </span>
          </div>

          {/* Glass, and the backlight's bloom as the screen wakes. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_var(--line)] [background:var(--screen-glass)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 animate-bloom [background:radial-gradient(50%_50%_at_50%_50%,var(--screen-glow),transparent)]" />
        </div>
      </div>

      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {announced}
      </p>
      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {status ? [status.text, status.detail].filter(Boolean).join(" ") : ""}
      </p>
    </div>
  );
}

const CAPS: Record<"up" | "down" | "enter" | "escape", ReactNode> = {
  up: <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />,
  down: <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />,
  enter: <path d="M12.5 3.5v5a1.5 1.5 0 0 1-1.5 1.5H3.5M6.5 7l-3 3 3 3" />,
  escape: null,
};

/** A tiny key in the footer: it drives the menu by hand, and goes down when its key on the keyboard does. */
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
      className="group/key relative grid h-[1.75em] min-w-[1.95em] cursor-default place-items-center before:absolute before:-inset-x-[0.15em] before:-inset-y-[0.5em] before:content-['']"
    >
      <span className="grid h-full w-full place-items-center rounded-[0.42em] px-[0.4em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75">
        {cap === "escape" ? (
          <span className="text-[0.66em] font-medium leading-none tracking-[0.02em] [text-shadow:var(--device-engrave)]">esc</span>
        ) : (
          <svg viewBox="0 0 16 16" className="size-[0.95em] fill-none stroke-current [filter:var(--device-engrave-glyph)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]">
            {CAPS[cap]}
          </svg>
        )}
      </span>
    </span>
  );
}

/* --- Demo: a recorder's command menu, and a ghost at the keys ------------------ */

type Glyph = keyof typeof GLYPHS;
type DemoItem = CommandItem & { done: [string, string?] };

const GLYPHS = {
  record: <circle cx="8" cy="8" r="4.25" className="fill-(--device-rec) stroke-none [[data-bar]_&]:fill-current" />,
  export: <path d="M8 10V2.5M5 5.5l3-3 3 3M3 9.5v3.5h10V9.5" />,
  arm: (
    <>
      <circle cx="8" cy="8" r="5.25" />
      <circle cx="8" cy="8" r="1.75" className="fill-current stroke-none" />
    </>
  ),
  split: <path d="M8 1.5v13M2.5 6.5v3M5 4.5v7M11 4.5v7M13.5 6.5v3" />,
  marker: <path d="M4 14V2.5h7.5l-1.75 3 1.75 3H4" />,
  normalize: <path d="M2 2.75h12M3.5 7v6.25M6.5 5v8.25M9.5 6v7.25M12.5 5v8.25" />,
  trim: <path d="M1.5 8h2.5M12 8h2.5M6 4v8M8 6v4M10 4.5v7" />,
  duplicate: <path d="M5.5 5.5h8v8h-8zM2.5 10.5v-8h8" />,
  sync: <path d="M13 6.5A5 5 0 0 0 4 4.5M3 9.5A5 5 0 0 0 12 11.5M3.5 2v2.75h2.75M12.5 14v-2.75H9.75" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 9h5.5l.75-9" />,
  library: <path d="M3 2.5v11M6.5 2.5v11M9.75 2.9l3.25 10.4" />,
  folder: <path d="M2 4.5v8.25h12V6H8L6.5 4H2.5" />,
  recent: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.25l2 1.25" />
    </>
  ),
  inputs: <path d="M3 13.5v-5M6.5 13.5v-10M10 13.5V6.5M13.5 13.5v-3.5" />,
  settings: (
    <>
      <path d="M2.5 5H6M9 5h4.5M2.5 11H9M12 11h1.5" />
      <circle cx="7.5" cy="5" r="1.5" />
      <circle cx="10.5" cy="11" r="1.5" />
    </>
  ),
  system: <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />,
  shortcuts: <path d="M6 6h4v4H6zM6 6V4.5A1.5 1.5 0 1 0 4.5 6H6m4 0V4.5A1.5 1.5 0 1 1 11.5 6H10M6 10v1.5A1.5 1.5 0 1 1 4.5 10H6m4 0v1.5a1.5 1.5 0 1 0 1.5-1.5H10" />,
};

const glyph = (name: Glyph) => (
  <svg aria-hidden viewBox="0 0 16 16" className="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.5]">
    {GLYPHS[name]}
  </svg>
);

const ACTIONS: [string, string, Glyph, string[], [string, string?]][] = [
  ["record", "Start recording", "record", ["R"], ["Recording", "take_05.wav"]],
  ["export", "Export take", "export", ["⌘", "E"], ["Exported", "take_04.wav"]],
  ["arm", "Arm track", "arm", ["⇧", "A"], ["Armed", "input 1"]],
  ["split", "Split at playhead", "split", ["S"], ["Split", "at 0:12.4"]],
  ["marker", "Add marker", "marker", ["M"], ["Marker", "03 at 0:12.4"]],
  ["normalize", "Normalize", "normalize", ["⌥", "N"], ["Normalized", "to −1 dB"]],
  ["trim", "Trim silence", "trim", ["⌥", "T"], ["Trimmed", "1.8 s"]],
  ["duplicate", "Duplicate take", "duplicate", ["⌘", "D"], ["Duplicated", "take_04.wav"]],
  ["stems", "Export stems", "export", ["⇧", "⌘", "E"], ["Exported", "4 stems"]],
  ["sync", "Sync library", "sync", ["⌘", "S"], ["Synced", "2,400 takes"]],
  ["delete", "Delete take", "trash", ["⌫"], ["Deleted", "take_04.wav"]],
];

const PLACES: [string, string, Glyph, string[]][] = [
  ["library", "Library", "library", ["G", "L"]],
  ["recent", "Recent takes", "recent", ["G", "R"]],
  ["exports", "Exports", "folder", ["G", "E"]],
  ["markers", "Markers", "marker", ["G", "M"]],
  ["inputs", "Inputs and levels", "inputs", ["G", "I"]],
  ["settings", "Settings", "settings", ["⌘", ","]],
  ["system", "Design system", "system", ["G", "D"]],
  ["shortcuts", "Keyboard shortcuts", "shortcuts", ["?"]],
  ["trash", "Trash", "trash", ["G", "T"]],
];

const TAKES = 2400;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIRST_DAY = Date.UTC(2024, 0, 9); // take_0001; a thousand days on, take_2400 lands on the day this was made

/** A number in [0, 1) from an integer: the same everywhere, so the server and the browser agree. */
function hash(n: number, salt: number) {
  let x = Math.imul(n ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A take's glyph: a few bars of its own waveform. */
function waveform(n: number) {
  const d = [2.5, 5.25, 8, 10.75, 13.5].map((x, i) => `M${x} ${(8 - (1 + hash(n, i + 3) * 4.5)).toFixed(1)}V${(8 + (1 + hash(n, i + 3) * 4.5)).toFixed(1)}`).join("");
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="fill-none stroke-current [stroke-linecap:round] [stroke-width:1.5]">
      <path d={d} />
    </svg>
  );
}

/** Two and a half years of takes: lengths mostly short, a few long; a couple of takes a day, in order. */
function takes(): DemoItem[] {
  return Array.from({ length: TAKES }, (_, i) => {
    const n = i + 1;
    const name = `take_${String(n).padStart(4, "0")}.wav`;
    const seconds = 3 + Math.floor(Math.pow(hash(n, 1), 2.4) * 420);
    const day = new Date(FIRST_DAY + Math.floor(((i + 0.8 * hash(n, 2)) * 1000) / TAKES) * 86400000);
    const year = day.getUTCFullYear();
    const date = `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}${year === 2026 ? "" : ` ’${String(year).slice(2)}`}`;
    return {
      id: `take-${n}`,
      label: name,
      group: "Takes",
      icon: waveform(n),
      meta: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · ${date}`,
      done: ["Loaded", name],
    };
  });
}

const ITEMS: DemoItem[] = [
  ...ACTIONS.map(([id, label, g, shortcut, done]) => ({ id, label, group: "Actions", icon: glyph(g), shortcut, done })),
  ...PLACES.map(([id, label, g, shortcut]): DemoItem => ({ id, label, group: "Go to", icon: glyph(g), shortcut, done: ["Opened", label] })),
  ...takes(),
];

/** The ghost's rounds: a query typed a letter at a time, a few keys, Enter. */
const ROUNDS: { query: string; keys: CommandMenuKey[] }[] = [
  { query: "exp", keys: ["down", "up", "enter"] },
  { query: "t 12", keys: ["down", "down", "down", "enter"] },
  { query: "sap", keys: ["enter"] },
  { query: "", keys: ["end", "up", "enter"] },
];
const LETTER = 150; // ms between keystrokes, give or take
const KEY = 480; // ms between the keys after the query
const BEAT = 1500; // ms the LCD shows what ran before the next round

const typing = () => LETTER * (0.7 + Math.random() * 0.6);

export default function Demo() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CommandStatus | null>(null);
  const [ghost, setGhost] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menu = useRef<CommandMenuHandle>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef(false); // the ghost is at the keys
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back

  function type(next: string) {
    setQuery(next);
    setStatus(null);
  }

  /** Any real input takes over from the ghost, for good. */
  function takeOver() {
    touched.current = true;
    if (!live.current) return;
    live.current = false;
    clearTimeout(timer.current);
    setGhost(false);
  }

  // The ghost: types each round's query, works the keys, runs what it found, then clears and goes again.
  const start = useEffectEvent(() => {
    if (live.current || reducedMotion()) return;
    live.current = true;
    setGhost(true);
    const root = rootRef.current;
    // Its own sounds play only while the host's tape plays: any real input ends the ghost.
    const sound = (name: SoundName, options: PlayOptions) => hostTransport(root) === "play" && play(name, options);
    let round = 0;
    let steps: [wait: number, act: () => void][] = [];
    const plan = () => {
      const { query: q, keys } = ROUNDS[round++ % ROUNDS.length];
      const out: typeof steps = [];
      for (let i = 1; i <= q.length; i++) {
        out.push([
          i === 1 ? 500 : typing(),
          () => {
            type(q.slice(0, i));
            sound("tick", { gain: 0.45, pitch: 1.1 + Math.random() * 0.08 });
          },
        ]);
      }
      // The menu plays the keys' own sounds, under the same rule.
      keys.forEach((key, i) => out.push([i === 0 ? 650 : key === "enter" ? 560 : KEY, () => menu.current?.press(key)]));
      out.push([
        BEAT,
        () => {
          type("");
          sound("back", { gain: 0.5 });
        },
      ]);
      return out;
    };
    const next = () => {
      if (!steps.length) steps = plan();
      const [wait, act] = steps.shift()!;
      timer.current = setTimeout(() => {
        if (!live.current) return;
        act();
        next();
      }, wait);
    };
    // The first keystroke lands while the screen is still waking.
    steps = plan();
    steps[0][0] = 350;
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
      // A mouse moving over the results highlights them: that's a hand too.
      onPointerMove={(e) => e.pointerType === "mouse" && (e.target as Element).closest("[role=option]") && takeOver()}
      className="w-full max-w-[540px] select-none"
    >
      <CommandMenu
        ref={menu}
        items={ITEMS}
        query={query}
        onQueryChange={type}
        onRun={(item) => setStatus({ text: item.done[0], detail: item.done[1] })}
        status={status}
        ghost={ghost}
      />
    </div>
  );
}
