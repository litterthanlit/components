"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react";
import { focusQuietly } from "@/design-system";
import { hostTransport, play, type PlayOptions, type SoundName } from "@/lib/sound";

/*
 * An agent's run on a recorder's readout: an LCD in a well, three lights for
 * the phases it passes through, an ALLOW key and a transport cap.
 *
 * The chip says the state with the LCD's own glyphs. A live run is the
 * transport rolling, so it pulses red like every study that runs by itself;
 * an error is the same red in the stop's square, so shape tells it from a
 * live run even where nothing pulses; a run waiting on you is orange, the
 * colour of a hand. Nothing on the glass is red text.
 *
 * The clock counts the time the run is live, in minutes, seconds and frames.
 * It holds, dimmed, while the run waits on you, and STOP freezes it on the
 * frame the key goes down. The light that's firing flickers with each chunk
 * of tokens through a one-pole detector (90ms), so a stream shimmers and a
 * stall goes quiet while the clock keeps counting. Both are drawn from one
 * frame loop straight to the DOM, which stops while nothing moves or the
 * readout is off-screen. No spring: nothing here travels.
 *
 * Tab reaches the cap (and ALLOW while it's lit); Escape stops a run. Each
 * change is said once in a polite live region, an error in an alert. Under
 * reduced motion nothing pulses or flickers and the clock counts whole seconds.
 */

export type AgentState = "ready" | "thinking" | "tool" | "writing" | "waiting" | "done" | "error" | "stopped";
/** What the agent is doing: "Read" "take_04.wav". */
export type AgentStep = { verb: string; target?: string };
export type AgentKey = "run" | "stop" | "allow";
export type AgentStatusHandle = { press: (key: AgentKey) => void };

type AgentStatusProps = {
  state: AgentState;
  /** What it's doing, waiting on, or what went wrong. */
  step?: AgentStep | null;
  /** Tokens so far this run. Each rise kicks the firing light; leave it out and the light burns steady and no count shows. */
  tokens?: number;
  /** Seconds the run has been live, to restore or correct the clock. Between changes it counts on while live and holds otherwise. */
  elapsed?: number;
  /** STOP, or Escape: interrupts a live or waiting run. Set the state to "stopped" straight away. */
  onStop?: () => void;
  /** RUN from ready, done or stopped; RETRY after an error. */
  onRun?: () => void;
  /** ALLOW: lets a waiting run go on. Leave it out and the key isn't drawn. */
  onAllow?: () => void;
  label?: string;
  ref?: Ref<AgentStatusHandle>;
  className?: string;
};

type Phase = "thinking" | "tool" | "writing";
type Light = "off" | "set" | "fire" | "hold" | "fault";

const PHASES: { key: Phase; name: string }[] = [
  { key: "thinking", name: "Think" },
  { key: "tool", name: "Tool" },
  { key: "writing", name: "Write" },
];

const DECAY = 0.09; // s: the detector's release
const FLOOR = 0.35; // the firing light's glow with no tokens arriving

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const isLive = (s: AgentState | null): s is Phase => s === "thinking" || s === "tool" || s === "writing";
/** A live state entered from one of these starts a fresh run. */
const isEnd = (s: AgentState | null) => s === null || s === "ready" || s === "done" || s === "error" || s === "stopped";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const lineOf = (step?: AgentStep | null) => (step ? [step.verb, step.target].filter(Boolean).join(" ") : "");

/** Lettering on the body: tiny tracked capitals, cut in. */
const engraved = "font-semibold uppercase leading-none tracking-[0.16em] [text-shadow:var(--device-engrave)]";
/** Drawn, what the glass dims is ink at a lower strength. */
const dimmed = "drawn:text-[color-mix(in_oklab,var(--device-draw-ink)_70%,transparent)]!";
/** A key's face: it sinks onto its base under the hand, or while `data-pressed` (the keyboard, the ghost). */
const sink =
  "group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";

