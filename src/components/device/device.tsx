"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { setTheme, useTheme } from "@/components/gallery/theme-toggle";
import { cn, createSpring, type Spring } from "@/design-system";
import { isMuted, play, setMuted, subscribeMuted } from "@/lib/sound";
import { site } from "@/site.config";
import { DeviceKey, DeviceKeyLink, HoldSwitch, engraved } from "./keys";
import { AboutPane, AppStage, MenuList, PortfolioPane, StatusBar, StudyPane, SystemPane, rowLabel, type Row, type Study } from "./screen";
import { Wheel, type WheelButton } from "./wheel";

const SHUFFLE = 5000; // ms per prototype while shuffling
const SETTLE = 450; // ms the wheel has to rest before the prototype it turned to opens
const PREVIEW_DELAY = 140; // ms a row stays highlighted before its preview mounts
// Close to critically damped: the screen arrives fast and settles without a wobble.
const SLIDE = { stiffness: 380, damping: 38 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* --- Small stores --------------------------------------------------------- */

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const mq = window.matchMedia(motionQuery);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

// Scanlines over the display, remembered per viewer.
const GRID_KEY = "device-grid";
const gridListeners = new Set<() => void>();
function readGrid() {
  try {
    return localStorage.getItem(GRID_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeGrid(on: boolean) {
  try {
    localStorage.setItem(GRID_KEY, on ? "on" : "off");
  } catch {}
  gridListeners.forEach((l) => l());
}
function subscribeGrid(callback: () => void) {
  gridListeners.add(callback);
  return () => gridListeners.delete(callback);
}

/* --- Glyphs for the keys -------------------------------------------------- */

const glyph = "size-[13px]";
const ThemeGlyph = () => (
  <svg viewBox="0 0 16 16" className={glyph}>
    <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
  </svg>
);
const GridGlyph = () => (
  <svg viewBox="0 0 16 16" className={glyph} fill="currentColor">
    {[3, 8, 13].flatMap((y) => [3, 8, 13].map((x) => <rect key={`${x}${y}`} x={x - 1.1} y={y - 1.1} width="2.2" height="2.2" rx="0.4" />))}
  </svg>
);
const PageGlyph = () => (
  <svg viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" />
  </svg>
);

/** The Litt mark, cut into the body: the logo's alpha as a mask, lit like the lettering. */
function Mark() {
  return (
    <span aria-hidden className="[filter:var(--device-engrave-glyph)]">
      <span
        className="block h-[17px] w-[24px] bg-(--device-label) [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
        style={{ maskImage: `url(${site.basePath}/logo-mark.png)` }}
      />
    </span>
  );
}

/* --- The device ------------------------------------------------------------ */

/**
 * The home page: a pocket player after the 2009 classic, redrawn in the
 * site's key language, whose screen runs the prototypes. Its main menu splits
 * like the original's Music menu, the list of studies on the left and a live
 * preview of the highlighted one on the right; selecting one fills the screen
 * with it, live, and MENU slides back.
 *
 * Driving it: the wheel turns the highlight (inside a prototype, it dials to
 * another one, which opens once the wheel rests); ⏮ ⏭ step through
 * prototypes, ⏯ shuffles, the centre selects. The keyboard does the same from
 * anywhere on the page, but a running prototype keeps its own keys, except an
 * Escape it leaves unhandled. Every press clicks (src/lib/sound.ts); the hold
 * switch mutes it.
 *
 * Only one prototype is ever mounted at rest: the highlighted one's preview
 * or the one running.
 */
export function Device({ studies }: { studies: Study[] }) {
  const n = studies.length;
  const rows = useMemo<Row[]>(
    () => [...studies.map((study, at) => ({ kind: "study" as const, study, at })), { kind: "about" }, { kind: "system" }, { kind: "portfolio" }],
    [studies],
  );

  const [index, setIndex] = useState(0); // highlighted row
  const [previewAt, setPreviewAt] = useState(0); // row whose preview is mounted (trails the highlight)
  const [opened, setOpened] = useState<number | null>(null); // study filling the screen
  const [shown, setShown] = useState<number | null>(null); // study mounted there; lingers while it slides away
  const [menuLive, setMenuLive] = useState(true); // the preview stays mounted until the app has fully slid in
  const [pending, setPending] = useState<number | null>(null); // dialled with the wheel, not yet open
  const [hud, setHud] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [flash, setFlash] = useState<WheelButton | null>(null);
  const [nudge, setNudge] = useState(0); // any touch restarts the shuffle countdown
  const [announcement, setAnnouncement] = useState("");

  // The switch shows what it was last set to; the sound engine is the source of truth until then.
  const engineMuted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const [hold, setHold] = useState<boolean | null>(null);
  const muted = hold ?? engineMuted;
  const grid = useSyncExternalStore(subscribeGrid, readGrid, () => true);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => false);
  const pageVisible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const theme = useTheme();
  const router = useRouter();
  const ids = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const menuLayer = useRef<HTMLDivElement>(null);
  const appLayer = useRef<HTMLDivElement>(null);
  const slide = useRef<Spring | null>(null);
  const goal = useRef(0);
  const refocus = useRef<"app" | "menu" | null>(null);
  const woke = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const dialled = pending ?? opened; // the prototype the screen is on, or heading to
  const row = rows[index];
  const current = row.kind === "study" ? row.study : null;
  const pageStudy = dialled !== null ? studies[dialled] : current;

  /* Screens slide on one spring, in percent: 0 is the menu, 100 a prototype.
     The menu drifts back a little as the prototype comes over it, as screens
     do now. */
  const settled = useEffectEvent((p: number) => {
    if (p === 100) setMenuLive(false);
    else setShown(null);
  });
  useLayoutEffect(() => {
    const s = createSpring(0, SLIDE, (p) => {
      const menu = menuLayer.current;
      const app = appLayer.current;
      if (menu) {
        menu.style.transform = p ? `translateX(${(-p * 0.28).toFixed(3)}%)` : "";
        menu.style.opacity = String(1 - p / 200);
      }
      if (app) app.style.transform = `translateX(${(100 - p).toFixed(3)}%)`;
      // Close enough to the end is out of sight: let go of the screen it left.
      if (Math.abs(p - goal.current) < 0.5) settled(goal.current);
    });
    slide.current = s;
    return () => s.stop();
  }, []);

  // Focus follows the screen it was on, so it is never left on an inert layer.
  useLayoutEffect(() => {
    if (refocus.current === "app") appLayer.current?.focus({ preventScroll: true });
    if (refocus.current === "menu") listRef.current?.focus({ preventScroll: true });
    refocus.current = null;
  }, [opened]);

  // A highlight has to rest a moment before its preview mounts, so spinning
  // through the list doesn't start (and drop) every demo on the way.
  useEffect(() => {
    if (previewAt === index) return;
    const id = setTimeout(() => setPreviewAt(index), PREVIEW_DELAY);
    return () => clearTimeout(id);
  }, [index, previewAt]);

  // A prototype dialled with the wheel opens once the wheel rests.
  useEffect(() => {
    if (pending === null) return;
    const id = setTimeout(() => {
      setPending(null);
      show(pending);
    }, SETTLE);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // The position readout fades shortly after the last change.
  useEffect(() => {
    if (!hud || pending !== null) return;
    const id = setTimeout(() => setHud(false), 1100);
    return () => clearTimeout(id);
  }, [hud, pending, opened]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  /* --- Moves ------------------------------------------------------------ */

  function announce(text: string) {
    setAnnouncement(text);
  }

  function wake() {
    if (woke.current) return;
    woke.current = true;
    play("wake");
  }

  /** Puts a study on the screen that's already showing one. */
  function show(at: number) {
    setOpened(at);
    setShown(at);
    setIndex(at);
    setHud(true);
    announce(`${studies[at].title}, ${at + 1} of ${n}`);
  }

  function open(at: number) {
    if (menuLayer.current?.contains(document.activeElement)) refocus.current = "app";
    setOpened(at);
    setShown(at);
    setIndex(at);
    setMenuLive(true);
    play("open");
    announce(`${studies[at].title}. Escape returns to the menu.`);
    goal.current = 100;
    if (reduced) slide.current?.jump(100);
    else slide.current?.set(100);
  }

  function close() {
    if (opened === null) return;
    if (appLayer.current?.contains(document.activeElement)) refocus.current = "menu";
    setIndex(dialled ?? opened);
    setPreviewAt(dialled ?? opened);
    setOpened(null);
    setPending(null);
    setHud(false);
    setMenuLive(true);
    play("close");
    announce(`Menu. ${studies[dialled ?? opened].title}, ${(dialled ?? opened) + 1} of ${n}`);
    goal.current = 0;
    if (reduced) slide.current?.jump(0);
    else slide.current?.set(0);
  }

  function turn(steps: number) {
    setNudge((k) => k + 1);
    if (opened === null) {
      const next = clamp(index + steps, 0, rows.length - 1);
      if (next === index) return play("bump");
      play("tick", { pitch: 0.97 + Math.random() * 0.06 });
      setIndex(next);
    } else {
      const from = dialled ?? opened;
      const next = clamp(from + steps, 0, n - 1);
      if (next === from) return play("bump");
      play("tick", { pitch: 0.97 + Math.random() * 0.06 });
      setPending(next);
      setHud(true);
    }
  }

  /** ⏮ ⏭: the previous or next study, in the menu or on the screen. */
  function step(delta: number) {
    setNudge((k) => k + 1);
    if (opened === null) {
      const from = row.kind === "study" ? index : delta > 0 ? -1 : n;
      const next = clamp(from + delta, 0, n - 1);
      if (next === index) return play("bump");
      setIndex(next);
    } else {
      const from = dialled ?? opened;
      const next = clamp(from + delta, 0, n - 1);
      setPending(null);
      if (next === from) return play("bump");
      show(next);
    }
  }

  function select() {
    if (opened !== null) {
      if (pending !== null) {
        setPending(null);
        show(pending);
      } else play("bump");
      return;
    }
    if (row.kind === "study") open(row.at);
    else if (row.kind === "system") router.push("/system");
    else if (row.kind === "portfolio") window.location.assign(site.links.portfolio);
    else play("bump");
  }

  function toggleShuffle() {
    if (reduced) {
      play("bump");
      announce("Shuffle stays off while reduced motion is on.");
      return;
    }
    setShuffle(!shuffle);
    setNudge((k) => k + 1);
    announce(shuffle ? "Shuffle off" : "Shuffle on");
  }

  function press(button: WheelButton) {
    wake();
    if (button === "menu") {
      if (opened === null) return play("bump");
      play("back");
      close();
    } else if (button === "select") {
      play("select");
      select();
    } else if (button === "prev") step(-1);
    else if (button === "next") step(1);
    else toggleShuffle();
  }

  /** A key press from the keyboard: the wheel shows it pressed and clicks down and up. */
  function keyPress(button: WheelButton) {
    setFlash(button);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(null);
      play("release");
    }, 110);
    play("press");
    press(button);
  }

  function pick(i: number) {
    wake();
    if (i === index) {
      play("select");
      select();
    } else {
      play("tick", { pitch: 0.97 + Math.random() * 0.06 });
      setIndex(i);
    }
  }

  /* --- Shuffle ---------------------------------------------------------- */

  const shuffling = shuffle && !reduced && pageVisible && pending === null;
  useEffect(() => {
    if (!shuffling) return;
    const id = setTimeout(() => {
      if (opened === null) setIndex(row.kind === "study" ? (index + 1) % n : 0);
      else show((opened + 1) % n);
    }, SHUFFLE);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shuffling, index, opened, nudge]);

  /* --- Keyboard --------------------------------------------------------- */

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as Element;
    const root = rootRef.current;
    if (!root) return;
    // A running prototype keeps its keys; only an Escape it leaves alone comes back to the menu.
    if (target.closest("[data-app]")) {
      if (e.key === "Escape" && !e.defaultPrevented && opened !== null) {
        e.preventDefault();
        keyPress("menu");
      }
      return;
    }
    if (e.defaultPrevented || (target !== document.body && !root.contains(target))) return;
    // Enter and Space on a focused button or link stay native.
    const native = target.matches("button, a, input, select, textarea");
    wake();
    switch (e.key) {
      case "ArrowDown":
        turn(1);
        break;
      case "ArrowUp":
        turn(-1);
        break;
      case "PageDown":
        turn(5);
        break;
      case "PageUp":
        turn(-5);
        break;
      case "Enter":
        if (native || e.repeat) return;
        keyPress("select");
        break;
      case " ":
        if (native || e.repeat) return;
        keyPress("play");
        break;
      case "Escape":
      case "Backspace":
        if (opened === null) return;
        keyPress("menu");
        break;
      case "ArrowLeft":
        keyPress("prev");
        break;
      case "ArrowRight":
        keyPress("next");
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

  /* --- Render ----------------------------------------------------------- */

  const previewRow = rows[previewAt];
  const previewStudy = menuLive && previewRow.kind === "study" ? previewRow.study : null;
  const shownStudy = shown !== null ? studies[shown] : null;
  const slider =
    opened === null
      ? { label: "Click wheel", now: index + 1, max: rows.length, text: `${rowLabel(row)}, ${index + 1} of ${rows.length}` }
      : { label: "Click wheel: prototypes", now: dialled! + 1, max: n, text: `${studies[dialled!].title}, ${dialled! + 1} of ${n}` };
  const hintId = `${ids}-hint`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={`${site.name}: a pocket player of studies`}
      onPointerDownCapture={wake}
      className="flex h-dvh w-full justify-center [--m:10px] sm:[--m:16px] lg:[--m:20px] pt-[max(var(--m),env(safe-area-inset-top))] pr-[max(var(--m),env(safe-area-inset-right))] pb-[max(var(--m),env(safe-area-inset-bottom))] pl-[max(var(--m),env(safe-area-inset-left))]"
    >
      {/* The body: soft-matte grey, a chamfer catching the light. */}
      <div className="relative isolate flex size-full max-w-[1680px] flex-col rounded-[30px] px-3 pb-3 [background:var(--device-body)] [box-shadow:var(--device-body-edge),var(--device-body-shadow)] sm:rounded-[36px] sm:px-4 sm:pb-4 lg:px-5 lg:pb-5">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        {/* Top edge: the mark on one side, the hold switch on the other. */}
        <div className="flex h-9 shrink-0 items-center justify-between pl-1.5 sm:h-10 sm:pl-2">
          <div className="flex items-center gap-2.5">
            <Mark />
            <span aria-hidden className={engraved}>
              Studies
            </span>
          </div>
          <HoldSwitch
            held={muted}
            onChange={(held) => {
              if (held) play("toggle");
              setHold(held);
              setMuted(held);
              if (!held) play("toggle");
              announce(held ? "Hold on: sound muted" : "Hold off: sound on");
            }}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row sm:gap-4 lg:landscape:gap-5">
          {/* The screen: black glass, a fine bezel, the display set into it. */}
          <div className="relative h-[56%] shrink-0 rounded-[20px] bg-(--device-bezel) p-[6px] shadow-[0_0_0_1px_rgb(0_0_0/0.2),0_1px_0_rgb(255_255_255/0.5),inset_0_1px_0_rgb(255_255_255/0.08)] landscape:h-auto landscape:flex-1 sm:rounded-[24px] sm:p-2 dark:shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_1px_0_rgb(255_255_255/0.06),inset_0_1px_0_rgb(255_255_255/0.06)]">
            <div className="@container/display relative isolate flex size-full animate-wake flex-col overflow-hidden rounded-[14px] bg-canvas sm:rounded-[17px]">
              <StatusBar
                title={dialled !== null ? studies[dialled].title : "Studies"}
                shuffle={shuffling || (shuffle && pending !== null)}
                held={muted}
                progress={dialled !== null ? (dialled + 1) / n : null}
              />

              <div className="relative min-h-0 flex-1 overflow-hidden">
                {/* Menu: the list, and the highlighted study live beside it (above it on narrow screens). */}
                <div ref={menuLayer} inert={opened !== null} className="absolute inset-0 flex flex-col-reverse @[520px]/display:flex-row">
                  <MenuList
                    rows={rows}
                    index={index}
                    idPrefix={`${ids}-row`}
                    reduced={reduced}
                    listRef={listRef}
                    onPick={pick}
                    className="flex-1 @[520px]/display:max-w-[380px] @[520px]/display:basis-[40%] @[520px]/display:flex-none"
                  />
                  <div className="h-[46%] shrink-0 bg-panel shadow-[0_1px_0_var(--line)] @[520px]/display:h-auto @[520px]/display:flex-1 @[520px]/display:shadow-[-1px_0_0_var(--line)]">
                    {row.kind === "about" ? (
                      <AboutPane />
                    ) : row.kind === "system" ? (
                      <SystemPane />
                    ) : row.kind === "portfolio" ? (
                      <PortfolioPane />
                    ) : (
                      <StudyPane study={current} mounted={previewStudy} caption onOpen={() => {
                          wake();
                          play("select");
                          select();
                        }} />
                    )}
                  </div>
                </div>

                {/* A running prototype. Clicks and keys inside belong to it. */}
                <div
                  ref={appLayer}
                  role="group"
                  aria-label={shownStudy ? `${shownStudy.title}, running` : undefined}
                  tabIndex={-1}
                  inert={opened === null}
                  onPointerDown={() => setNudge((k) => k + 1)}
                  // Off to the right until the spring brings it in; constant, so React never overwrites the spring.
                  style={{ transform: "translateX(100%)" }}
                  className="absolute inset-0 bg-canvas shadow-[-16px_0_32px_-16px_rgb(0_0_0/0.25)] outline-offset-[-2px]"
                >
                  {shownStudy && <AppStage study={shownStudy} />}
                  {/* Where the wheel has got to: a position readout that fades once it rests. */}
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/85 px-3 py-1.5 text-meta shadow-md backdrop-blur-md transition-[opacity,transform] ease-out",
                      hud && dialled !== null ? "opacity-100 duration-(--duration-enter)" : "translate-y-1 opacity-0 duration-(--duration-move)",
                    )}
                  >
                    {dialled !== null && (
                      <>
                        <span className="tabular-nums text-muted">
                          {dialled + 1} / {n}
                        </span>
                        <span className="font-medium text-ink">{studies[dialled].title}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {grid && <div aria-hidden className="screen-grid pointer-events-none absolute inset-0 z-20" />}
              {/* Glass, and the backlight's bloom as the screen wakes. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 z-20 [background:var(--screen-glass)]" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-20 animate-bloom [background:radial-gradient(50%_50%_at_50%_50%,var(--screen-glow),transparent)]"
              />
            </div>
          </div>

          {/* Controls: the wheel, and a row of keys under it. */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 [container-type:size] sm:gap-6 landscape:w-[clamp(220px,29%,420px)] landscape:flex-none">
            <Wheel
              flash={flash}
              onTurn={turn}
              onPress={press}
              slider={slider}
              sliderRef={sliderRef}
              hint={hintId}
              playing={shuffle && !reduced}
              className="w-[min(84cqw,64cqh)] landscape:w-[min(84cqw,58cqh)]"
            />
            <div className="grid w-[min(84cqw,64cqh)] grid-cols-3 gap-[min(4cqw,16px)] @container landscape:w-[min(84cqw,58cqh)]">
              <DeviceKey
                caption={theme === "dark" ? "Light" : "Dark"}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                onClick={() => {
                  play("toggle");
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
              >
                <ThemeGlyph />
              </DeviceKey>
              <DeviceKey
                caption="Lines"
                role="switch"
                aria-checked={grid}
                aria-label="Scanlines"
                onClick={() => {
                  play("toggle");
                  writeGrid(!grid);
                }}
              >
                <GridGlyph />
              </DeviceKey>
              {pageStudy ? (
                <DeviceKeyLink caption="Page" href={`/c/${pageStudy.slug}`} aria-label={`Open the ${pageStudy.title} page`}>
                  <PageGlyph />
                </DeviceKeyLink>
              ) : (
                <DeviceKey caption="Page" disabled aria-label="Open page" className="opacity-60">
                  <PageGlyph />
                </DeviceKey>
              )}
            </div>
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Turn the wheel, or use the Up and Down arrow keys, to move through the list. Enter opens a prototype and Escape returns to the menu.
        Left and Right arrows step through prototypes, Space shuffles them.
      </p>
      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
