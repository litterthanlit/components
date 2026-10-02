"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type PointerEvent } from "react";

/* A tiny damped spring (the same solver as the design system's createSpring),
   inlined so this file stays copy-paste ready. Fixed 1/240s steps keep it
   stable at any frame rate; values go straight to the DOM, never to state. */
type SpringConfig = { stiffness: number; damping: number };

function createSpring(config: SpringConfig, onUpdate: (value: number) => void) {
  let value = 0, velocity = 0, target = 0, raf = 0, last = 0;
  function frame(now: number) {
    let dt = Math.min(0.064, last ? (now - last) / 1000 : 1 / 240);
    last = now;
    while (dt > 0) {
      const h = Math.min(1 / 240, dt);
      velocity += (-config.stiffness * (value - target) - config.damping * velocity) * h;
      value += velocity * h;
      dt -= h;
    }
    const resting = Math.abs(velocity) < 0.01 && Math.abs(value - target) < 0.01;
    if (resting) value = target;
    onUpdate(value);
    raf = resting ? 0 : requestAnimationFrame(frame);
    if (resting) last = 0;
  }
  return {
    set(next: number) {
      target = next;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop: () => cancelAnimationFrame(raf),
  };
}

const BOUNCY: SpringConfig = { stiffness: 260, damping: 12 };

type MagneticButtonProps = ComponentPropsWithoutRef<"button"> & {
  /** How far (0–1) the button follows the pointer. */
  strength?: number;
  /** Lower damping overshoots more on release. */
  spring?: SpringConfig;
};

/**
 * A button that leans toward the cursor on a real spring. Each axis is its own
 * damped oscillator, so moving the cursor mid-flight keeps the momentum, and
 * letting go overshoots and settles instead of easing to a stop. The label
 * rides half as far again for a sense of depth. Reduced motion: no movement.
 */
export function MagneticButton({
  strength = 0.35,
  spring = BOUNCY,
  className = "",
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const springs = useRef<{ x: ReturnType<typeof createSpring>; y: ReturnType<typeof createSpring> } | null>(null);

  useEffect(() => {
    const pos = { x: 0, y: 0 };
    const write = () => {
      if (ref.current) ref.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (labelRef.current) labelRef.current.style.transform = `translate3d(${pos.x * 0.5}px, ${pos.y * 0.5}px, 0)`;
    };
    const x = createSpring(spring, (v) => ((pos.x = v), write()));
    const y = createSpring(spring, (v) => ((pos.y = v), write()));
    springs.current = { x, y };
    return () => {
      x.stop();
      y.stop();
    };
  }, [spring]);

  function handleMove(event: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(event);
    const el = ref.current;
    if (!el || !springs.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Measure without our own transform so the target doesn't chase itself.
    const rect = el.getBoundingClientRect();
    const current = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const cx = rect.left - current.m41 + rect.width / 2;
    const cy = rect.top - current.m42 + rect.height / 2;
    springs.current.x.set((event.clientX - cx) * strength);
    springs.current.y.set((event.clientY - cy) * strength);
  }

  function handleLeave(event: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(event);
    springs.current?.x.set(0);
    springs.current?.y.set(0);
  }

  return (
    <button
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`relative inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-body font-medium text-canvas shadow-[0_1px_0_0_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_rgb(0_0_0/0.35)] transition-[scale] duration-(--duration-exit) ease-out will-change-transform active:scale-[0.97] ${className}`}
      {...props}
    >
      <span ref={labelRef} className="inline-flex items-center gap-2 will-change-transform">
        {children}
      </span>
    </button>
  );
}

export default function Demo() {
  return (
    <div className="flex flex-col items-center gap-5">
      {/* The entrance runs on a wrapper so it never fights the spring's transform. */}
      <div className="animate-enter">
        <MagneticButton type="button">
          Get early access
          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
            <path d="M3 8h10m0 0L9 4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </MagneticButton>
      </div>
      <p className="animate-enter text-meta text-muted [animation-delay:var(--stagger)]">
        Move your cursor close, then let go
      </p>
    </div>
  );
}
