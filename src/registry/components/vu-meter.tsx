"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createSpring, focusQuietly } from "@/design-system";
import { play, readLevels } from "@/lib/sound";

/*
 * A pair of VU meters reading the page's own sound: backlit faces behind
 * glass, needles with real ballistics, a peak light each.
 *
 * Levels come from the shared sound bus every frame (readLevels), so they
 * show whatever the page plays: a key, the dial's clicks on the player, the
 * slate tone. A detector holds each peak for a moment as it falls, then a
 * spring drives the needle with the VU standard's movement: 99% of the way
 * to a steady tone in about 300 ms, overshooting by about 1.5%. Like a real
 * VU it under-reads short sounds, so a key press swings it up toward 0 but
 * never pins it, while the peak light (600 ms past +3) catches what the
 * needle is too slow for. The scale is linear in voltage, so 0 VU sits
 * about seven tenths of the way across and +3 at full scale.
 *
 * On power-up the needles swing to the end stop and back, one after the
 * other. SLATE sends the recorder's 1 kHz line-up tone, which settles on 0.
 */

/**
 * The bus level, linear, that reads 0 VU: the slate tone as measured leaving
 * the bus at the designed volume (7) on a desktop, after the bus compressor's
 * make-up gain. Touch screens sit 2.5 dB lower, and so does the needle.
 */
const REFERENCE = 0.169;
const FULL = 10 ** (3 / 20); // +3 VU, the end of the scale
const SWING = 48; // degrees either side of upright
const RELEASE = 0.06; // seconds a peak is held as it falls: a click shows, but never pins the needle
const PEAK = 600; // ms the peak light holds
/** The VU movement, in degrees: ~300 ms to 99%, ~1.5% overshoot (simulated through createSpring). */
const BALLISTICS = { stiffness: 166, damping: 20.2, mass: 1 };

/* The face, in viewBox units. The pivot sits below the window, as on the real thing. */
const FW = 120;
const FH = 72;
const PIVOT = { x: 60, y: 86 };
const ARC = 66;

/** Needle angle for a deflection: 0 at the left stop, 1 at +3 VU, a little past it to the pin. */
const angleAt = (deflection: number) => -SWING + Math.min(1.08, Math.max(0, deflection)) * 2 * SWING;
const deflectionAt = (vu: number) => 10 ** (vu / 20) / FULL;

/** A point on the face. Rounded, so the server's and the browser's trigonometry agree when it hydrates. */
const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round((PIVOT.x + r * Math.sin(a)) * 100) / 100, y: Math.round((PIVOT.y - r * Math.cos(a)) * 100) / 100 };
};

