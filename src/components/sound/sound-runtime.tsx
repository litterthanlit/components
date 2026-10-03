"use client";

import { useEffect } from "react";
import { installSound } from "@/lib/sound";

/**
 * Loads the UI sound runtime on every page, so keys marked `data-sound`
 * (Button, ButtonLink, IconButton) click from the first press. Renders nothing.
 */
export function SoundRuntime() {
  useEffect(() => installSound(), []);
  return null;
}
