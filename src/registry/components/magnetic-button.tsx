"use client";

import { useRef, type ComponentPropsWithoutRef, type PointerEvent } from "react";

type MagneticButtonProps = ComponentPropsWithoutRef<"button"> & {
  /** How far (0–1) the button follows the pointer. */
  strength?: number;
};

/**
 * A button that leans toward the cursor, with its label travelling a little
 * further than its body for a sense of depth. Transforms are written straight
 * to the DOM; the spring-back is a pure CSS transition. Users with reduced
 * motion get a static button (the global stylesheet zeroes transitions and
 * we skip the transform entirely).
 */
export function MagneticButton({
  strength = 0.35,
  className = "",
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(event);
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    el.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    if (labelRef.current) {
      labelRef.current.style.transform = `translate3d(${dx * strength * 0.5}px, ${dy * strength * 0.5}px, 0)`;
    }
  }

  function handleLeave(event: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(event);
    if (ref.current) ref.current.style.transform = "";
    if (labelRef.current) labelRef.current.style.transform = "";
  }

  return (
    <button
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`relative inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-body font-medium text-canvas shadow-[0_1px_0_0_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_rgb(0_0_0/0.35)] transition-transform duration-(--duration-move) ease-spring will-change-transform hover:duration-(--duration-enter) hover:ease-out active:scale-[0.97] ${className}`}
      {...props}
    >
      <span
        ref={labelRef}
        className="inline-flex items-center gap-2 transition-transform duration-(--duration-move) ease-spring will-change-transform"
      >
        {children}
      </span>
    </button>
  );
}

export default function Demo() {
  return (
    <div className="flex flex-col items-center gap-5">
      <MagneticButton type="button">
        Get early access
        <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
          <path d="M3 8h10m0 0L9 4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </MagneticButton>
      <p className="text-meta text-muted">Move your cursor close to it</p>
    </div>
  );
}
