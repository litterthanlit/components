import type { ReactNode } from "react";
import { cn } from "../cn";

/** The blue status dot from litt.design. Decorative; pair it with text. */
export function Dot({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span aria-hidden className={cn("relative inline-flex size-1.5 shrink-0", className)}>
      {pulse && <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />}
      <span className="relative size-1.5 rounded-full bg-accent shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" />
    </span>
  );
}

type BadgeVariant = "outline" | "solid" | "accent";

const badgeVariants: Record<BadgeVariant, string> = {
  outline: "text-muted shadow-[inset_0_0_0_1px_var(--line)]",
  solid: "bg-panel text-ink",
  accent: "bg-accent text-accent-ink",
};

export function Badge({
  children,
  variant = "outline",
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-meta whitespace-nowrap",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-surface px-1 font-sans text-[11px] text-muted shadow-[0_0_0_1px_var(--line),0_1px_0_var(--line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
