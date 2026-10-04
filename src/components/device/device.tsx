"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { setTheme, useTheme } from "@/components/gallery/theme-toggle";
import { VOLUME_DEFAULT, VOLUME_MAX, getVolume, isMuted, play, setMuted, setVolume, subscribeMuted, subscribeVolume } from "@/lib/sound";
import { site } from "@/site.config";
import { Dial, type DialButton } from "./dial";
import { takeLength, takeLengths, usePageVisible, useReducedMotion } from "./hooks";
import { DeviceKey, DeviceKeyLink, FlatKey, HoldSwitch, RoundKey } from "./keys";
import { LogoWindow } from "./logo-window";
import { Readout, paintClock, type Transport } from "./readout";
import { AppStage, Chevron, Choice, HomeAbout, Hud, InfoSheet, Panel, ScreenList, StatusBar, VolumeBar, type ListItem, type Study } from "./screen";
import { Tape } from "./tape";

const SETTLE = 450; // ms the dial or tape has to rest before the study it reached opens
const HOLD_AFTER_TOUCH = 2500; // ms the tape waits after a hand or key works the study on screen

type View = "take" | "home" | "options" | "find";
type Control = DialButton | "play" | "stop" | "find" | "home" | "back" | "options";

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

const StopGlyph = () => <span aria-hidden className="size-[1.15em] rounded-[0.14em] bg-(--device-key-ink)" />;
function PlayGlyph({ playing }: { playing: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-[1.5em] fill-(--device-rec)">
      {playing ? <path d="M4 2.5h2.8v11H4zM9.2 2.5H12v11H9.2z" /> : <path d="M4.5 2.4 13.2 8l-8.7 5.6z" />}
    </svg>
  );
}

