"use client";

import { cn } from "@/design-system";

export type Transport = "play" | "pause" | "stop";

/**
 * The readout: printed straight into the pane in the page's ink, with no well
 * and no LCD of its own. The study's name (the one place it is written on the
 * player), and the take in large figures behind a light that is lit while the
 * tape plays. The light is the only word on the state: the
 * dial's centre already shows what a press will do, ▶ or ❚❚.
 */
export function Readout({ at, n, title, transport, className }: { at: number; n: number; title: string; transport: Transport; className?: string }) {
  return (
    <div aria-hidden data-player-readout className={cn("flex items-end justify-between gap-[1em] text-ink", className)}>
      <span key={title} data-player-name className="min-w-0 max-w-full animate-enter truncate text-[1.25em] font-medium leading-none tracking-[-0.015em]">
        {title}
      </span>
      <p data-player-take className="flex shrink-0 items-baseline gap-[0.35em] leading-none tabular-nums">
        <span
          data-player-light
          data-on={transport === "play" || undefined}
          className={cn(
            "mr-[0.3em] size-[0.45em] self-center rounded-full transition-[background-color,box-shadow]",
            transport === "play" ? "bg-(--device-rec) shadow-[0_0_0.5em_var(--device-rec)] duration-0" : "bg-(--device-meter-off) duration-(--duration-exit)",
          )}
        />
        <span key={at} className="animate-enter text-[2.2em] font-medium tracking-[-0.035em]">
          {String(at + 1).padStart(2, "0")}
        </span>
        <span className="text-[1.45em] text-muted">/ {n}</span>
      </p>
    </div>
  );
}