/** Writes seconds into the clock as minutes, seconds and frames at 25 fps, touching only the fields that change. */
function paintClock(el: HTMLElement, seconds: number) {
  const frames = Math.floor(seconds * 25);
  const parts = [Math.floor(frames / 1500) % 100, Math.floor(frames / 25) % 60, frames % 25];
  for (let i = 0; i < 3; i++) {
    const node = el.children[i * 2];
    const text = String(parts[i]).padStart(2, "0");
    if (node && node.textContent !== text) node.textContent = text;
  }
}

/** The cue for a change of state: one existing voice, varied by pitch and gain. */
function soundFor(from: AgentState, to: AgentState, lineChanged: boolean, tools: number): [SoundName, PlayOptions] | null {
  if (isLive(to)) {
    if (from === "waiting") return ["select", { gain: 0.45 }];
    if (!isLive(from)) return ["start", { gain: 0.8 }];
    if (from !== to) return ["toggle", { gain: 0.45 }];
    // Each tool call a detent a little higher, like the hold's ratchet.
    if (to === "tool" && lineChanged) return ["tick", { gain: 0.55, pitch: 0.92 + 0.04 * Math.min(tools, 8) }];
    return null;
  }
  if (from === to) return null;
  if (to === "waiting") return ["open", { gain: 0.5, pitch: 1.05 }];
  if (to === "done") return ["select", { gain: 0.6 }];
  if (to === "error") return ["bump", { gain: 0.9 }];
  if (to === "stopped") return ["stop", { gain: 0.8 }];
  return null;
}

/** What a screen reader hears for a state. */
function sayFor(state: AgentState, line: string) {
  const with_ = (word: string) => (line ? `${word}: ${line}` : word);
  if (state === "thinking") return with_("Thinking");
  if (state === "tool") return line || "Running a tool";
  if (state === "writing") return with_("Writing");
  if (state === "waiting") return with_("Waiting for your OK");
  if (state === "done") return with_("Done");
  if (state === "error") return with_("Error");
  if (state === "stopped") return "Stopped";
  return "";
}

/** The chip's glyph says the state before its word does. Drawn, red stays for what runs and what fails; the rest are ink, orange being the drawing's own. */
function ChipGlyph({ state }: { state: AgentState }) {
  if (isLive(state)) return <span className="size-[0.55em] animate-pulse rounded-full bg-(--device-rec) motion-reduce:animate-none drawn:bg-(--device-rec)!" />;
  if (state === "waiting") return <span className="size-[0.55em] rounded-full bg-(--device-hold) drawn:bg-(--device-draw-ink)!" />;
  if (state === "error") return <span className="size-[0.5em] rounded-[1px] bg-(--device-rec) drawn:bg-(--device-rec)!" />;
  if (state === "stopped") return <span className="size-[0.5em] rounded-[1px] bg-current drawn:bg-(--device-draw-ink)!" />;
  return <span className="size-[0.55em] rounded-full bg-black drawn:bg-(--device-draw-ink)!" />;
}

/** The run so far, worked out from each change of state as it renders. */
type Track = { state: AgentState; line: string; at: Phase | null; seen: Phase[]; tools: number; said: number };

