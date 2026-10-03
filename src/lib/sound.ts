"use client";

/**
 * UI sound: short, synthesized clicks for the device on the home page and the
 * site's physical keys. No audio files; everything is made with Web Audio.
 *
 * This is the contract. Callers fire-and-forget `play(name)`; it must never
 * throw, never block, and do nothing until the page has had a user gesture
 * (browsers keep audio locked until then) or while muted.
 */

export type SoundName =
  /** One detent of the click wheel. Fired rapidly while turning; keep it tiny. */
  | "tick"
  /** A physical key or wheel segment going down. */
  | "press"
  /** The same key coming back up. */
  | "release"
  /** The centre button: choosing a menu item or opening a prototype. */
  | "select"
  /** MENU: going back a level. */
  | "back"
  /** A prototype filling the screen. */
  | "open"
  /** Leaving a prototype. */
  | "close"
  /** A switch flipping (the hold / mute switch, theme). */
  | "toggle"
  /** Hitting the end of a list: a duller tick. */
  | "bump"
  /** First interaction: the device waking. Played at most once per page load. */
  | "wake";

export type PlayOptions = {
  /** Multiplies the base pitch, e.g. 1.05 to vary repeated ticks. Default 1. */
  pitch?: number;
  /** Multiplies the base gain (0–1). Default 1. */
  gain?: number;
};

/** Plays a UI sound. A no-op on the server, before the first gesture, or while muted. */
export function play(name: SoundName, options?: PlayOptions): void {
  void name;
  void options;
}

/** Whether UI sound is muted. Persisted per viewer. */
export function isMuted(): boolean {
  return false;
}

export function setMuted(muted: boolean): void {
  void muted;
}

/** Subscribes to mute changes, for useSyncExternalStore. Returns the unsubscribe. */
export function subscribeMuted(callback: () => void): () => void {
  void callback;
  return () => {};
}

/** React binding: `const { muted, setMuted, play } = useSound()`. */
export function useSound() {
  return { muted: isMuted(), setMuted, play };
}
