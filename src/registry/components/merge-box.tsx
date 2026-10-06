"use client";

import { useEffect, useEffectEvent, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent, type Ref } from "react";
import { createSpring, focusQuietly, type Spring } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * A pull request's merge box, built as a recorder's: the request on an LCD,
 * a light for each required check on a shutter, RE-RUN and MERGE keys, and
 * the merge commit on seven drums behind the shutter.
 *
 * The checks speak the lights of every study that runs by itself: a check
 * fires red while it runs, latches when it passes and holds red when it
 * fails. When every one has passed, MERGE's light comes on orange, the colour
 * of a hand needed; a failed check lights RE-RUN instead.
 *
 * Merging lifts the shutter on a spring and the drums behind it spin up. When
 * the commit comes back, each drum runs on to the next turn that shows its
 * figure and brakes onto it, left to right. A drum follows that target through
 * a spring (stiffness 160, 0.8 of critical damping), so it only ever slows
 * and settles a twentieth of a figure past its detent. It blurs with its own
 * speed through an SVG filter that smears it vertically only: a spinning drum
 * is a streak, a slowing one sharpens, a landed one is crisp. It clicks once
 * per figure once it's slow enough to hear them, and the last to land rings
 * the chime and turns the chip to MERGED, so the word never runs ahead of the
 * drums. One frame loop draws all seven, writing CSS variables and filter
 * attributes, and stops when they rest.
 *
 * The lit key is the one tab stop. Each change is said once in a polite live
 * region, a failed check in an alert. Under reduced motion nothing pulses, the
 * shutter jumps and the drums show their figures at once.
 */

export type CheckStatus = "queued" | "running" | "passed" | "failed";
export type MergeCheck = { name: string; status: CheckStatus };
export type MergeStatus = "queued" | "checking" | "blocked" | "ready" | "merging" | "merged";
export type MergeKey = "merge" | "rerun";
export type MergeBoxHandle = { press: (key: MergeKey) => void };

type MergeBoxProps = {
  number: number;
  title: string;
  /** The branch it merges from. */
  head: string;
  /** The branch it merges into. */
  base?: string;
  checks: MergeCheck[];
  /** MERGE has been pressed and the merge is under way. */
  merging?: boolean;
  /** The merge commit, once it's in. The drums show its first seven figures. */
  sha?: string | null;
  /** MERGE: lit once every check has passed. */
  onMerge?: () => void;
  /** RE-RUN: lit once the checks have finished and one has failed. */
  onRerun?: () => void;
  ref?: Ref<MergeBoxHandle>;
  className?: string;
};

const HEX = "0123456789abcdef";
const STRIP = [...HEX, HEX[0]]; // a turn of figures and the first again, so the wrap is seamless
const DRUMS = 7;

const SPIN = 28; // figures a second at full spin
const SPIN_UP = 100; // figures a second, gained per second
const K = 160; // the drum's spring to its target
const C = 2 * Math.sqrt(K) * 0.8; // 0.8 of critical: it settles a twentieth of a figure past its detent
const ROLL = 4; // a drum rolls at least a quarter turn before it lands
const STAGGER = 0.05; // s between one drum braking and the next, left to right
const STEP = 1 / 240;
const HEAR = 9; // figures a second: slower than this, each detent clicks
const SMEAR = 0.45; // the blur's deviation, as a share of the distance a figure travels in a 60 Hz frame
const MAX_BLUR = 6; // px

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the request stands, read off its checks. */
export function statusOf(checks: MergeCheck[], merging = false, sha?: string | null): MergeStatus {
  if (sha) return "merged";
  if (merging) return "merging";
  if (checks.some((c) => c.status === "running")) return "checking";
  if (checks.some((c) => c.status === "queued")) return checks.every((c) => c.status === "queued") ? "queued" : "checking";
  if (checks.some((c) => c.status === "failed")) return "blocked";
  return "ready";
}

/** The drums' figures for a commit: its first seven hex figures. */
const figuresOf = (sha?: string | null) => Array.from({ length: DRUMS }, (_, i) => Math.max(0, HEX.indexOf((sha ?? "")[i]?.toLowerCase() ?? "0")));

/** The first position at or past `p` that shows figure `f`. */
const aligned = (p: number, f: number) => Math.ceil((p - f) / 16) * 16 + f;

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]";
/** A key's face: it sinks onto its base under the hand, or while `data-pressed` (the ghost). */
const sink =
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";