/**
 * The home page: a player after a field recorder, whose screen runs the
 * studies, one at a time and full width. Under the screen, the tape lays
 * every study end to end as a take with its own waveform, and a red playhead
 * marks the one on screen. Under that, the deck: an LCD and level meters, a
 * row of keys, a dial and the transport.
 *
 * Driving it: the dial's arrows (or ← →) step through studies, turning it
 * (or dragging along the tape) scrubs, and PLAY rolls the tape so each study
 * plays for a few seconds before the next. ↑ ↓ set the volume, OK shows what
 * the study is, STOP rewinds it to its first frame. HOME, OPTIONS and the
 * search key bring up screens of their own, which the dial then drives.
 * A running study keeps its own keys, except an Escape it leaves unhandled.
 * Every press clicks (src/lib/sound.ts); the hold switch mutes it.
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
  const [hud, setHud] = useState<{ kind: "take" | "volume"; at: number } | null>(null);
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
  const clockRef = useRef<HTMLParagraphElement>(null);
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
  const activity = useRef(0); // the hand on the screen, for the meters
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

  /** Writes the playhead to the page: `--p` for the tape and status line, digits for the LCD clock. */
  function paint() {
    rootRef.current?.style.setProperty("--p", clamp(pos.current / n, 0, 1).toFixed(5));
    paintClock(clockRef.current, pos.current * takeSeconds);
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

  // Readouts over the screen fade shortly after the last change.
  useEffect(() => {
    if (!hud || pending !== null) return;
    const id = setTimeout(() => setHud(null), 1100);
    return () => clearTimeout(id);
  }, [hud, pending]);

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

  const showHud = (kind: "take" | "volume") => setHud({ kind, at: performance.now() });

  function step(delta: number) {
    const current = pending ?? at;
    const next = clamp(current + delta, 0, n - 1);
    if (next === current) return play("bump");
    go(next, { dir: delta });
    showHud("take");
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
    showHud("take");
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
      showHud("take");
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
    showHud("volume");
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

  function toggleHold(held = !muted) {
    if (held) play("toggle");
    setMuted(held);
    if (!held) play("toggle");
    announce(held ? "Hold on: sound muted" : "Hold off: sound on");
  }

  /* --- Panels ------------------------------------------------------------- */

  const homeItems: (ListItem & { text: string })[] = [
    { key: "now", text: "Now playing", label: "Now playing", detail: studies[at].title, trailing: <Chevron /> },
    { key: "find", text: "Find a study", label: "Find a study", trailing: <Chevron /> },
    { key: "system", text: "Design system", label: "Design system", trailing: <Chevron /> },
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

  const findItems: (ListItem & { text: string })[] = results.map(({ s, i }) => ({
    key: s.slug,
    text: s.title,
    label: (
      <>
        <span className="mr-3 inline-block w-[2ch] text-[11px] tabular-nums opacity-50">{String(i + 1).padStart(2, "0")}</span>
        {s.title}
      </>
    ),
    detail: s.tagline,
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
    } else if (option === "sound") toggleHold();
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
        toggleHold();
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
  const title = view === "take" ? study.title : titles[view];

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={`${site.name}: a player of studies`}
      onPointerDownCapture={wake}
      className="flex h-dvh w-full justify-center [--m:8px] sm:[--m:14px] wide:[--m:18px] pt-[max(var(--m),env(safe-area-inset-top))] pr-[max(var(--m),env(safe-area-inset-right))] pb-[max(var(--m),env(safe-area-inset-bottom))] pl-[max(var(--m),env(safe-area-inset-left))]"
    >
      {/* The bumper: black, a polished edge catching the light. */}
      <div className="relative flex size-full max-w-[1680px] rounded-[34px] bg-(--device-rim) p-[5px] [box-shadow:var(--device-rim-edge),var(--device-body-shadow)] wide:rounded-[46px] wide:p-[8px]">
        {/* The body: near white, softly lit. */}
        <div className="relative isolate flex size-full flex-col overflow-hidden rounded-[29px] [background:var(--device-body)] shadow-(--device-body-edge) wide:rounded-[38px] short:flex-row">
          <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* The screen: full width, edge to edge under the bumper. */}
            <div className="@container/display relative isolate flex min-h-0 flex-1 animate-wake flex-col overflow-hidden bg-canvas">
              <StatusBar title={title} />

              <div className="relative min-h-0 flex-1">
                <div
                  ref={stageRef}
                  inert={view !== "take"}
                  onPointerDown={() => {
                    lastTouch.current = performance.now();
                    activity.current = Math.min(1, activity.current + 0.55);
                  }}
                  onPointerMove={(e) => {
                    activity.current = Math.min(1, activity.current + Math.hypot(e.movementX, e.movementY) / 260);
                  }}
                  onWheel={() => (lastTouch.current = performance.now())}
                  className="absolute inset-0"
                >
                  <div role="group" aria-label={`${studies[at].title}, running`} className="absolute inset-0">
                    <AppStage key={`${studies[at].slug}:${replay}`} study={studies[at]} from={reduced ? 0 : from} />
                  </div>
                  <Hud show={hud !== null}>
                    {hud?.kind === "volume" ? (
                      <>
                        <span className="text-muted">Volume</span>
                        <VolumeBar volume={volume} />
                        <span className="w-[2ch] text-right tabular-nums text-muted">{volume}</span>
                      </>
                    ) : (
                      <>
                        <span className="tabular-nums text-muted">
                          {dialled + 1} / {n}
                        </span>
                        <span className="font-medium">{study.title}</span>
                      </>
                    )}
                  </Hud>
                  <InfoSheet study={studies[at]} at={at} n={n} open={info && view === "take"} onClose={toggleInfo} />
                </div>

                <Panel open={view === "home"} label="Home" className="px-6 pb-3 pt-6 @[720px]/display:px-12 @[720px]/display:py-10">
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
                        className="-mx-4 min-h-[180px] flex-1 @[720px]/display:max-h-[200px] @[720px]/display:min-h-[190px]"
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

              {/* Glass, and the backlight's bloom as the screen wakes. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 z-40 [background:var(--screen-glass)]" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-40 animate-bloom [background:radial-gradient(50%_50%_at_50%_50%,var(--screen-glow),transparent)]"
              />
            </div>

            <Tape
              takes={studies}
              slider={{ label: "Tape", now: dialled + 1, max: n, text: `${study.title}, ${dialled + 1} of ${n}` }}
              hint={hintId}
              onScrub={scrub}
              onScrubEnd={scrubEnd}
              className="h-[38px] shrink-0 border-t border-black/[0.06] dark:border-white/[0.06] wide:h-[44px] short:h-[34px]"
            />
          </div>

          {/* The deck. Sized in em from one font size, so it scales as one piece. */}
          <div className="deck-grid shrink-0 content-center justify-center gap-x-[1.3em] gap-y-[0.8em] border-t border-black/[0.07] px-[1.1em] pb-[1.3em] pt-[1.1em] [font-size:clamp(9px,min(3.2vw,1.7vh),15px)] dark:border-white/[0.06] wide:gap-x-[3.2em] wide:px-[2.4em] wide:py-[1.7em] wide:[font-size:clamp(10px,min(1.45vw,1.6vh),16px)] roomy:gap-x-[3em] roomy:[font-size:clamp(10px,min(1.25vw,1.6vh),16px)] short:border-l short:border-t-0 short:px-[1em] short:py-[0.9em] short:[font-size:clamp(8px,2.7vh,12px)]">
            <LogoWindow
              live={playing}
              className="self-start justify-self-start [grid-area:badge] wide:self-center roomy:w-[11.5em] roomy:self-stretch roomy:justify-self-stretch"
            />
            <HoldSwitch held={muted} onChange={toggleHold} className="self-start justify-self-end [grid-area:hold] wide:self-center" />

            <Readout
              study={study}
              at={dialled}
              n={n}
              transport={transport}
              clockRef={clockRef}
              activity={activity}
              reduced={reduced}
              // Phones give its room to the screen; the screen and the HUD already say what it says.
              className="hidden [grid-area:well] wide:flex"
            />

            <div className="flex items-center justify-between gap-[0.3em] rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess) [grid-area:keys]">
              <DeviceKey aria-label="Find a study" pressed={flash === "find"} onClick={() => press("find")}>
                <SearchGlyph />
              </DeviceKey>
              <FlatKey pressed={flash === "home"} aria-pressed={view === "home"} onClick={() => press("home")}>
                Home
              </FlatKey>
              <DeviceKeyLink href={`/c/${study.slug}`} aria-label={`Source: open the ${study.title} page`}>
                Source
              </DeviceKeyLink>
              <DeviceKey pressed={flash === "options"} aria-pressed={view === "options"} onClick={() => press("options")}>
                Options
              </DeviceKey>
            </div>

            <Dial
              flash={flash === "up" || flash === "down" || flash === "prev" || flash === "next" || flash === "ok" ? flash : null}
              onTurn={(steps) => {
                wake();
                turn(steps);
              }}
              onPress={press}
              slider={slider}
              sliderRef={sliderRef}
              hint={hintId}
              labels={
                view === "take"
                  ? { up: "Volume up", down: "Volume down", prev: "Previous study", next: "Next study", ok: info ? "Hide details" : "Show details" }
                  : { up: "Up", down: "Down", prev: view === "options" ? "Less" : "Previous", next: view === "options" ? "More" : "Next", ok: "Choose" }
              }
              className="w-[12em] self-center justify-self-center [grid-area:dial] wide:w-[15em] short:w-[11em]"
            />

            {/* The transport: one column beside the dial on wide decks, either side of it on narrow ones. */}
            <div className="contents wide:flex wide:flex-col wide:items-center wide:justify-between wide:self-stretch wide:[grid-area:transport]">
              <RoundKey caption="Stop" pressed={flash === "stop"} onClick={() => press("stop")} className="self-end [grid-area:stop] wide:self-center">
                <StopGlyph />
              </RoundKey>
              <RoundKey
                caption="Play/Pause"
                aria-label={playing ? "Pause" : "Play"}
                aria-pressed={playing}
                pressed={flash === "play"}
                onClick={() => press("play")}
                className="self-end [grid-area:play] wide:self-center"
              >
                <PlayGlyph playing={playing} />
              </RoundKey>
            </div>
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Left and Right arrows change study, Up and Down set the volume, Space plays or pauses, Enter shows details, Slash finds a study, Escape goes back and M
        mutes.
      </p>
      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
