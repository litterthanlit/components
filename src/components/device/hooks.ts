"use client";

import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** The content box of an element, kept current with a ResizeObserver. */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setSize((s) => (s && Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const mq = window.matchMedia(motionQuery);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => false);
}

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
export function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
}

/**
 * A small preference remembered per viewer in localStorage. Reads fall back
 * to `initial` wherever storage is unavailable; every hook using the same
 * store updates together.
 */
function createPreference<T extends string>(key: string, values: readonly T[], initial: T) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    try {
      const value = localStorage.getItem(key);
      return values.includes(value as T) ? (value as T) : initial;
    } catch {
      return initial;
    }
  };
  const write = (value: T) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
    listeners.forEach((l) => l());
  };
  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  const use = () => useSyncExternalStore(subscribe, read, () => initial);
  return { read, write, use };
}

/** How long the tape stays on each study while it plays, in seconds. */
export const takeLengths = ["3", "4", "6"] as const;
export const takeLength = createPreference("device-take", takeLengths, "4");

/**
 * Focus that follows the hand (a press on the dial or the tape) rather than
 * the keyboard: no focus ring. Browsers without the option simply focus.
 */
export function focusQuietly(el: HTMLElement | null) {
  el?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
