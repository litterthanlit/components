"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { buttonClass, cn } from "@/design-system";
import { audition, play, soundNames, useSound, type SoundName } from "@/lib/sound";

const roles: Record<SoundName, string> = {
  tick: "One detent of the wheel. Fired up to 70 times a second, so it stays tiny.",
  bump: "The end of a list: the same detent, duller.",
  press: "A key going down: a low thock with a little body.",
  release: "The key coming back up: lighter and quieter.",
  select: "The centre button: a firm click and a two-note confirm.",
  back: "Menu: a softer click, the confirm falling.",
  open: "A prototype taking the screen: a click and air sweeping up.",
  close: "Leaving it: the sweep going down.",
  toggle: "A switch: two tiny clicks.",
  wake: "The device waking, once per visit.",
};

/** Auditions each UI sound on a key, with the viewer's mute switch. */
export function SoundDemo() {
  const { muted, setMuted } = useSound();

  const trigger = (name: SoundName) => {
    if (name === "tick") {
      // A short turn of the wheel, not one lone detent.
      for (let i = 0; i < 8; i++) setTimeout(() => play("tick", { pitch: 0.97 + Math.random() * 0.06 }), i * 45);
    } else {
      audition(name);
    }
  };

  const onPointerDown = (name: SoundName) => (e: PointerEvent) => {
    if (e.button === 0) trigger(name);
  };
  const onKeyDown = (name: SoundName) => (e: KeyboardEvent) => {
    if (!e.repeat && (e.key === "Enter" || e.key === " ")) trigger(name);
  };

  return (
    <div className="rounded-xl bg-panel p-4 shadow-[inset_0_0_0_1px_var(--line)] sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-meta text-muted">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.06)]", muted ? "bg-subtle" : "bg-accent")}
          />
          {muted ? "Muted on this device." : "On. Press a key to hear it."}
        </p>
        <button
          type="button"
          aria-pressed={muted}
          onClick={() => {
            setMuted(!muted);
            if (muted) audition("toggle");
          }}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {soundNames.map((name) => (
          <li key={name}>
            <button
              type="button"
              onPointerDown={onPointerDown(name)}
              onKeyDown={onKeyDown(name)}
              aria-label={`Play ${name}`}
              className={buttonClass({ size: "sm", className: "w-full font-mono" })}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      <dl className="mt-5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {soundNames.map((name) => (
          <div key={name} className="flex gap-3 text-meta">
            <dt className="w-14 shrink-0 font-mono text-ink">{name}</dt>
            <dd className="text-muted">{roles[name]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
