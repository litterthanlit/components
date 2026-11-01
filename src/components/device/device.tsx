"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { setTheme, useTheme } from "@/components/gallery/theme-toggle";
import { VOLUME_DEFAULT, VOLUME_MAX, getVolume, isMuted, play, setMuted, setVolume, subscribeMuted, subscribeVolume } from "@/lib/sound";
import { site } from "@/site.config";
import { Dial, type DialButton } from "./dial";
import { takeLength, takeLengths, usePageVisible, useReducedMotion } from "./hooks";
import { Readout, type Transport } from "./readout";
import { AppStage, Chevron, Choice, HomeAbout, Hud, InfoSheet, Panel, ScreenList, TakeArt, TakeWave, VolumeBar, type ListItem, type Study } from "./screen";
import { Tape } from "./tape";

const SETTLE = 450; // ms the dial or tape has to rest before the study it reached opens
const HOLD_AFTER_TOUCH = 2500; // ms the tape waits after a hand or key works the study on screen

type View = "take" | "home" | "options" | "find";
type Control = "up" | "down" | "prev" | "next" | "ok" | "play" | "stop" | "find" | "home" | "back" | "options";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const titles: Record<Exclude<View, "take">, string> = { home: "Home", options: "Options", find: "Find" };

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;
const onOff = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;
const lengths = takeLengths.map((value) => ({ value, label: `${value} s` }));

type Option = "theme" | "sound" | "volume" | "take";
const options: { key: Option; label: string }[] = [
  { key: "theme", label: "Theme" },
  { key: "sound", label: "Sound" },
  { key: "volume", label: "Volume" },
  { key: "take", label: "Time per study" },
];

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="fill-none stroke-current [stroke-linecap:round] [stroke-width:1.5]">
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.2 10.2 3.3 3.3" />
    </svg>
  );
}


/**
 * What the dial's centre shows: PLAY or pause on a take, OK on a list. Printed
 * in the dial's grey like every other legend on it; the LCD's chip and the
 * light beside the mark are what turn red while the tape runs.
 */
function CentreGlyph({ take, playing }: { take: boolean; playing: boolean }) {
  if (!take)
    return (
      <span aria-hidden className="text-[max(8px,4.4cqw)] font-semibold tracking-[0.08em] opacity-75 [text-shadow:var(--device-dial-engrave)]">
        OK
      </span>
    );
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[7cqw] fill-current [filter:var(--device-dial-engrave-glyph)]">
      {playing ? <path d="M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z" /> : <path d="M5 2.4 13.4 8 5 13.6z" />}
    </svg>
  );
}

/**
 * The home page: a player after a field recorder, whose screen runs the
 * studies, one at a time and full width. Under the screen, the tape lays
 * every study end to end as a take with its own waveform, and a red playhead
 * marks the one on screen. Under that, the deck: an LCD with the take
 * number, three keys, and the dial, whose centre is PLAY, with STOP beside it.
 *
 * Driving it: the dial's arrows (or ← →) step through studies, turning it
 * (or dragging along the tape) scrubs, and PLAY, at the dial's centre, rolls
 * the tape so each study plays for a few seconds before the next. STOP
 * rewinds the study to its first frame. The title on the screen (or Enter)
 * shows what the study is; ↑ ↓ set the volume. HOME (Find is on it, and on
 * /) and OPTIONS bring up screens of their own, which the dial then drives,
 * its centre turning into OK.
 * A running study keeps its own keys, except an Escape it leaves unhandled.
 * Every press clicks (src/lib/sound.ts); M, or Options › Sound, mutes it.
 *
 * Only the study on screen is ever mounted.
 */