/** The chip's glyph says the state before its word does. */
function ChipGlyph({ status }: { status: MergeStatus }) {
  if (status === "checking" || status === "merging") return <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none" />;
  if (status === "blocked") return <span className="size-[0.5em] rounded-[0.12em] bg-(--device-rec)" />;
  return <span className="size-[0.55em] rounded-full bg-black" />;
}

const WORD: Record<MergeStatus, string> = { queued: "Queued", checking: "Checking", blocked: "Blocked", ready: "Ready", merging: "Merging", merged: "Merged" };

/** What a screen reader hears for a state. */
function sayFor(status: MergeStatus, checks: MergeCheck[], base: string, sha?: string | null) {
  const left = checks.filter((c) => c.status === "running" || c.status === "queued").length;
  if (status === "checking") return `Running ${left} ${left === 1 ? "check" : "checks"}`;
  if (status === "blocked") return `${checks.filter((c) => c.status === "failed").map((c) => c.name).join(", ")} failed`;
  if (status === "ready") return `All ${checks.length} checks passed. Ready to merge`;
  if (status === "merging") return "Merging";
  if (status === "merged") return `Merged into ${base} as ${(sha ?? "").slice(0, DRUMS)}`;
  return "";
}

type Drums = { spin: () => void; land: (figures: number[], done: () => void) => void; jump: (figures: number[]) => void };

