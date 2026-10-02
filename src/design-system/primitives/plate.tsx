import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../cn";

/**
 * The habit: a box held by four printer's crop marks. Use it for anything
 * that frames a component (gallery plates, the detail stage, specimens,
 * empty and loading states). Marks turn proof red while `active`, or when
 * a parent `group/card` is hovered or focused.
 */
export function Plate({
  active = false,
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { active?: boolean }) {
  return <div className={cn("crop", active && "crop-active", className)} {...props} />;
}

/**
 * The mono voice: micro-labels for metadata. Build ids, dates, counts,
 * units, modes. Uppercase with open tracking, like a slug line on a proof.
 */
export function Label({
  children,
  className,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "p" | "dt" | "dd" | "li";
}) {
  return <Tag className={cn("font-mono text-label uppercase tabular-nums text-muted", className)}>{children}</Tag>;
}

/**
 * The filter, as an element: an amplitude-modulated halftone of `image`
 * (any CSS gradient, dark = more ink). The screen thresholds at 50% grey,
 * so keep the image's darkest stop at or above about #999. `pitch` is the dot screen in px and
 * `density` is opacity: turn these before adding a colour.
 */
export function Halftone({
  image,
  pitch = 6,
  density = 0.9,
  className,
}: {
  image: string;
  pitch?: number;
  density?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("halftone pointer-events-none", className)}
      style={{ ["--ht-image" as string]: image, ["--dot" as string]: `${pitch}px`, opacity: density }}
    />
  );
}
