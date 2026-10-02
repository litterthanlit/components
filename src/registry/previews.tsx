"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Lazily-loaded demos, keyed by registry slug. Each demo is its own chunk,
 * so the home page only pays for what scrolls into view.
 */
const loading = () => <div className="size-6 animate-pulse rounded-full bg-line" />;

export const previews: Record<string, ComponentType> = {
  "dither-card": dynamic(() => import("./components/dither-card"), { loading }),
  "spotlight-card": dynamic(() => import("./components/spotlight-card"), { loading }),
  "toast-stack": dynamic(() => import("./components/toast-stack"), { loading }),
  "hold-to-confirm": dynamic(() => import("./components/hold-to-confirm"), { loading }),
  "number-ticker": dynamic(() => import("./components/number-ticker"), { loading }),
  "segmented-control": dynamic(() => import("./components/segmented-control"), { loading }),
  "magnetic-button": dynamic(() => import("./components/magnetic-button"), { loading }),
  "copy-button": dynamic(() => import("./components/copy-button"), { loading }),
};
