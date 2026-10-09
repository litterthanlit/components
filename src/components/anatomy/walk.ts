"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const FIRST = 900; // ms after opening before the first floor is named
const NEXT = 1600; // ms on each floor as the walk goes down the stack

/**
 * Untouched, an anatomy walks down its stack once, picking each floor in
 * turn, so it moves on its own as a study does. A hand ends the walk for
 * good; opening the anatomy again lets it walk again. Never under reduced
 * motion.
 */
export function useWalk(open: boolean, kinds: string[], pick: (kind: string) => void) {
  const touched = useRef(false);
  const walked = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pickRef = useRef(pick);
  useLayoutEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    if (!open || !kinds.length || walked.current || touched.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timers.current = kinds.map((kind, i) =>
      setTimeout(() => {
        pickRef.current(kind);
        if (i === kinds.length - 1) walked.current = true;
      }, FIRST + i * NEXT),
    );
    const pending = timers;
    return () => {
      pending.current.forEach(clearTimeout);
      pending.current = [];
    };
  }, [open, kinds]);

  return {
    /** A hand is on it: the walk is over. */
    touch() {
      touched.current = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    /** Opened again: it may walk again. */
    reset() {
      touched.current = false;
      walked.current = false;
    },
  };
}
