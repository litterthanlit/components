"use client";

import { Suspense, lazy, useState, type ComponentType } from "react";
import { spoolRoll } from "./spool-roll";

/**
 * Lazily-loaded demos, keyed by registry slug. Each demo is its own chunk,
 * so a page only pays for what it shows.
 *
 * Each one is `next/dynamic` stripped down to what the player needs: a
 * chunk that has come in renders on its first frame, with no Suspense
 * fallback in between. React.lazy alone suspends on the first render of
 * every new instance even when the module is already loaded, and the
 * player mounts a new instance on every step of the dial, so each step
 * flashed the loading dot before the study. `preload` fetches a chunk
 * ahead of time; the player warms the neighbours of the take on screen,
 * then every study once the page is idle.
 */
type Module = { default: ComponentType };
export type Demo = ComponentType & { preload: () => Promise<unknown> };

const loading = <div className="size-6 animate-pulse rounded-full bg-line" />;

function demo(load: () => Promise<Module>): Demo {
  let ready: ComponentType | undefined;
  let pending: Promise<Module> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (mod) => {
        ready = mod.default;
        return mod;
      },
      (error: unknown) => {
        pending = undefined; // a dropped connection shouldn't break the study for good
        throw error;
      },
    ));
  const Lazy = lazy(preload);
  function Loaded() {
    // Chosen once per mount: swapping Lazy for the module mid-life would remount the study.
    const [Component] = useState<ComponentType>(() => ready ?? Lazy);
    return (
      <Suspense fallback={loading}>
        <Component />
      </Suspense>
    );
  }
  return Object.assign(Loaded, { preload });
}

export const previews: Record<string, Demo> = {
  "file-browser": demo(() => import("./components/file-browser")),
  // Spool plays the photographs in public/spool/ rather than its painted roll.
  spool: demo(() =>
    import("./components/spool").then(({ default: Spool }) => ({
      default: function SpoolPreview() {
        return <Spool frames={spoolRoll} />;
      },
    })),
  ),
  "gradient-keys": demo(() => import("./components/gradient-keys")),
  "agent-indicators": demo(() => import("./components/agent-indicators")),
  "agent-status": demo(() => import("./components/agent-status")),
  "command-menu": demo(() => import("./components/command-menu")),
  fader: demo(() => import("./components/fader")),
  switch: demo(() => import("./components/switch")),
  "one-time-code": demo(() => import("./components/one-time-code")),
  ticker: demo(() => import("./components/ticker")),
  "step-sequencer": demo(() => import("./components/step-sequencer")),
  knob: demo(() => import("./components/knob")),
  "tape-reels": demo(() => import("./components/tape-reels")),
  "vu-meter": demo(() => import("./components/vu-meter")),
  "agent-shapes": demo(() => import("./components/agent-shapes")),
  "agent-run": demo(() => import("./components/agent-run")),
  "agent-loaders": demo(() => import("./components/agent-loaders")),
  "dither-card": demo(() => import("./components/dither-card")),
  "spotlight-card": demo(() => import("./components/spotlight-card")),
  "toast-stack": demo(() => import("./components/toast-stack")),
  "hold-to-confirm": demo(() => import("./components/hold-to-confirm")),
  "number-ticker": demo(() => import("./components/number-ticker")),
  "segmented-control": demo(() => import("./components/segmented-control")),
  "copy-button": demo(() => import("./components/copy-button")),
};