export function AgentStatus({ state, step, tokens, elapsed, onStop, onRun, onAllow, label = "Agent", ref, className }: AgentStatusProps) {
  const line = lineOf(step);
  const ids = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const engine = useRef<{ go: (live: boolean, fresh: boolean) => void; reset: () => void; seek: (s: number) => void; kick: (n: number) => void } | null>(null);
  const touched = useRef(false); // a hand has worked it: it sounds even while the host is paused
  const heard = useRef<"start" | "stop" | null>(null); // a key already played the cue the next change would
  const metered = useRef(tokens !== undefined);
  useLayoutEffect(() => {
    metered.current = tokens !== undefined;
  });

  const [track, setTrack] = useState<Track>(() => ({
    state,
    line,
    at: isLive(state) ? state : state === "waiting" ? "tool" : null,
    seen: isLive(state) ? [state] : [],
    tools: state === "tool" || state === "waiting" ? 1 : 0,
    said: 0,
  }));

  // Each change is read off as it renders: the phase the lights follow, the phases passed and the tool calls made.
  if (state !== track.state || line !== track.line) {
    const fresh = state === "ready" || (isLive(state) && isEnd(track.state));
    const resumed = track.state === "waiting" && line === track.line; // ALLOW: the same call goes on
    const at = isLive(state) ? state : state === "waiting" ? "tool" : state === "ready" ? null : track.at;
    const seen = fresh ? [] : track.seen;
    // A new tool call: one asking for your OK is the same call when it goes on.
    const call = (state === "tool" || state === "waiting") && !resumed && (line !== track.line || (track.state !== "tool" && track.state !== "waiting"));
    setTrack({
      state,
      line,
      at,
      seen: at && !seen.includes(at) ? [...seen, at] : seen,
      tools: (fresh ? 0 : track.tools) + (call ? 1 : 0),
      said: track.said + 1,
    });
  }

  const live = isLive(state);
  const waiting = state === "waiting";
  const canStop = (live || waiting) && !!onStop;
  const canRun = !live && !waiting && !!onRun;
  const cap = canStop ? "Stop" : state === "error" ? "Retry" : "Run";

  /** Sounds it makes by itself follow the host's transport; the hand's always play. */
  function sound(name: SoundName, options?: PlayOptions) {
    if (touched.current || hostTransport(rootRef.current) === "play") play(name, options);
  }

  // The clock and the firing light, drawn from one frame loop that runs only while something moves.
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const clock = clockRef.current!;
    const reduced = reducedMotion();
    let banked = 0; // live seconds before the current stretch
    let since = 0; // when the current live stretch began, or 0 while held
    let env = 0; // the detector: 1 as tokens land, falling at DECAY
    let last = 0;
    let raf = 0;
    let seen = true;

    const draw = (now: number) => {
      const t = banked + (since ? (now - since) / 1000 : 0);
      // Whole seconds while live under reduced motion: the frames would race.
      paintClock(clock, reduced && since ? Math.floor(t) : t);
      root.style.setProperty("--act", (!metered.current ? 1 : reduced ? 0.7 : FLOOR + (1 - FLOOR) * env).toFixed(3));
    };
    const frame = (now: number) => {
      env *= Math.exp(-Math.min(100, now - last) / 1000 / DECAY);
      if (env < 0.002) env = 0;
      last = now;
      draw(now);
      raf = since || env ? requestAnimationFrame(frame) : 0;
    };
    const wake = () => {
      if (raf || !seen || !(since || env)) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const visibility = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      if (seen) wake();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    visibility.observe(root);

    engine.current = {
      go(isLive, fresh) {
        const now = performance.now();
        if (fresh) banked = 0;
        if (isLive && !since) since = now;
        else if (!isLive && since) {
          banked += (now - since) / 1000;
          since = 0;
        }
        draw(now);
        wake();
      },
      reset() {
        banked = 0;
        since = 0;
        draw(performance.now());
      },
      seek(s) {
        const now = performance.now();
        banked = s;
        if (since) since = now;
        draw(now);
      },
      kick(n) {
        if (reduced) return;
        env = Math.max(env, Math.min(1, 0.5 + n / 24));
        wake();
      },
    };
    draw(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      visibility.disconnect();
    };
  }, []);

  // A change of state starts, holds or zeroes the clock. A live state entered from an end is a fresh run.
  const was = useRef<AgentState | null>(null);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = state;
    if (state === "ready") engine.current!.reset();
    else engine.current!.go(isLive(state), isLive(state) && isEnd(from));
  }, [state]);

  // After the state's effect, so a restored time lands on the clock it set up.
  useLayoutEffect(() => {
    if (elapsed !== undefined) engine.current!.seek(elapsed);
  }, [elapsed]);

  const tokensWere = useRef(tokens);
  useEffect(() => {
    const from = tokensWere.current;
    tokensWere.current = tokens;
    if (tokens !== undefined && from !== undefined && tokens > from) engine.current!.kick(tokens - from);
  }, [tokens]);

  // The step line types on, a letter per step, as a new one arrives.
  const typed = useRef(line);
  useLayoutEffect(() => {
    if (typed.current === line) return;
    typed.current = line;
    const el = lineRef.current;
    if (!el || !line || reducedMotion()) return;
    el.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
      duration: Math.min(480, Math.max(160, line.length * 18)),
      easing: `steps(${Math.min(line.length, 48)})`,
    });
  }, [line]);

  // One cue per change; none on mount. A key that already played its cue isn't heard twice.
  const cue = useEffectEvent((from: AgentState, lineChanged: boolean) => {
    const next = soundFor(from, state, lineChanged, track.tools);
    const skip = heard.current;
    heard.current = null;
    if (next && next[0] !== skip) sound(...next);
  });
  const shown = useRef({ state, line });
  useEffect(() => {
    const from = shown.current;
    if (from.state === state && from.line === line) return;
    shown.current = { state, line };
    cue(from.state, from.line !== line);
  }, [state, line]);

  /* --- Keys --------------------------------------------------------------- */

  function act(key: AgentKey) {
    if (key === "stop" && canStop) {
      heard.current = "stop";
      sound("stop", { gain: 0.8 });
      onStop?.();
    } else if (key === "run" && canRun) {
      heard.current = "start";
      sound("start", { gain: 0.8 });
      onRun?.();
    } else if (key === "allow" && waiting) onAllow?.();
  }

  /** Shows a key held down, or let up. */
  function hold(key: AgentKey, down: boolean) {
    rootRef.current?.querySelector(`[data-key="${key === "allow" ? "allow" : "cap"}"]`)?.toggleAttribute("data-pressed", down);
  }

  useImperativeHandle(ref, () => ({
    press(key) {
      hold(key, true);
      setTimeout(() => hold(key, false), 140);
      // ALLOW clicks through `data-sound` under a hand; pressed from outside, it clicks here.
      if (key === "allow" && waiting) {
        sound("press", { gain: 0.7 });
        setTimeout(() => sound("release", { gain: 0.6 }), 140);
      }
      act(key);
    },
  }));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Escape stops a run; with nothing to stop it's left alone, so a host can take the keyboard back.
    if (e.key !== "Escape" || !canStop) return;
    e.preventDefault();
    if (e.repeat) return;
    hold("stop", true);
    act("stop");
  }

  function onKeyUp(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") hold("stop", false);
  }

  /** Focus follows the hand: no ring, and the keys pick up where it left off. */
  const focusOnPress = (e: PointerEvent<HTMLElement>) => {
    if (e.button === 0) focusQuietly(e.currentTarget);
  };

  /* --- Render ------------------------------------------------------------- */

  const lightOf = (phase: Phase): Light => {
    if (phase === track.at && state !== "done") return live ? "fire" : waiting ? "hold" : state === "error" ? "fault" : "set";
    return track.seen.includes(phase) && state !== "ready" ? "set" : "off";
  };
  const word = state === "tool" && track.tools ? `Tool ${track.tools}` : { ready: "Ready", thinking: "Thinking", tool: "Tool", writing: "Writing", waiting: "Waiting", done: "Done", error: "Error", stopped: "Stopped" }[state];
  const said = track.said ? sayFor(state, line) : "";
  const allow = !!onAllow;
  const unit = cx("ml-[0.1em] mr-[0.45em] text-[0.3em] font-normal text-(--device-lcd-dim) last:mr-0", dimmed);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onPointerDownCapture={() => (touched.current = true)}
      onKeyDownCapture={() => (touched.current = true)}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className={cx(
        "@container/agent grid w-full items-center gap-x-[0.6em] gap-y-[0.8em]",
        allow ? "grid-cols-[minmax(0,1fr)_auto] @[24rem]/agent:grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
    >
      {/* The readout: an LCD in a well. It mirrors what the live region says, so it stays out of the reading order. */}
      <div data-part="well" className={cx("rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)", allow ? "col-span-2 @[24rem]/agent:col-span-3" : "col-span-2")}>
        <div
          aria-hidden
          data-part="lcd"
          className="relative flex flex-col gap-[0.5em] overflow-hidden rounded-[0.7em] px-[0.8em] pb-[0.65em] pt-[0.6em] text-(--device-lcd-ink) [background:var(--device-lcd)] shadow-(--device-lcd-edge)"
        >
          <div className="flex items-center gap-[0.55em]">
            <span data-part="chip" className="inline-flex shrink-0 items-center gap-[0.35em] rounded-[0.4em] bg-white px-[0.42em] py-[0.24em] text-black">
              <ChipGlyph state={state} />
              <span className="text-[0.58em] font-semibold uppercase leading-none tracking-[0.02em] tabular-nums">{word}</span>
            </span>
            {tokens !== undefined && state !== "ready" && (
              <span className={cx("ml-auto truncate text-[0.66em] tabular-nums text-(--device-lcd-dim)", dimmed)}>{thousands(tokens)} tokens</span>
            )}
          </div>

          {/* The clock: the frame loop writes the figures; the units stay put. */}
          <p
            ref={clockRef}
            className={cx(
              "flex items-baseline whitespace-nowrap text-[2.1em] font-light leading-none tracking-[-0.03em] tabular-nums transition-colors duration-(--duration-exit) @[24rem]/agent:text-[2.35em]",
              waiting && cx("text-(--device-lcd-dim)", dimmed),
            )}
          >
            <span>00</span>
            <span className={unit}>M</span>
            <span>00</span>
            <span className={unit}>S</span>
            <span>00</span>
            <span className={unit}>F</span>
          </p>

          <p className={cx("h-[1.25em] min-w-0 text-[0.92em] leading-[1.25] tracking-[-0.01em]", state === "stopped" && cx("text-(--device-lcd-dim)", dimmed))}>
            <span ref={lineRef} id={`${ids}-line`} className="inline-block max-w-full truncate align-top">
              {step?.verb}
              {step?.target && <span className={cx("text-(--device-lcd-dim)", dimmed)}> {step.target}</span>}
              {state === "writing" && (
                <span className="ml-[0.12em] inline-block h-[0.95em] w-[0.08em] translate-y-[0.14em] animate-caret bg-current motion-reduce:animate-none drawn:bg-(--device-draw-ink)!" />
              )}
            </span>
          </p>
        </div>
      </div>

      {/* The phases: each latches once the run has passed it; the one firing flickers with the tokens. */}
      <div
        aria-hidden
        className={cx(
          "flex items-center justify-between px-[0.4em]",
          allow ? "col-span-2 @[24rem]/agent:col-span-1 @[24rem]/agent:justify-start @[24rem]/agent:gap-[1.2em]" : "justify-start gap-[1.2em]",
        )}
      >
        {PHASES.map(({ key, name }) => (
          <span key={key} data-light={lightOf(key)} className="group/light flex items-center gap-[0.5em]">
            <span data-part="well" className="grid size-[0.78em] shrink-0 place-items-center rounded-full bg-black/[0.05] shadow-(--device-recess) dark:bg-black/40">
              <span data-part="light" className="relative size-[0.44em] rounded-full bg-(--device-meter-off) transition-[background-color] duration-(--duration-exit) group-data-[light=fault]/light:bg-(--device-rec) group-data-[light=fault]/light:duration-0 group-data-[light=fire]/light:bg-(--device-rec) group-data-[light=fire]/light:duration-0 group-data-[light=hold]/light:bg-(--device-hold) group-data-[light=hold]/light:duration-0 group-data-[light=set]/light:bg-(--device-meter-on) drawn:group-data-[light=set]/light:bg-(--device-draw-ink)!">
                {/* The glow on its own layer, so the flicker is never smoothed by the light's fade. Drawn, it is the fill that fires: red while firing or faulting (the flicker is its strength), ink while held. */}
                <span className="absolute inset-0 rounded-full opacity-0 shadow-[0_0_0.45em_var(--device-rec)] transition-opacity duration-(--duration-exit) group-data-[light=fault]/light:opacity-100 group-data-[light=fire]/light:opacity-(--act) group-data-[light=fire]/light:transition-none group-data-[light=hold]/light:opacity-100 group-data-[light=hold]/light:shadow-[0_0_0.5em_var(--device-hold)] drawn:bg-(--device-rec)! drawn:group-data-[light=hold]/light:bg-(--device-draw-ink)!" />
              </span>
            </span>
            <span data-part="lettering" className={cx(engraved, "text-[0.6em] text-(--device-label-quiet) group-data-[light=fault]/light:text-(--device-label) group-data-[light=fire]/light:text-(--device-label) group-data-[light=hold]/light:text-(--device-label)")}>
              {name}
            </span>
          </span>
        ))}
      </div>

      {/* ALLOW: its light glows while a call waits on you. */}
      {allow && (
        <button
          type="button"
          data-key="allow"
          data-sound="key"
          aria-disabled={!waiting}
          aria-describedby={`${ids}-line`}
          tabIndex={waiting ? 0 : -1}
          onPointerDown={(e) => waiting && focusOnPress(e)}
          onClick={() => act("allow")}
          data-part="key"
          className={cx("group/key min-w-0 rounded-[0.7em] outline-offset-2 @[24rem]/agent:w-[7.5em]", !waiting && "cursor-default")}
        >
          <span
            className={cx(
              "relative grid h-[2.7em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out",
              waiting && sink,
            )}
          >
            <span
              aria-hidden
              data-part="light"
              className={cx(
                "absolute left-1/2 top-[0.42em] h-[0.24em] w-[2.3em] -translate-x-1/2 rounded-full",
                waiting ? "bg-(--device-hold) shadow-[0_0_0.45em_var(--device-hold)] drawn:bg-(--device-draw-ink)!" : "bg-(--device-meter-off) transition-[background-color] duration-(--duration-exit)",
              )}
            />
            <span data-part="lettering" className="mt-[0.45em] text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">Allow</span>
          </span>
        </button>
      )}

      {/* The transport: STOP while it runs or waits, PLAY to run it again. A white cap in a collar. */}
      <button
        type="button"
        data-key="cap"
        aria-label={cap}
        aria-disabled={!canStop && !canRun}
        aria-keyshortcuts={canStop ? "Escape" : undefined}
        tabIndex={canStop || canRun ? 0 : -1}
        onPointerDown={focusOnPress}
        onClick={() => act(canStop ? "stop" : "run")}
        data-part="collar"
        className={cx("group/key grid size-[3.3em] shrink-0 place-items-center rounded-full bg-black/[0.035] p-[0.26em] shadow-(--device-recess) outline-offset-2 dark:bg-black/30", allow ? "col-start-2 @[24rem]/agent:col-start-3" : "col-start-2")}
      >
        <span data-part="cap" className={cx("grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out", (canStop || canRun) && sink)}>
          {canStop ? (
            <span aria-hidden data-part="lettering" className="size-[0.85em] rounded-[0.14em] bg-(--device-key-ink) drawn:bg-(--device-draw-ink)!" />
          ) : (
            <svg aria-hidden data-part="lettering" viewBox="0 0 16 16" className="ml-[0.12em] size-[1.2em] fill-(--device-rec)">
              <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />
            </svg>
          )}
        </span>
      </button>

      {/* Said once per change; the paragraph is keyed so the same words can be said again. */}
      <div role="status" className="sr-only">
        <p key={track.said}>{state === "error" ? "" : said}</p>
      </div>
      <p role="alert" className="sr-only">
        {state === "error" ? said : ""}
      </p>
    </div>
  );
}

