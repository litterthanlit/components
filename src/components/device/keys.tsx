"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";

/**
 * The deck's keys. Sizes are in em: the deck sets one font size for its
 * arrangement and viewport, and every key, well and caption scales with it,
 * like one physical object.
 */

/** The maker's lettering on the body: tiny capitals, quiet. */
export const engraved =
  "text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label-quiet) [text-shadow:var(--device-engrave)]";

/** Printed captions under and on keys: STOP, HOME, OPTIONS. */
const lettering = "text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]";

// Every key clicks down and up, however it's pressed.
const sounds = {
  onPointerDown: (e: { button: number }) => e.button === 0 && play("press"),
  onPointerUp: (e: { button: number }) => e.button === 0 && play("release"),
  onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && !e.repeat && play("press"),
  onKeyUp: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && play("release"),
};

// Sinks 2px onto its base while held, or while its keyboard shortcut is (data-pressed).
const sink =
  "transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";

const raisedFace = cn(
  "grid h-[2.5em] min-w-[2.5em] place-items-center rounded-[0.7em] px-[0.95em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow)",
  sink,
);

type KeyProps = {
  /** Shown pressed: the key's keyboard shortcut is held. */
  pressed?: boolean;
  children: ReactNode;
  className?: string;
};

/** A raised key in the key well, lettered or with a glyph. */
export function DeviceKey({ pressed, children, className, ...props }: KeyProps & Omit<ComponentPropsWithoutRef<"button">, "children">) {
  return (
    <button type="button" data-pressed={pressed || undefined} {...sounds} {...props} className={cn("group/key rounded-[0.7em] outline-offset-2", className)}>
      <span className={raisedFace}>
        <span className={cn(lettering, "[&>svg]:size-[1.3em]")}>{children}</span>
      </span>
    </button>
  );
}

/** The same key as a link, for pages in this app. */
export function DeviceKeyLink({ pressed, children, className, ...props }: KeyProps & Omit<ComponentPropsWithoutRef<typeof Link>, "children">) {
  return (
    <Link data-pressed={pressed || undefined} {...sounds} {...props} className={cn("group/key rounded-[0.7em] outline-offset-2", className)}>
      <span className={raisedFace}>
        <span className={lettering}>{children}</span>
      </span>
    </Link>
  );
}

/**
 * A round key: a white cap seated in a shallow collar, with its caption
 * printed underneath when it has one. `small` is the satellite size, for a
 * key that sits beside the dial.
 */
export function RoundKey({
  caption,
  small,
  pressed,
  children,
  className,
  ...props
}: KeyProps & { caption?: string; small?: boolean } & Omit<ComponentPropsWithoutRef<"button">, "children">) {
  return (
    <button
      type="button"
      data-pressed={pressed || undefined}
      {...sounds}
      {...props}
      className={cn("group/key flex flex-col items-center gap-[0.7em] rounded-full outline-offset-4", className)}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full bg-black/[0.035] shadow-(--device-recess) dark:bg-black/30",
          small ? "size-[3.6em] p-[0.26em]" : "size-[5.4em] p-[0.32em]",
        )}
      >
        <span className={cn("grid size-full place-items-center rounded-full [background:var(--device-wheel-face)] shadow-(--device-key-shadow)", sink)}>
          {children}
        </span>
      </span>
      {caption && <span className={cn(lettering, "text-(--device-label)")}>{caption}</span>}
    </button>
  );
}

/**
 * The hold switch. Held, it mutes every sound and shows its orange, as the
 * 2009 player did when it locked the controls.
 */
export function HoldSwitch({ held, onChange, className }: { held: boolean; onChange: (held: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={held}
      aria-label="Hold: mute sounds"
      onClick={() => onChange(!held)}
      className={cn("group/hold flex items-center gap-2 rounded-sm px-1 py-0.5 outline-offset-2", className)}
    >
      <span aria-hidden className={engraved}>
        Hold
      </span>
      <span aria-hidden className="relative h-[11px] w-[34px] overflow-hidden rounded-full bg-black/10 shadow-(--device-recess) dark:bg-black/40">
        <span
          className="absolute inset-y-0 left-0 w-1/2 bg-(--device-hold) opacity-0 transition-opacity duration-(--duration-exit) group-aria-checked/hold:opacity-100 group-aria-checked/hold:duration-(--duration-enter)"
          style={{ boxShadow: "inset 0 1px 2px rgb(0 0 0 / 0.25)" }}
        />
        <span className="absolute inset-y-[1.5px] left-[1.5px] w-[15px] rounded-full [background:var(--device-key-face)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.25),0_1px_1px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.8)] transition-transform duration-(--duration-enter) ease-spring group-aria-checked/hold:translate-x-[16px] dark:shadow-[0_0_0_0.5px_rgb(0_0_0/0.8),0_1px_1px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.12)]" />
      </span>
    </button>
  );
}
