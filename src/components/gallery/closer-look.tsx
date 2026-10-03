"use client";

import { useLayoutEffect, useRef, type PointerEvent } from "react";
import { ButtonLink, IconButton, tokens } from "@/design-system";
import { Preview } from "./preview";

type CloserLookProps = {
  /** The component on show; null keeps the dialog closed and its demo unmounted. */
  entry: { slug: string; title: string } | null;
  /** The card the dialog grows out of and shrinks back into. */
  origin: () => Element | null | undefined;
  /** Called once the dialog has closed, however it was closed. */
  onClose: () => void;
};

const curve = (token: string) => tokens.motion.curves.find((c) => c.token === token)!.value;
const ms = (token: string) => tokens.motion.durations.find((d) => d.token === token)!.ms;

/**
 * Plays the panel from the card's box to its own (or back), with the backdrop
 * fading alongside. Reduced motion keeps only the fade.
 */
function fly(dialog: HTMLDialogElement, panel: HTMLElement, from: Element | null | undefined, direction: "in" | "out") {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let start = "none";
  if (from && !reduced) {
    const a = from.getBoundingClientRect();
    const b = panel.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    start = `translate(${dx}px, ${dy}px) scale(${a.width / b.width})`;
  }
  const timing: KeyframeAnimationOptions =
    direction === "in"
      ? { duration: reduced ? ms("duration-exit") : ms("duration-move"), easing: curve("ease-drawer"), fill: "both" }
      : { duration: reduced ? ms("duration-exit") : ms("duration-enter"), easing: curve("ease-out"), fill: "both", direction: "reverse" };
  dialog.animate({ opacity: [0, 1] }, { ...timing, pseudoElement: "::backdrop" });
  // The panel is opaque well before it reaches full size, so it reads as the card growing.
  return panel.animate(
    [
      { transform: start, opacity: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: "none", opacity: 1 },
    ],
    timing,
  );
}

/**
 * A modal closer look at one component: the live demo on a large stage, its
 * title and a link to its page. Native <dialog> + showModal(), so focus is
 * trapped, Esc closes and the page behind is inert.
 */
export function CloserLook({ entry, origin, onClose }: CloserLookProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const pressedBackdrop = useRef(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!entry || !dialog || !panel || dialog.open) return;
    closing.current = false;
    dialog.showModal();
    fly(dialog, panel, origin(), "in");
  }, [entry, origin]);

  function close() {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog?.open || !panel || closing.current) return;
    closing.current = true;
    fly(dialog, panel, origin(), "out").finished.then(
      () => dialog.close(),
      () => dialog.close(),
    );
  }

  function handleClosed() {
    const dialog = dialogRef.current;
    for (const animation of dialog?.getAnimations({ subtree: true }) ?? []) animation.cancel();
    onClose();
  }

  // A press that starts and ends on the backdrop closes; a drag out of the panel doesn't.
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressedBackdrop.current = event.target === event.currentTarget;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="closer-look-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={handleClosed}
      onPointerDown={handlePointerDown}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-none max-w-none overflow-visible bg-transparent p-0 text-ink backdrop:bg-black/20 backdrop:backdrop-blur-[6px] dark:backdrop:bg-black/60"
    >
      <div
        ref={panelRef}
        className="max-h-[calc(100dvh-2rem)] w-[min(60rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-canvas p-4 shadow-lg sm:p-6"
      >
        {entry && (
          <>
            <div className="flex items-center gap-3">
              <h2 id="closer-look-title" className="mr-auto text-title font-medium text-ink">
                {entry.title}
              </h2>
              <ButtonLink href={`/c/${entry.slug}`} size="sm">
                Open page <span aria-hidden>→</span>
              </ButtonLink>
              <IconButton label="Close" size="sm" onClick={close} className="-mr-1">
                <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-3.5">
                  <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </IconButton>
            </div>
            <Preview slug={entry.slug} className="mt-2 h-[22rem] sm:h-[30rem]" />
          </>
        )}
      </div>
    </dialog>
  );
}