/* --- Demo: an agent tidying a recorder's session, and a ghost at the keys ------ */

type Cue = { wait: number; state: AgentState; verb: string; target?: string } | { wait: number; ghost: "stop" };
type Script = { task: AgentStep; cues: Cue[]; retry?: Cue[] };

const cue = (wait: number, state: AgentState, verb: string, target?: string): Cue => ({ wait, state, verb, target });

const RUNS: Script[] = [
  {
    task: { verb: "Tidy", target: "session_12" },
    cues: [
      cue(0, "thinking", "Planning", "the tidy-up"),
      cue(950, "tool", "Read", "take_04.wav"),
      cue(600, "tool", "Search", "room tone · 6 takes"),
      cue(600, "thinking", "Comparing", "take_02, take_03"),
      cue(650, "tool", "Delete", "take_03.wav"),
      cue(120, "waiting", "Delete", "take_03.wav"),
      // Allowed: the same call goes on.
      cue(0, "tool", "Delete", "take_03.wav"),
      cue(600, "tool", "Trim", "take_04.wav · 1.8 s"),
      cue(600, "writing", "Writing", "session notes"),
      cue(1700, "done", "Tidied", "5 takes · 1 deleted"),
    ],
  },
  {
    task: { verb: "Export", target: "take_05.wav" },
    cues: [
      cue(0, "thinking", "Planning", "the export"),
      cue(900, "tool", "Normalize", "take_05.wav · −1 dB"),
      cue(700, "tool", "Export", "take_05.wav · 48 kHz"),
      cue(1100, "error", "Card full", "2.1 GB short"),
    ],
    retry: [
      cue(0, "thinking", "Freeing", "2.1 GB"),
      cue(800, "tool", "Move", "take_01–03 to SSD"),
      cue(700, "tool", "Export", "take_05.wav · 48 kHz"),
      cue(900, "done", "Exported", "take_05.wav"),
    ],
  },
  {
    task: { verb: "Write", target: "notes for take_04" },
    cues: [
      cue(0, "thinking", "Planning", "the notes"),
      cue(800, "tool", "Read", "markers · take_04"),
      cue(600, "writing", "Writing", "notes for take_04"),
      // The ghost stops it mid-stream; under a hand, the agent finishes.
      { wait: 1500, ghost: "stop" },
      cue(1500, "done", "Wrote", "notes · 212 words"),
    ],
  },
];