export function MergeBox({ number, title, head, base = "main", checks, merging = false, sha, onMerge, onRerun, ref, className }: MergeBoxProps) {
  const status = statusOf(checks, merging, sha);
  // The chip and the live region say MERGED when the last drum lands, with the chime, not when the commit arrives.
  const [landedOn, setLandedOn] = useState<string | null>(null);
  const shown: MergeStatus = status === "merged" && landedOn !== sha ? "merging" : status;
  const ids = useId();
  const uid = ids.replace(/[^\w-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const shutter = useRef<Spring | null>(null);
  const drums = useRef<Drums | null>(null);
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused

  const canMerge = status === "ready" && !!onMerge;
  const canRerun = status === "blocked" && !!onRerun;

  // Each change of state is said once; the paragraph is keyed so the same words can be said again.
  const failed = checks.filter((c) => c.status === "failed").map((c) => c.name);
  // The words are fixed when the state changes, so the count isn't read out again as each check passes.
  const key = `${shown}|${shown === "blocked" ? failed.join() : ""}|${number}`;
  const [said, setSaid] = useState({ key, n: 0, words: "" });
  if (said.key !== key) setSaid({ key, n: said.n + 1, words: sayFor(shown, checks, base, sha) });
  const words = said.words;

  /** Sounds it makes by itself follow the host's transport; the hand's always play. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }
  const soundEvent = useEffectEvent(sound);

  // The shutter and the drums. One spring lifts the shutter; one frame loop drives all seven drums.
  useLayoutEffect(() => {
    const slot = slotRef.current!;
    const strips = [...slot.querySelectorAll<HTMLElement>("[data-strip]")];
    const blurs = [...slot.querySelectorAll<SVGFEGaussianBlurElement>("[data-blur]")];
    const reduced = reducedMotion();
    const ds = strips.map((el, i) => ({
      el,
      blurEl: blurs[i],
      x: 0, // the figure in the window, as a position along the strip
      v: 0,
      tx: 0, // where the drum is being driven to
      tv: 0,
      spin: false, // the target is moving
      stop: null as number | null, // where the target stops, once braking
      ask: Infinity, // s: when to brake
      figure: 0,
      shown: 0,
      blur: 0,
    }));
    let px = 24; // a figure's height, measured as the drums spin up
    let landing: (() => void) | null = null; // told when the last drum lands
    let raf = 0;
    let last = 0;
    let acc = 0;

    const draw = () => {
      ds.forEach((d, i) => {
        d.el.style.setProperty("--x", (((d.x % 16) + 16) % 16).toFixed(3));
        const sigma = reduced ? 0 : Math.min(MAX_BLUR, (Math.abs(d.v) * px * SMEAR) / 60);
        if (Math.abs(sigma - d.blur) > 0.05) {
          d.blur = sigma;
          d.blurEl.setAttribute("stdDeviation", `0 ${sigma.toFixed(2)}`);
          d.el.style.filter = sigma > 0.1 ? (d.el.dataset.filter ?? "") : "";
        }
        // Each detent the window passes, once the drum is slow enough to hear it.
        const at = Math.round(d.x);
        if (at !== d.shown) {
          d.shown = at;
          if (Math.abs(d.v) < HEAR) soundEvent("tick", { gain: 0.3, pitch: 0.96 + i * 0.02 });
        }
      });
    };

    const step = (t: number) => {
      for (const d of ds) {
        if (d.spin && d.stop === null && t >= d.ask) d.stop = aligned(d.tx + ROLL, d.figure);
        if (d.spin) {
          d.tv = Math.min(SPIN, d.tv + SPIN_UP * STEP);
          d.tx += d.tv * STEP;
          if (d.stop !== null && d.tx >= d.stop) {
            d.tx = d.stop;
            d.tv = 0;
            d.spin = false;
          }
        }
        if (!d.spin && d.v === 0 && d.x === d.tx) continue;
        d.v += (-K * (d.x - d.tx) - C * d.v) * STEP;
        d.x += d.v * STEP;
        if (!d.spin && Math.abs(d.x - d.tx) < 0.01 && Math.abs(d.v) < 0.1) {
          d.x = d.tx;
          d.v = 0;
        }
      }
    };

    const frame = (now: number) => {
      const t = now / 1000;
      acc += Math.min(0.064, t - last);
      last = t;
      for (; acc >= STEP; acc -= STEP) step(t);
      draw();
      const busy = ds.some((d) => d.spin || d.v !== 0 || d.x !== d.tx);
      if (!busy && landing) {
        landing();
        landing = null;
        soundEvent("select", { gain: 0.55 });
      }
      raf = busy ? requestAnimationFrame(frame) : 0;
    };
    const wake = () => {
      if (raf) return;
      last = performance.now() / 1000;
      acc = 0;
      raf = requestAnimationFrame(frame);
    };

    drums.current = {
      spin() {
        px = strips[0]?.firstElementChild?.getBoundingClientRect().height || px;
        for (const d of ds) {
          d.spin = true;
          d.stop = null;
          d.ask = Infinity;
        }
        wake();
      },
      land(figures, done) {
        const t = performance.now() / 1000;
        if (!ds.some((d) => d.spin)) px = strips[0]?.firstElementChild?.getBoundingClientRect().height || px;
        ds.forEach((d, i) => {
          d.figure = figures[i];
          d.ask = t + i * STAGGER;
          d.stop = null;
          d.spin = true;
        });
        landing = done;
        wake();
      },
      jump(figures) {
        cancelAnimationFrame(raf);
        raf = 0;
        landing = null;
        ds.forEach((d, i) => {
          d.x = d.tx = d.shown = figures[i];
          d.v = d.tv = 0;
          d.spin = false;
          d.stop = null;
          d.ask = Infinity;
        });
        draw();
      },
    };

    // The shutter has mass: a little under critical, so it lands with the faintest give.
    const s = createSpring(0, { stiffness: 300, damping: 30 }, (lift) => {
      slot.style.setProperty("--lift", lift.toFixed(4));
      // Shut again: the drums go back to zero behind it, unseen.
      if (lift === 0) drums.current?.jump(figuresOf(null));
    });
    shutter.current = s;
    return () => {
      cancelAnimationFrame(raf);
      s.stop();
    };
  }, []);

  // A change of state opens or shuts the shutter, spins the drums and lands them on the commit.
  const was = useRef<MergeStatus | null>(null);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = status;
    const still = from === null || reducedMotion();
    const open = status === "merging" || status === "merged";
    const s = shutter.current!;
    if (still) s.jump(open ? 1 : 0);
    else s.set(open ? 1 : 0);
    if (status === "merging" && !still) drums.current!.spin();
    if (status !== "merged") return;
    const landed = () => setLandedOn(sha ?? null);
    if (!still) {
      drums.current!.land(figuresOf(sha), landed);
      return;
    }
    // Nothing to roll: the figures are there at once, and the chip says so on the next frame.
    drums.current!.jump(figuresOf(sha));
    const id = requestAnimationFrame(landed);
    return () => cancelAnimationFrame(id);
  }, [status, sha]);

  // One cue per change; none on mount. The chime for a merge comes from the last drum to land.
  const cue = useEffectEvent((from: { checks: MergeCheck[]; status: MergeStatus }) => {
    let passed = checks.filter((c) => c.status === "passed").length;
    checks.forEach((c, i) => {
      const before = from.checks[i]?.status;
      if (before === c.status || from.checks.length !== checks.length) return;
      // Each pass a detent higher, like the hold's ratchet.
      if (c.status === "passed") sound("tick", { gain: 0.5, pitch: 0.92 + 0.05 * passed-- });
      if (c.status === "failed") sound("bump", { gain: 0.9 });
    });
    if (status === from.status) return;
    if (status === "ready") sound("toggle", { gain: 0.5 });
    else if (status === "merging") sound("open", { gain: 0.5 });
    else if (from.status === "merging" || from.status === "merged") sound("close", { gain: 0.45 });
  });
  const heard = useRef({ checks, status });
  useEffect(() => {
    const from = heard.current;
    if (from.checks === checks && from.status === status) return;
    heard.current = { checks, status };
    cue(from);
  }, [checks, status]);

  // A new request's title types on, a letter per step.
  const typed = useRef(title);
  useLayoutEffect(() => {
    if (typed.current === title) return;
    typed.current = title;
    const el = titleRef.current;
    if (!el || reducedMotion()) return;
    el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
      duration: Math.min(480, Math.max(160, title.length * 18)),
      easing: `steps(${Math.min(title.length, 48)})`,
    });
  }, [title]);

  /* --- Keys --------------------------------------------------------------- */

  function act(key: MergeKey) {
    if (key === "merge" && canMerge) onMerge?.();
    else if (key === "rerun" && canRerun) onRerun?.();
  }

  useImperativeHandle(ref, () => ({
    press(key) {
      if (key === "merge" ? !canMerge : !canRerun) return;
      const el = rootRef.current?.querySelector(`[data-key="${key}"]`);
      el?.toggleAttribute("data-pressed", true);
      sound("press", { gain: 0.7 });
      setTimeout(() => {
        el?.toggleAttribute("data-pressed", false);
        sound("release", { gain: 0.6 });
      }, 140);
      act(key);
    },
  }));

  /** Focus follows the hand: no ring, and the keys pick up where it left off. */
  const focusOnPress = (e: PointerEvent<HTMLElement>) => {
    if (e.button === 0) focusQuietly(e.currentTarget);
  };

  /* --- Render ------------------------------------------------------------- */

  const passed = checks.filter((c) => c.status === "passed").length;
  const summary = `${passed} of ${checks.length} checks passed${failed.length ? `; ${failed.join(", ")} failed` : ""}`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Pull request #${number}`}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      className={cx("flex w-full flex-col gap-[0.7em]", className)}
    >
      {/* The request: an LCD in a well. It mirrors what the live region says, so it stays out of the reading order. */}
      <div className="rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
        <div
          aria-hidden
          className="flex flex-col gap-[0.5em] overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.7em] pt-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <div className="flex items-center gap-[0.55em]">
            <span className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <ChipGlyph status={shown} />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em]">{WORD[shown]}</span>
            </span>
            <span className="ml-auto text-[0.72em] leading-none tabular-nums text-(--device-lcd-dim)">#{number}</span>
          </div>
          <p ref={titleRef} className="truncate text-[1.05em] font-light leading-[1.2] tracking-[-0.01em]">
            {title}
          </p>
          <p className="truncate text-[0.72em] leading-none text-(--device-lcd-dim)">
            {head} → {base}
          </p>
        </div>
      </div>

      {/* The slot: the drums in a black window, under a shutter that carries the check lights. */}
      <div className="rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
        <div ref={slotRef} className="relative h-[3em] overflow-hidden rounded-[0.7em] [--lift:0]">
          <div aria-hidden className="absolute inset-0 grid place-items-center bg-(--device-rim) shadow-[inset_0_1px_2px_rgb(0_0_0/0.6)]">
            <div className="flex gap-px font-mono text-[1.7em] leading-none">
              {Array.from({ length: DRUMS }, (_, i) => (
                <span key={i} className="relative h-[1.32em] w-[0.78em] overflow-hidden bg-(--device-rim)">
                  <span
                    data-strip
                    data-filter={`url(#${uid}-blur-${i})`}
                    className="absolute inset-x-0 top-0 flex flex-col text-(--device-lcd-ink) will-change-transform [--x:0] [transform:translateY(calc(var(--x)*-1.32em))]"
                  >
                    {STRIP.map((f, j) => (
                      <span key={j} className="grid h-[1.32em] place-items-center">
                        {f}
                      </span>
                    ))}
                  </span>
                  {/* The drum's curve: figures dim as they turn away, and a fine line of light across the middle. */}
                  <span className="pointer-events-none absolute inset-0 [background:linear-gradient(rgb(0_0_0/0.75),transparent_32%,transparent_68%,rgb(0_0_0/0.75))]" />
                  <span className="pointer-events-none absolute inset-x-0 top-[46%] h-px bg-white/[0.06]" />
                </span>
              ))}
            </div>
            {/* Each drum's motion blur: vertical only, its deviation written by the frame loop. */}
            <svg className="absolute size-0">
              <defs>
                {Array.from({ length: DRUMS }, (_, i) => (
                  <filter key={i} id={`${uid}-blur-${i}`} x="0" y="-10%" width="100%" height="120%">
                    <feGaussianBlur data-blur stdDeviation="0 0" />
                  </filter>
                ))}
              </defs>
            </svg>
          </div>

          {/* The shutter: a piece of the body's finish. Merging lifts it out of the slot. */}
          <div
            aria-hidden
            className="absolute inset-0 grid items-center rounded-[inherit] px-[0.5em] [background:var(--device-body)] shadow-(--device-body-edge) [transform:translateY(calc(var(--lift)*-100%))]"
            style={{ gridTemplateColumns: `repeat(${checks.length}, minmax(0, 1fr))` }}
          >
            {checks.map((c) => (
              <span key={c.name} data-light={c.status} className="group/light flex min-w-0 items-center justify-center gap-[0.45em]">
                <span className="grid size-[0.78em] shrink-0 place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess) dark:bg-black/40">
                  <span className="relative size-[0.44em] rounded-full bg-(--device-meter-off) transition-[background-color] duration-(--duration-exit) group-data-[light=failed]/light:bg-(--device-rec) group-data-[light=failed]/light:duration-0 group-data-[light=passed]/light:bg-(--device-meter-on) group-data-[light=running]/light:bg-(--device-rec) group-data-[light=running]/light:duration-0">
                    {/* The glow on its own layer: it breathes while the check runs and holds when it fails. */}
                    <span className="absolute inset-0 rounded-full opacity-0 shadow-[0_0_0.45em_var(--device-rec)] transition-opacity duration-(--duration-exit) group-data-[light=failed]/light:opacity-100 group-data-[light=running]/light:animate-pulse group-data-[light=running]/light:opacity-100 motion-reduce:animate-none" />
                  </span>
                </span>
                <span
                  className={cx(
                    engraved,
                    "truncate text-[0.6em] text-(--device-label-quiet) group-data-[light=failed]/light:text-(--device-label) group-data-[light=running]/light:text-(--device-label)",
                  )}
                >
                  {c.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The keys: each one's light comes on orange when it needs a hand. */}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-[0.5em]">
        {(
          [
            { key: "rerun", label: "Re-run", lit: canRerun },
            { key: "merge", label: "Merge", lit: canMerge },
          ] as const
        ).map(({ key: name, label, lit }) => (
          <button
            key={name}
            type="button"
            data-key={name}
            data-sound={lit ? "key" : "off"}
            aria-disabled={!lit}
            aria-describedby={`${uid}-summary`}
            tabIndex={lit ? 0 : -1}
            onPointerDown={(e) => lit && focusOnPress(e)}
            onClick={() => act(name)}
            className={cx("group/key min-w-0 rounded-[0.7em] outline-offset-2", !lit && "cursor-default")}
          >
            <span
              className={cx(
                "relative grid h-[2.7em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out",
                lit && sink,
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "absolute left-1/2 top-[0.42em] h-[0.24em] w-[2.3em] -translate-x-1/2 rounded-full",
                  lit ? "bg-(--device-hold) shadow-[0_0_0.45em_var(--device-hold)]" : "bg-(--device-meter-off) transition-[background-color] duration-(--duration-exit)",
                )}
              />
              <span className="mt-[0.45em] text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <p id={`${uid}-summary`} className="sr-only">
        {summary}
      </p>
      <div role="status" className="sr-only">
        <p key={said.n}>{shown === "blocked" ? "" : words}</p>
      </div>
      <p role="alert" className="sr-only">
        {shown === "blocked" ? words : ""}
      </p>
    </div>
  );
}

/* --- Demo: the gallery's own pull requests, and a ghost at the keys ------------ */

const CHECKS = ["Types", "Lint", "Build", "Fit"];

type Run = { number: number; title: string; head: string; sha: string; passAt: number[]; fails?: number; rerunAt?: number };

const RUNS: Run[] = [
  { number: 14, title: "Add Tape Reels", head: "tape-reels", sha: "eff488b", passAt: [880, 560, 1500, 1180] },
  { number: 15, title: "Add VU Meter", head: "vu-meter", sha: "57c8141", passAt: [820, 600, 1450, 1260], fails: 3, rerunAt: 1300 },
  { number: 16, title: "Add Fader", head: "fader", sha: "26abe58", passAt: [940, 520, 1600, 1220] },
];

const START = 150; // ms: the first lights fire while the plate is still entering
const MERGE_TAKES = 500; // ms from MERGE to the commit coming back
const NEXT_AFTER = 3600; // ms from the commit to the next request
const QUEUE = 500; // ms a new request sits queued before its checks start
/** How long the ghost waits before it presses a lit key. */
const GHOST: Partial<Record<MergeStatus, number>> = { ready: 450, blocked: 1300 };

const queued = () => CHECKS.map((name): MergeCheck => ({ name, status: "queued" }));

export default function Demo() {
  const [at, setAt] = useState(0);
  const [checks, setChecks] = useState<MergeCheck[]>(queued);
  const [merging, setMerging] = useState(false);
  const [sha, setSha] = useState<string | null>(null);
  const [ghost, setGhost] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const box = useRef<MergeBoxHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);
  const live = useRef(false); // the ghost is at the keys
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back

  const run = RUNS[at];
  const status = statusOf(checks, merging, sha);

  function later(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  /** CI runs the checks: each passes, or fails, in its own time. A re-run runs only the failed ones. */
  function runChecks(r: Run, only?: number[]) {
    const which = only ?? r.passAt.map((_, i) => i);
    setChecks((cs) => cs.map((c, i) => (which.includes(i) ? { ...c, status: "running" } : c)));
    for (const i of which) {
      const result = !only && i === r.fails ? "failed" : "passed";
      later(() => setChecks((cs) => cs.map((c, j) => (j === i ? { ...c, status: result } : c))), only ? (r.rerunAt ?? r.passAt[i]) : r.passAt[i]);
    }
  }

  /** The next request comes in: the shutter shuts, the lights go out, and its checks start. */
  function cueUp(next: number) {
    setAt(next);
    setMerging(false);
    setSha(null);
    setChecks(queued());
    later(() => runChecks(RUNS[next]), QUEUE);
  }

  function onMerge() {
    const next = (at + 1) % RUNS.length;
    setMerging(true);
    later(() => {
      setSha(run.sha);
      // Under reduced motion nothing comes along by itself: the merged request stays.
      if (!reducedMotion()) later(() => cueUp(next), NEXT_AFTER);
    }, MERGE_TAKES);
  }

  function onRerun() {
    runChecks(
      run,
      checks.flatMap((c, i) => (c.status === "failed" ? [i] : [])),
    );
  }

  /** Any real input takes over from the ghost, for good. The checks run on; the keys wait for the hand. */
  function takeOver() {
    touched.current = true;
    if (!live.current) return;
    live.current = false;
    setGhost(false);
  }

  // The ghost presses whichever key is lit, after a beat.
  const press = useEffectEvent(() => {
    if (!live.current) return;
    if (status === "ready") box.current?.press("merge");
    else if (status === "blocked") box.current?.press("rerun");
  });
  useEffect(() => {
    const wait = GHOST[status];
    if (!ghost || wait === undefined) return;
    const id = setTimeout(press, wait);
    return () => clearTimeout(id);
  }, [ghost, status]);

  // On power-up the first request's checks start, unless the host's tape is stopped: then it waits for PLAY.
  // Under reduced motion it shows one still frame, every check passed and MERGE lit for the hand.
  const powerUp = useEffectEvent(() => {
    if (started.current) return;
    if (reducedMotion()) {
      started.current = true;
      setChecks(CHECKS.map((name) => ({ name, status: "passed" })));
      return;
    }
    if (hostTransport(rootRef.current) === "stop") return;
    started.current = true;
    if (!touched.current) {
      live.current = true;
      setGhost(true);
    }
    later(() => runChecks(RUNS[0]), START);
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
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} onFocusCapture={takeOver} className="@container w-full max-w-[400px] select-none">
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
        <MergeBox ref={box} number={run.number} title={run.title} head={run.head} checks={checks} merging={merging} sha={sha} onMerge={onMerge} onRerun={onRerun} />
      </div>
    </div>
  );
}
