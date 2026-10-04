const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "Fn"]);

/** The element focused quietly last: only one element holds focus, so only one is quiet. */
let quiet: AbortController | null = null;

/**
 * Focus that follows the hand rather than the keyboard: a press on a control
 * focuses it, so the keys pick up where the hand left off, but draws no
 * focus ring. `focusVisible: false` asks for that, and Chromium ignores it,
 * so the element also carries `data-quiet` (globals.css turns its ring off)
 * until the next key is pressed, when the ring comes back, or focus moves
 * on. A modifier on its own (Shift for a fine drag) leaves it quiet.
 */
export function focusQuietly(el: HTMLElement | null | undefined) {
  if (!el) return;
  quiet?.abort();
  const done = new AbortController();
  const { signal } = done;
  quiet = done;
  el.setAttribute("data-quiet", "");
  signal.addEventListener("abort", () => el.removeAttribute("data-quiet"));
  const clear = () => {
    done.abort();
    if (quiet === done) quiet = null;
  };
  el.ownerDocument.addEventListener("keydown", (e) => MODIFIERS.has(e.key) || clear(), { capture: true, signal });
  // The window losing focus blurs the element too, but it is still the one focused when the window comes back.
  el.addEventListener("blur", () => el.ownerDocument.activeElement === el || clear(), { signal });
  el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}