/** How long the ghost waits at each state before it presses a key. */
const GHOST: Partial<Record<AgentState, number>> = { ready: 700, waiting: 1500, error: 2200, done: 2600, stopped: 2000 };
const FIRST_PRESS = 280; // ms: the first RUN lands while the plate is still entering

/** Tokens per 90ms chunk: a thinking trickle, a writing stream. */
const chunk = (state: AgentState) => (state === "writing" ? 8 + Math.floor(Math.random() * 13) : 3 + Math.floor(Math.random() * 7));

export default function Demo() {
  const [state, setState] = useState<AgentState>("ready");
  const [step, setStep] = useState<AgentStep>(RUNS[0].task);
  const [tokens, setTokens] = useState(0);
  const [elapsed, setElapsed] = useState<number>();
  const [run, setRun] = useState(0);
  const [ghost, setGhost] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const status = useRef<AgentStatusHandle>(null);
  const agent = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rest = useRef<Cue[]>([]); // what the agent does once it's allowed to go on
  const live = useRef(false); // the ghost is at the keys
  const touched = useRef(false); // a real hand has been here: the ghost doesn't come back
  const first = useRef(true);

  /** The agent works through its cues; a call that needs your OK waits there. */
  function perform(cues: Cue[]) {
    clearTimeout(agent.current);
    const [next, ...more] = cues;
    if (!next) return;
    const go = () => {
      if ("ghost" in next) {
        if (live.current) status.current?.press("stop");
        else perform(more);
        return;
      }
      setState(next.state);
      setStep({ verb: next.verb, target: next.target });
      if (next.state === "waiting") rest.current = more;
      else perform(more);
    };
    if (next.wait) agent.current = setTimeout(go, next.wait);
    else go();
  }

  function start(cues: Cue[]) {
    setTokens(0);
    perform(cues);
  }

  function onRun() {
    if (state === "error") return start(RUNS[run].retry ?? RUNS[run].cues);
    if (state === "ready") return start(RUNS[run].cues);
    const next = (run + 1) % RUNS.length;
    setRun(next);
    start(RUNS[next].cues);
  }

  function onStop() {
    clearTimeout(agent.current);
    setState("stopped");
  }

  /** Puts the next task up on the readout. */
  function cueUp() {
    const next = (run + 1) % RUNS.length;
    setRun(next);
    setState("ready");
    setStep(RUNS[next].task);
    setTokens(0);
  }

  /** Any real input takes over from the ghost, for good. The run in flight finishes, or waits for the hand. */
  function takeOver() {
    touched.current = true;
    if (!live.current) return;
    live.current = false;
    setGhost(false);
  }

  // Tokens arrive in chunks while it thinks or writes; a tool call is quiet.
  useEffect(() => {
    if (state !== "thinking" && state !== "writing") return;
    const id = setInterval(() => setTokens((t) => t + chunk(state)), 90);
    return () => clearInterval(id);
  }, [state]);

  // The ghost: RUN on a ready task, ALLOW on a call that waits, RETRY on an error, then the next task.
  const press = useEffectEvent(() => {
    if (!live.current) return;
    if (state === "ready" || state === "error") status.current?.press("run");
    else if (state === "waiting") status.current?.press("allow");
    else if (state === "done" || state === "stopped") cueUp();
  });
  useEffect(() => {
    if (!ghost || GHOST[state] === undefined) return;
    const wait = state === "ready" && first.current ? FIRST_PRESS : GHOST[state];
    first.current = false;
    const id = setTimeout(press, wait);
    return () => clearTimeout(id);
  }, [ghost, state, run]);

  // On power-up the ghost runs the first task, unless the host's tape is stopped: then it waits for PLAY.
  // Under reduced motion it shows one still frame, a call waiting on you, for the hand to answer.
  const powerUp = useEffectEvent(() => {
    if (reducedMotion()) {
      const at = RUNS[0].cues.findIndex((c) => "state" in c && c.state === "waiting");
      rest.current = RUNS[0].cues.slice(at + 1);
      setState("waiting");
      setStep({ verb: "Delete", target: "take_03.wav" });
      setTokens(412);
      setElapsed(4.48);
      return;
    }
    if (touched.current || live.current || hostTransport(rootRef.current) === "stop") return;
    live.current = true;
    setGhost(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const id = setTimeout(powerUp, 0);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    const pending = agent;
    return () => {
      clearTimeout(id);
      observer.disconnect();
      clearTimeout(pending.current);
      live.current = false;
    };
  }, []);

  return (
    <div ref={rootRef} onPointerDownCapture={takeOver} onKeyDownCapture={takeOver} onFocusCapture={takeOver} className="@container w-full max-w-[440px] select-none">
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />
        <AgentStatus
          ref={status}
          state={state}
          step={step}
          tokens={tokens}
          elapsed={elapsed}
          onRun={onRun}
          onStop={onStop}
          onAllow={() => perform(rest.current)}
        />
      </div>
    </div>
  );
}
