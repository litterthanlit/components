"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Lazily-loaded demos, keyed by registry slug. Each demo is its own chunk,
 * so the home page only pays for what scrolls into view.
 */
const loading = () => <div className="size-6 animate-pulse rounded-full bg-line" />;

export const previews: Record<string, ComponentType> = {
  throttle: dynamic(() => import("./components/throttle"), { loading }),
  "gradient-keys": dynamic(() => import("./components/gradient-keys"), { loading }),
  "agent-indicators": dynamic(() => import("./components/agent-indicators"), { loading }),
  "agent-status": dynamic(() => import("./components/agent-status"), { loading }),
  "command-menu": dynamic(() => import("./components/command-menu"), { loading }),
  fader: dynamic(() => import("./components/fader"), { loading }),
  switch: dynamic(() => import("./components/switch"), { loading }),
  "one-time-code": dynamic(() => import("./components/one-time-code"), { loading }),
  ticker: dynamic(() => import("./components/ticker"), { loading }),
  "step-sequencer": dynamic(() => import("./components/step-sequencer"), { loading }),
  knob: dynamic(() => import("./components/knob"), { loading }),
  "tape-reels": dynamic(() => import("./components/tape-reels"), { loading }),
  "vu-meter": dynamic(() => import("./components/vu-meter"), { loading }),
  "agent-shapes": dynamic(() => import("./components/agent-shapes"), { loading }),
  "agent-run": dynamic(() => import("./components/agent-run"), { loading }),
  "agent-loaders": dynamic(() => import("./components/agent-loaders"), { loading }),
  "dither-card": dynamic(() => import("./components/dither-card"), { loading }),
  "spotlight-card": dynamic(() => import("./components/spotlight-card"), { loading }),
  "toast-stack": dynamic(() => import("./components/toast-stack"), { loading }),
  "hold-to-confirm": dynamic(() => import("./components/hold-to-confirm"), { loading }),
  "number-ticker": dynamic(() => import("./components/number-ticker"), { loading }),
  "segmented-control": dynamic(() => import("./components/segmented-control"), { loading }),
  "magnetic-button": dynamic(() => import("./components/magnetic-button"), { loading }),
  "copy-button": dynamic(() => import("./components/copy-button"), { loading }),
};