export function Device({ studies }: { studies: Study[] }) {
  const n = studies.length;
  const [at, setAt] = useState(0); // the take on screen
  const [pending, setPending] = useState<number | null>(null); // dialled or scrubbed to, not yet open
  const [from, setFrom] = useState(1); // which side the take on screen came in from
  const [replay, setReplay] = useState(0);
  const [view, setView] = useState<View>("take");
  const [info, setInfo] = useState(false);
  const [transport, setTransport] = useState<Transport>("pause");
  const [cursor, setCursor] = useState(0); // highlighted row on a panel
  const [query, setQuery] = useState("");
  const [hud, setHud] = useState<number | null>(null); // when the volume last changed, while its pop-up shows
  const [flash, setFlash] = useState<Control | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeVolume, getVolume, () => VOLUME_DEFAULT);
  const take = takeLength.use();
  const takeSeconds = Number(take);
  const reduced = useReducedMotion();
  const pageVisible = usePageVisible();
  const theme = useTheme();
  const router = useRouter();
  const ids = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const homeList = useRef<HTMLDivElement>(null);
  const optionsList = useRef<HTMLDivElement>(null);
  const findList = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const refocus = useRef<View | "controls" | null>(null);
  const pos = useRef(0); // the playhead, in takes: 2.5 is halfway through the third
  const atRef = useRef(0); // `at`, ahead of the render that shows it, for the tape's frame loop
  const scrubbing = useRef(false);
  const lastTouch = useRef(0);
  const woke = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dialled = pending ?? at;
  const study = studies[dialled];
  const playing = transport === "play";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return studies
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !q || s.title.toLowerCase().includes(q) || s.tagline.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)));
  }, [query, studies]);

  /* --- The playhead ------------------------------------------------------ */

  /** Writes the playhead to the page as `--p`, for the tape. */
  function paint() {
    rootRef.current?.style.setProperty("--p", clamp(pos.current / n, 0, 1).toFixed(5));
  }
  useLayoutEffect(paint);

  /** Puts a take on screen. `dir` is the side it comes in from; `progress` where in it the playhead sits. */
  function go(i: number, { dir = Math.sign(i - atRef.current) || 1, progress = 0, say = true } = {}) {
    atRef.current = i;
    pos.current = i + progress;
    setFrom(dir);
    setAt(i);
    setPending(null);
    paint();
    if (say) announce(`${studies[i].title}, ${i + 1} of ${n}`);
  }

  // While the tape plays, the playhead runs through the take and on into the next.
  const frame = useEffectEvent((now: number, dt: number) => {
    if (pending !== null || scrubbing.current || view !== "take" || info || now - lastTouch.current < HOLD_AFTER_TOUCH) return;
    pos.current += dt / (takeSeconds * 1000);
    if (pos.current >= atRef.current + 1) go((atRef.current + 1) % n, { dir: 1 });
    else paint();
  });
  useEffect(() => {
    if (!playing || !pageVisible) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frame(now, Math.min(100, now - last));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, pageVisible]);

  // A take dialled or scrubbed to opens once the hand rests.
  const settle = useEffectEvent(() => {
    if (pending === null) return;
    go(pending, { progress: scrubbing.current ? pos.current - pending : 0 });
  });
  useEffect(() => {
    if (pending === null) return;
    const id = setTimeout(settle, SETTLE);
    return () => clearTimeout(id);
  }, [pending]);

  // The volume's pop-up fades 1.1 s after the last change. A take dialled to says itself on the readout, so it has no pop-up.
  useEffect(() => {
    if (hud === null) return;
    const id = setTimeout(() => setHud(null), 1100);
    return () => clearTimeout(id);
  }, [hud]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Focus follows the screen it was on, so it is never left on an inert layer.
  useLayoutEffect(() => {
    const to = refocus.current;
    refocus.current = null;
    const el =
      to === "home" ? homeList.current : to === "options" ? optionsList.current : to === "find" ? findInput.current : to === "controls" ? sliderRef.current : null;
    el?.focus({ preventScroll: true });
  }, [view, info]);

  /* --- Moves -------------------------------------------------------------- */

  function announce(text: string) {
    setAnnouncement(text);
  }

  function wake() {
    if (woke.current) return;
    woke.current = true;
    play("wake");
  }

  const showHud = () => setHud(performance.now());

  function step(delta: number) {
    const current = pending ?? at;
    const next = clamp(current + delta, 0, n - 1);
    if (next === current) return play("bump");
    go(next, { dir: delta });
  }

  function turn(steps: number) {
    if (view !== "take") return moveCursor(steps);
    const current = pending ?? at;
    const next = clamp(current + steps, 0, n - 1);
    if (next === current) return play("bump");
    play("tick", { pitch: 0.97 + Math.random() * 0.06 });
    pos.current = next;
    paint();
    setPending(next === at ? null : next);
  }

  function scrub(f: number) {
    wake();
    scrubbing.current = true;
    if (view !== "take") closeView(false);
    pos.current = f * n;
    paint();
    const reached = Math.min(n - 1, Math.floor(pos.current));
    if (reached !== (pending ?? at)) {
      play("tick", { pitch: 0.97 + Math.random() * 0.06 });
      setPending(reached === at ? null : reached);
    }
  }

  function scrubEnd() {
    scrubbing.current = false;
    if (pending !== null) go(pending, { progress: pos.current - pending });
    else announce(`${studies[at].title}, ${at + 1} of ${n}`);
  }

  function nudgeVolume(delta: number) {
    const next = clamp(volume + delta, 0, VOLUME_MAX);
    if (next === volume) return play("bump");
    setVolume(next); // set first, so the tick is heard at the new level
    play("tick", { pitch: 0.9 + next * 0.02 });
    showHud();
    announce(`Volume ${next} of ${VOLUME_MAX}`);
  }

  function togglePlay() {
    if (view !== "take") closeView(false);
    setInfo(false);
    if (playing) {
      setTransport("pause");
      play("stop", { gain: 0.55, pitch: 1.25 });
      announce("Paused");
    } else {
      // A stopped tape starts the take it rewound.
      lastTouch.current = 0;
      setTransport("play");
      play("start");
      announce(`Playing. A new study every ${takeSeconds} seconds.`);
    }
  }

  function stop() {
    if (view !== "take") closeView(false);
    setInfo(false);
    const i = pending ?? at;
    go(i, { dir: 1, say: false });
    setReplay((r) => r + 1);
    setTransport("stop");
    play("stop");
    announce(`Stopped. ${studies[i].title} from the start.`);
  }

  /** Sound on or off: Options › Sound, and M. The toggle clicks while sound is on, so it's heard either way. */
  function toggleSound(off = !muted) {
    if (off) play("toggle");
    setMuted(off);
    if (!off) play("toggle");
    announce(off ? "Sound off" : "Sound on");
  }

  /* --- Panels ------------------------------------------------------------- */

  // Home is a menu: every row opens something, so only the one that leaves the player carries a mark.
  const homeItems: (ListItem & { text: string })[] = [
    { key: "now", text: "Now playing", label: "Now playing", detail: studies[at].title },
    { key: "find", text: "Find a study", label: "Find a study" },
    { key: "options", text: "Options", label: "Options" },
    { key: "system", text: "Design system", label: "Design system" },
    { key: "portfolio", text: "litt.design", label: "litt.design", trailing: <Chevron external /> },
  ];

  const optionValue = (key: Option) =>
    key === "theme" ? (
      <Choice value={theme} options={themes} />
    ) : key === "sound" ? (
      <Choice value={muted ? "off" : "on"} options={onOff} />
    ) : key === "volume" ? (
      <VolumeBar volume={volume} onSet={(v) => setVolumeFromPanel(v)} />
    ) : (
      <Choice value={take} options={lengths} />
    );
  const optionItems: (ListItem & { text: string })[] = options.map((o) => ({ key: o.key, text: o.label, label: o.label, trailing: optionValue(o.key) }));

  // Find reads as a track list: the cover, the title over its tagline, a tag, and the take number where a length would be.
  const findItems: (ListItem & { text: string })[] = results.map(({ s, i }) => ({
    key: s.slug,
    text: s.title,
    art: <TakeArt slug={s.slug} className="size-[34px] @[640px]/display:size-[38px]" />,
    label: <span className="font-medium">{s.title}</span>,
    sub: s.tagline,
    detail: s.tags[0] && <span className="text-[10px] font-medium uppercase tracking-[0.14em]">{s.tags[0]}</span>,
    trailing: <span className="w-[2ch] shrink-0 text-right text-[12px] tabular-nums opacity-60">{String(i + 1).padStart(2, "0")}</span>,
  }));

  const items = view === "home" ? homeItems : view === "options" ? optionItems : view === "find" ? findItems : [];

  function setVolumeFromPanel(v: number) {
    setCursor(options.findIndex((o) => o.key === "volume"));
    if (v === volume) return;
    setVolume(v);
    play("tick", { pitch: 0.9 + v * 0.02 });
    announce(`Volume ${v} of ${VOLUME_MAX}`);
  }

  function openView(next: Exclude<View, "take">) {
    if (view === next) return closeView();
    setView(next);
    setInfo(false);
    setCursor(0);
    if (next === "find") setQuery("");
    refocus.current = next;
    play("open");
    announce(next === "find" ? "Find a study. Type to filter, Enter opens." : `${titles[next]}. Up and Down move, Enter chooses, Escape goes back.`);
  }

  function closeView(sound = true) {
    if (view === "take") return;
    if (rootRef.current?.querySelector("[data-open]")?.contains(document.activeElement)) refocus.current = "controls";
    setView("take");
    if (sound) play("close");
    announce(`${studies[at].title}, ${at + 1} of ${n}`);
  }

  function back() {
    if (view !== "take") return closeView();
    if (info) return toggleInfo();
    play("bump");
  }

  function toggleInfo() {
    if (info && rootRef.current?.querySelector("[data-open]")?.contains(document.activeElement)) refocus.current = "controls";
    setInfo(!info);
    play(info ? "back" : "select");
    announce(info ? `${studies[at].title}, ${at + 1} of ${n}` : `About ${studies[at].title}: ${studies[at].description}`);
  }

  function moveCursor(delta: number) {
    if (!items.length) return play("bump");
    const next = clamp(cursor + delta, 0, items.length - 1);
    if (next === cursor) return play("bump");
    play("tick", { pitch: 0.97 + Math.random() * 0.06 });
    setCursor(next);
  }

  function adjust(option: Option, delta: number) {
    if (option === "theme") {
      play("toggle");
      setTheme(theme === "dark" ? "light" : "dark");
    } else if (option === "sound") toggleSound();
    else if (option === "volume") nudgeVolume(delta);
    else {
      const next = takeLengths[(takeLengths.indexOf(take) + delta + takeLengths.length) % takeLengths.length];
      play("tick");
      takeLength.write(next);
      announce(`${next} seconds per study`);
    }
  }

  function choose(i = cursor) {
    if (view === "home") {
      const key = homeItems[i]?.key;
      if (key === "now") closeView();
      else if (key === "find") openView("find");
      else if (key === "options") openView("options");
      else if (key === "system") router.push("/system");
      else if (key === "portfolio") window.location.assign(site.links.portfolio);
    } else if (view === "options") {
      const option = options[i].key;
      if (option === "volume") return play("bump");
      adjust(option, 1);
    } else if (view === "find") {
      const hit = results[i];
      if (!hit) return play("bump");
      play("select");
      closeView(false);
      go(hit.i);
    }
  }

  function pick(i: number) {
    wake();
    if (i !== cursor) {
      play("tick", { pitch: 0.97 + Math.random() * 0.06 });
      setCursor(i);
    }
    if (view === "options" && options[i].key === "volume") return;
    if (view !== "options") play("select");
    choose(i);
  }

  /* --- Controls ------------------------------------------------------------ */

  function press(control: Control) {
    wake();
    switch (control) {
      case "prev":
      case "next": {
        const delta = control === "next" ? 1 : -1;
        if (view === "take") return step(delta);
        if (view === "options") return adjust(options[cursor].key, delta);
        return play("bump");
      }
      case "up":
      case "down":
        if (view === "take") return nudgeVolume(control === "up" ? 1 : -1);
        return moveCursor(control === "down" ? 1 : -1);
      case "ok":
        if (view === "take") return toggleInfo();
        if (view !== "options") play("select");
        return choose();
      case "play":
        return togglePlay();
      case "stop":
        return stop();
      case "back":
        return back();
      default:
        return openView(control);
    }
  }

  /** A press from the keyboard: the control shows pressed and clicks down and up. */
  function keyPress(control: Control) {
    setFlash(control);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      play("release");
    }, 110);
    play("press");
    press(control);
  }

  /* --- Keyboard ------------------------------------------------------------ */

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as Element;
    const root = rootRef.current;
    if (!root) return;
    // A running study keeps its keys; an Escape it leaves alone hands the keyboard back to the controls.
    if (target.closest("[data-app]")) {
      lastTouch.current = performance.now();
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        sliderRef.current?.focus({ preventScroll: true });
        announce("Controls. Left and Right change study.");
      }
      return;
    }
    if (e.defaultPrevented || (target !== document.body && !root.contains(target))) return;
    // In the search field only the keys that drive the list are ours.
    const typing = target.matches("input, textarea, select");
    if (typing && !["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
    // Enter and Space on a focused button or link stay native.
    const native = !typing && target.matches("button, a");
    wake();
    switch (e.key) {
      case "ArrowLeft":
        keyPress("prev");
        break;
      case "ArrowRight":
        keyPress("next");
        break;
      case "ArrowUp":
        keyPress("up");
        break;
      case "ArrowDown":
        keyPress("down");
        break;
      case "Enter":
        if (native || e.repeat) return;
        keyPress("ok");
        break;
      case " ":
        if (native || e.repeat) return;
        keyPress("play");
        break;
      case "Escape":
      case "Backspace":
        keyPress("back");
        break;
      case "/":
        keyPress("find");
        break;
      case "Home":
      case "End":
        if (view !== "take") return;
        if ((e.key === "Home" ? 0 : n - 1) === dialled) play("bump");
        else go(e.key === "Home" ? 0 : n - 1);
        break;
      case "m":
      case "M":
        toggleSound();
        break;
      case "s":
      case "S":
        keyPress("stop");
        break;
      default:
        return;
    }
    e.preventDefault();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* --- Render -------------------------------------------------------------- */

  const panelItem = items[cursor] as (ListItem & { text: string }) | undefined;
  const slider =
    view === "take"
      ? { label: "Dial: studies", now: dialled + 1, max: n, text: `${study.title}, ${dialled + 1} of ${n}` }
      : { label: `Dial: ${titles[view]}`, now: cursor + 1, max: Math.max(1, items.length), text: panelItem ? `${panelItem.text}, ${cursor + 1} of ${items.length}` : "Nothing found" };
  const hintId = `${ids}-hint`;
  // A key held on the keyboard shows on the dial: the arrows on its sides, Space or Enter on its centre.
  const dialFlash: DialButton | null =
    flash === "up" || flash === "down" || flash === "prev" || flash === "next"
      ? flash
      : flash === "stop" || (flash !== null && flash === (view === "take" ? "play" : "ok"))
        ? "centre"
        : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={`${site.name}: a player of studies`}
      onPointerDownCapture={wake}
      className="flex h-dvh w-full flex-col items-center [--m:8px] sm:[--m:14px] wide:[--m:24px] pt-[max(var(--m),env(safe-area-inset-top))] pr-[max(var(--m),env(safe-area-inset-right))] pb-[max(var(--m),env(safe-area-inset-bottom))] pl-[max(var(--m),env(safe-area-inset-left))]"
    >
      {/* The page around the object: the way to the player's screens and the study's page, off the hardware. */}
      <header className="flex h-[44px] w-full max-w-[880px] shrink-0 items-center justify-between gap-6 px-2 text-[14px] tracking-[-0.006em]">
        <span className="font-medium text-ink">{site.name}</span>
        <nav aria-label="Player" className="flex items-center gap-5 text-muted">
          <button type="button" onClick={() => press(view === "take" ? "home" : "back")} className="transition-colors hover:text-ink">
            {view === "take" ? "Menu" : "Back"}
          </button>
          {view === "take" && (
            <>
              <button type="button" aria-expanded={info} onClick={() => press("ok")} className="transition-colors hover:text-ink">
                Details
              </button>
              <Link href={`/c/${study.slug}`} aria-label={`Source: open the ${study.title} page`} className="transition-colors hover:text-ink">
                Source
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="grid min-h-0 w-full flex-1 grid-cols-1 place-items-center">
        {/* The Slab: a metal rim round one sheet of glass. Silver with pale glass in light, graphite with black glass in dark (globals.css). */}
        <div data-player className="player player-casing relative flex rounded-[30px] p-[10px] wide:rounded-[36px] wide:p-[12px]">
          <div className="player-pane relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] wide:rounded-[26px] short:grid short:grid-cols-[minmax(0,1fr)_auto] short:grid-rows-[minmax(0,1fr)_auto]">
            {/* The screen: the study runs straight on the glass, its own plate dissolved (globals.css, data-player-screen). */}
            <div data-player-screen className="@container/display relative isolate flex min-h-0 flex-1 animate-wake flex-col overflow-hidden short:col-start-1 short:row-start-1">
              <div className="relative min-h-0 flex-1">
                <div
                  ref={stageRef}
                  inert={view !== "take"}
                  onPointerDown={() => (lastTouch.current = performance.now())}
                  onPointerMove={(e) => {
                    // A drag still under way (a knob, a reel) keeps the tape waiting, however long it takes.
                    if (e.buttons) lastTouch.current = performance.now();
                  }}
                  onWheel={() => (lastTouch.current = performance.now())}
                  className="absolute inset-0"
                >
                  <div role="group" aria-label={`${studies[at].title}, running`} className="absolute inset-0">
                    <AppStage key={`${studies[at].slug}:${replay}`} study={studies[at]} from={reduced ? 0 : from} transport={transport} />
                  </div>
                  <Hud show={hud !== null}>
                    <span className="text-muted">Volume</span>
                    <VolumeBar volume={volume} />
                    <span className="w-[2ch] text-right tabular-nums text-muted">{volume}</span>
                  </Hud>
                  <InfoSheet study={studies[at]} at={at} n={n} open={info && view === "take"} onClose={toggleInfo} />
                </div>

                <Panel open={view === "home"} label="Home" className="overflow-hidden px-6 pb-3 pt-6 @[720px]/display:px-12 @[720px]/display:py-10">
                  {/* The take on the tape, its cover blown up behind the menu and fading out towards the words. */}
                  <TakeWave
                    key={studies[at].slug}
                    slug={studies[at].slug}
                    className="pointer-events-none absolute -right-[12%] top-1/2 -z-10 aspect-square h-[min(118%,96cqw)] -translate-y-1/2 animate-enter text-ink opacity-[0.055] [mask-image:linear-gradient(to_left,black_30%,transparent_78%)] dark:opacity-[0.08] @[720px]/display:-right-[4%] @[720px]/display:[mask-image:linear-gradient(to_left,black_40%,transparent_88%)]"
                  />
                  <div className="mx-auto grid h-full max-w-[1040px] grid-rows-[auto_minmax(0,1fr)] gap-4 @[720px]/display:grid-cols-[1.1fr_1fr] @[720px]/display:grid-rows-1 @[720px]/display:gap-16">
                    <HomeAbout />
                    <div className="flex min-h-0 flex-col @[720px]/display:justify-center">
                      <ScreenList
                        items={homeItems}
                        index={view === "home" ? cursor : 0}
                        label="Home"
                        idPrefix={`${ids}-home`}
                        reduced={reduced}
                        listRef={homeList}
                        onPick={pick}
                        variant="menu"
                        // The dot hangs in the margin, so the words line up with the intro.
                        className="-ml-6 min-h-[200px] flex-1 @[720px]/display:max-h-[264px] @[720px]/display:min-h-[264px]"
                      />
                    </div>
                  </div>
                </Panel>

                <Panel open={view === "options"} label="Options" className="flex flex-col px-2 py-3 @[720px]/display:px-10 @[720px]/display:py-8">
                  <ScreenList
                    items={optionItems}
                    index={view === "options" ? cursor : 0}
                    label="Options"
                    idPrefix={`${ids}-options`}
                    reduced={reduced}
                    listRef={optionsList}
                    onPick={pick}
                    className="mx-auto w-full max-w-[560px] flex-1"
                  />
                </Panel>

                <Panel open={view === "find"} label="Find a study" className="flex flex-col px-2 pt-3 @[720px]/display:px-10 @[720px]/display:pt-8">
                  <div className="mx-auto flex w-full max-w-[640px] min-h-0 flex-1 flex-col">
                    <label className="mx-2 flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] bg-panel px-3 text-muted shadow-[inset_0_0_0_1px_var(--line)] focus-within:text-ink focus-within:shadow-[inset_0_0_0_1px_var(--line-strong)]">
                      <span className="size-4">
                        <SearchGlyph />
                      </span>
                      <span className="sr-only">Find a study</span>
                      <input
                        ref={findInput}
                        type="search"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setCursor(0);
                        }}
                        placeholder="Find a study"
                        autoComplete="off"
                        spellCheck={false}
                        role="combobox"
                        aria-expanded={findItems.length > 0}
                        aria-autocomplete="list"
                        aria-controls={`${ids}-find`}
                        aria-activedescendant={findItems.length ? `${ids}-find-${cursor}` : undefined}
                        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
                      />
                      <span aria-hidden className="shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] tabular-nums">
                        {findItems.length} {findItems.length === 1 ? "study" : "studies"}
                      </span>
                    </label>
                    {findItems.length ? (
                      <ScreenList
                        items={findItems}
                        index={view === "find" ? Math.min(cursor, findItems.length - 1) : 0}
                        label="Studies"
                        idPrefix={`${ids}-find`}
                        reduced={reduced}
                        listRef={findList}
                        onPick={pick}
                        className="mt-2 flex-1"
                      />
                    ) : (
                      <p className="px-4 py-6 text-body text-muted">No study matches “{query.trim()}”.</p>
                    )}
                  </div>
                </Panel>
              </div>
            </div>

            {/* The tape, lit in the same glass under the screen. */}
            <Tape
              takes={studies}
              slider={{ label: "Tape", now: dialled + 1, max: n, text: `${study.title}, ${dialled + 1} of ${n}` }}
              hint={hintId}
              onScrub={scrub}
              onScrubEnd={scrubEnd}
              className="h-[30px] shrink-0 wide:h-[36px] short:col-start-1 short:row-start-2 short:h-[26px]"
            />

            {/* The deck, in the pane: the readout printed into it, and the dial through it in a ring of the casing's metal.
                On a phone held sideways the pane lies on its side: screen over tape at the left, readout over dial at the right. */}
            <div className="flex shrink-0 items-center gap-[1.6em] px-[1.4em] pb-[1.2em] pt-[0.4em] [font-size:clamp(9px,min(3.2vw,1.7vh),15px)] wide:px-[2em] wide:pb-[1.5em] wide:[font-size:clamp(10px,min(1.2vw,1.6vh),15px)] short:col-start-2 short:row-span-2 short:row-start-1 short:w-[11em] short:flex-col short:justify-center short:gap-[1.2em] short:px-[1em] short:py-[0.9em] short:[font-size:clamp(9px,2.8vh,12px)]">
              <Readout at={dialled} n={n} title={study.title} transport={transport} className="min-w-0 flex-1 short:w-full short:flex-none short:flex-col short:items-start short:gap-[0.5em]" />
              <div className="player-ring shrink-0 rounded-full p-[0.32em]">
                <Dial
                  flash={dialFlash}
                  onTurn={(steps) => {
                    wake();
                    turn(steps);
                  }}
                  onPress={(button) => press(button !== "centre" ? button : view === "take" ? "play" : "ok")}
                  onHold={view === "take" ? () => press("stop") : undefined}
                  labels={
                    view === "take"
                      ? { up: "Volume up", down: "Volume down", prev: "Previous study", next: "Next study", centre: `${playing ? "Pause" : "Play"}; hold to stop` }
                      : { up: "Up", down: "Down", prev: view === "options" ? "Less" : "Previous", next: view === "options" ? "More" : "Next", centre: "Choose" }
                  }
                  centre={<CentreGlyph take={view === "take"} playing={playing} />}
                  slider={slider}
                  sliderRef={sliderRef}
                  hint={hintId}
                  className="w-[max(104px,9em)] wide:w-[10.5em] short:w-[max(104px,8.5em)]"
                />
              </div>
            </div>

            {/* One sheen across the whole sheet of glass, and the backlight's bloom as it wakes. */}
            <div aria-hidden className="player-sheen pointer-events-none absolute inset-0 z-40" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-40 animate-bloom [background:radial-gradient(50%_50%_at_50%_40%,var(--screen-glow),transparent)]"
            />
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Left and Right arrows change study, Up and Down set the volume, Space plays or pauses, S stops, Enter shows details, Slash finds a study, Escape goes
        back and M mutes. On the dial, hold the centre to stop.
      </p>
      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