const MARKS: { vu: number; label: string }[] = [
  { vu: -20, label: "20" },
  { vu: -10, label: "10" },
  { vu: -7, label: "7" },
  { vu: -5, label: "5" },
  { vu: -3, label: "3" },
  { vu: -2, label: "2" },
  { vu: -1, label: "1" },
  { vu: 0, label: "0" },
  { vu: 1, label: "1" },
  { vu: 2, label: "2" },
  { vu: 3, label: "3" },
];
const MINOR = [-15, -12, -8.5, -6, -4, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

function arcPath(from: number, to: number, r: number) {
  const a = polar(angleAt(deflectionAt(from)), r);
  const b = polar(angleAt(deflectionAt(to)), r);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** One meter's face: scale, red zone, VU mark and the needle the meter drives. */
function Face({ channel }: { channel: "L" | "R" }) {
  return (
    <div className="relative overflow-hidden rounded-[0.55em] bg-(--device-rim) p-[0.28em] shadow-[0_1px_0_rgb(255_255_255/0.6),inset_0_0_0_1px_rgb(255_255_255/0.06)] dark:shadow-[0_1px_0_rgb(255_255_255/0.05),inset_0_0_0_1px_rgb(255_255_255/0.06)]">
      <div className="relative overflow-hidden rounded-[0.38em] [background:radial-gradient(90%_110%_at_50%_100%,#fffaf0_0%,#f4eedf_55%,#e2dac6_100%)] shadow-[inset_0_2px_6px_rgb(0_0_0/0.35)]">
        <svg viewBox={`0 0 ${FW} ${FH}`} className="block w-full font-sans">
          {/* Scale */}
          <path d={arcPath(-20, 0, ARC - 6)} fill="none" stroke="#1d1b17" strokeWidth="0.7" />
          <path d={arcPath(0, 3, ARC - 4.4)} fill="none" stroke="var(--device-rec)" strokeWidth="3.6" />
          <path d={arcPath(-20, 3, ARC - 13)} fill="none" stroke="rgb(29 27 23 / 0.35)" strokeWidth="0.5" />
          {MINOR.map((vu) => {
            const deg = angleAt(deflectionAt(vu));
            const a = polar(deg, ARC - 6);
            const b = polar(deg, ARC - 3.4);
            return <line key={vu} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={vu > 0 ? "var(--device-rec)" : "#1d1b17"} strokeWidth="0.5" />;
          })}
          {MARKS.map(({ vu, label }) => {
            const deg = angleAt(deflectionAt(vu));
            const a = polar(deg, ARC - 6);
            const b = polar(deg, ARC - 1.2);
            const t = polar(deg, ARC + 4.6);
            const red = vu > 0;
            return (
              <g key={vu}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={red ? "var(--device-rec)" : "#1d1b17"} strokeWidth={vu === 0 ? 1.1 : 0.8} />
                <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="middle" fontSize="5.6" fontWeight="500" fill={red ? "var(--device-rec)" : "#1d1b17"}>
                  {label}
                </text>
              </g>
            );
          })}
          <text x={PIVOT.x} y={47} textAnchor="middle" fontSize="9" fontWeight="600" letterSpacing="0.6" fill="#1d1b17">
            VU
          </text>
          <text x={10} y={FH - 7} fontSize="5" fontWeight="600" letterSpacing="0.6" fill="rgb(29 27 23 / 0.55)">
            {channel}
          </text>

          {/* The needle, written by the meter every frame. */}
          <line data-needle x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={PIVOT.y - ARC + 2} stroke="#141311" strokeWidth="0.9" strokeLinecap="round" />
          {/* The pivot's cover, rising into the window: the needle comes out of it. */}
          <path d={`M${PIVOT.x - 16} ${FH} A16 16 0 0 1 ${PIVOT.x + 16} ${FH}Z`} fill="#141311" />
          <path d={`M${PIVOT.x - 13.5} ${FH} A13.5 13.5 0 0 1 ${PIVOT.x + 13.5} ${FH}`} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="0.5" />
        </svg>
        {/* Glass over the face, and the lamp's falloff toward the corners. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 [background:linear-gradient(160deg,rgb(255_255_255/0.45)_0%,rgb(255_255_255/0.08)_36%,transparent_36.4%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_14px_rgb(60_40_10/0.18)]" />
      </div>
    </div>
  );
}

export function VuMeter({ className = "" }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    const needles = [...root.querySelectorAll<SVGLineElement>("[data-needle]")];
    const lights = [...root.querySelectorAll<HTMLElement>("[data-peak]")];
    const length = ARC - 2;
    const draw = (needle: SVGLineElement) => (deg: number) => {
      const tip = polar(deg, length);
      needle.setAttribute("x2", tip.x.toFixed(2));
      needle.setAttribute("y2", tip.y.toFixed(2));
      needle.dataset.angle = deg.toFixed(2);
    };
    const springs = needles.map((n) => createSpring(-SWING, BALLISTICS, draw(n)));
    springs.forEach((s) => s.jump(-SWING));

    // Power-up: each needle swings to the end stop and back, the right a beat behind the left.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const sweep = reduced ? [] : [{ from: 160, to: 560 }, { from: 240, to: 640 }];

    const levels: [number, number] = [0, 0];
    const env = [0, 0];
    const peakUntil = [0, 0];
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      readLevels(levels);
      for (let c = 0; c < 2; c++) {
        env[c] = Math.max(levels[c], env[c] * Math.exp(-dt / RELEASE));
        const t = now - start;
        const swinging = sweep[c] && t >= sweep[c].from && t < sweep[c].to;
        springs[c].set(swinging ? SWING : angleAt(env[c] / (REFERENCE * FULL)));
        if (levels[c] > REFERENCE * FULL) peakUntil[c] = now + PEAK;
        const lit = now < peakUntil[c];
        if (lit !== ("on" in lights[c].dataset)) {
          if (lit) lights[c].dataset.on = "";
          else delete lights[c].dataset.on;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      springs.forEach((s) => s.stop());
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden className={`grid grid-cols-2 gap-[0.6em] ${className}`}>
      {(["L", "R"] as const).map((c) => (
        <div key={c} className="flex flex-col gap-[0.5em]">
          <Face channel={c} />
          <div className="flex items-center justify-center gap-[0.4em]">
            <span
              data-peak
              className="size-[0.42em] rounded-full bg-(--device-meter-off) transition-[background-color,box-shadow] duration-(--duration-exit) data-on:bg-(--device-rec) data-on:shadow-[0_0_0.45em_var(--device-rec)] data-on:duration-0"
            />
            <span className="text-[0.56em] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)]">
              Peak
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Demo() {
  const ids = useId();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 1000);
    return () => clearTimeout(id);
  }, [sent]);

  return (
    <div className="@container w-full max-w-[500px] select-none">
      <div className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div className="rounded-[1.05em] bg-(--device-well) p-[0.45em] shadow-(--device-recess)">
          <VuMeter />
        </div>
        <p id={`${ids}-about`} className="sr-only">
          Left and right VU meters. They read the sound this page plays; Slate sends a reference tone that reads 0 VU.
        </p>

        <div className="mt-[0.75em] flex items-center gap-[0.7em]">
          <button
            type="button"
            aria-describedby={`${ids}-about`}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              focusQuietly(e.currentTarget);
              play("press");
            }}
            onPointerUp={(e) => e.button === 0 && play("release")}
            onClick={() => {
              play("slate");
              setSent(true);
            }}
            className="group/key shrink-0 rounded-[0.7em] outline-offset-2"
          >
            <span className="flex h-[2.5em] items-center gap-[0.5em] rounded-[0.7em] px-[0.95em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
              <span
                aria-hidden
                className={`size-[0.42em] rounded-full transition-[background-color,box-shadow] duration-(--duration-exit) ${sent ? "bg-(--device-rec) shadow-[0_0_0.45em_var(--device-rec)]" : "bg-(--device-meter-off)"}`}
              />
              <span className="text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">Slate</span>
            </span>
          </button>
          <span className="min-w-0 text-[0.62em] font-semibold uppercase leading-[1.35] tracking-[0.14em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)]">
            1 kHz · reads 0 VU
          </span>
        </div>
      </div>
    </div>
  );
}
