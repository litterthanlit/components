"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/design-system";
import { play } from "@/lib/sound";

/** Lettering cut into the body: tiny capitals, lit from above. */
export const engraved =
  "text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-(--device-label) [text-shadow:var(--device-engrave)]";

const face =
  "relative grid h-[clamp(26px,9cqw,34px)] w-full place-items-center rounded-key text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75 group-data-pressed/key:translate-y-[2px] group-data-pressed/key:shadow-(--device-key-shadow-pressed) group-data-pressed/key:duration-75";

// Every key clicks down and up, however it's pressed.
const sounds = {
  onPointerDown: (e: { button: number }) => e.button === 0 && play("press"),
  onPointerUp: (e: { button: number }) => e.button === 0 && play("release"),
  onKeyDown: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && !e.repeat && play("press"),
  onKeyUp: (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && play("release"),
};

type KeyProps = {
  /** Engraved on the body under the key. */
  caption: string;
  /** The glyph on the key's face. */
  children: ReactNode;
  className?: string;
};

function KeyBody({ caption, children }: Pick<KeyProps, "caption" | "children">) {
  return (
    <>
      <span className={face}>
        <span aria-hidden className="[filter:var(--device-engrave-glyph)]">
          {children}
        </span>
      </span>
      <span aria-hidden className={cn(engraved, "mt-2 block text-center")}>
        {caption}
      </span>
    </>
  );
}

const shell = "group/key flex w-full flex-col items-stretch rounded-key outline-offset-4";

/** A rectangular grey key: sharp corners, a 2px base it sinks onto. */
export function DeviceKey({ caption, children, className, ...props }: KeyProps & Omit<ComponentPropsWithoutRef<"button">, "children">) {
  return (
    <button type="button" {...sounds} {...props} className={cn(shell, className)}>
      <KeyBody caption={caption}>{children}</KeyBody>
    </button>
  );
}

/** The same key as a link, for pages in this app. */
export function DeviceKeyLink({ caption, children, className, ...props }: KeyProps & Omit<ComponentPropsWithoutRef<typeof Link>, "children">) {
  return (
    <Link {...sounds} {...props} className={cn(shell, className)}>
      <KeyBody caption={caption}>{children}</KeyBody>
    </Link>
  );
}

/**
 * The hold switch, on the device's top edge. Held, it mutes every sound and
 * shows its orange, as the original did when it locked the controls.
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
