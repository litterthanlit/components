/**
 * A damped spring, integrated with small fixed steps so it stays stable at
 * any frame rate. Values are written through `onUpdate` (usually straight
 * to a style), so springs never re-render React.
 *
 * Unlike a duration + curve, a spring keeps its velocity when the target
 * moves mid-flight, so interrupted motion stays continuous.
 */
export type SpringConfig = {
  /** Pull toward the target. Higher is faster. */
  stiffness: number;
  /** Resistance. Lower overshoots more; ~2·√(stiffness·mass) has no overshoot. */
  damping: number;
  mass?: number;
};

/** Presets, mirrored in tokens.ts and documented on /system. */
export const springs = {
  /** UI that follows input: indicators, toggles. Barely overshoots. */
  snappy: { stiffness: 520, damping: 40 },
  /** Default for things settling into place. */
  gentle: { stiffness: 170, damping: 22 },
  /** Playful returns: magnetic elements, dropped items. Visible overshoot. */
  bouncy: { stiffness: 260, damping: 12 },
} satisfies Record<string, SpringConfig>;

const STEP = 1 / 240;
const REST = 0.01;

export function createSpring(initial: number, config: SpringConfig, onUpdate: (value: number) => void) {
  const { stiffness, damping, mass = 1 } = config;
  let value = initial;
  let velocity = 0;
  let target = initial;
  let raf = 0;
  let last = 0;

  function frame(now: number) {
    let dt = Math.min(0.064, last ? (now - last) / 1000 : STEP);
    last = now;
    while (dt > 0) {
      const h = Math.min(STEP, dt);
      const force = -stiffness * (value - target) - damping * velocity;
      velocity += (force / mass) * h;
      value += velocity * h;
      dt -= h;
    }
    if (Math.abs(velocity) < REST && Math.abs(value - target) < REST) {
      value = target;
      velocity = 0;
      onUpdate(value);
      raf = 0;
      last = 0;
      return;
    }
    onUpdate(value);
    raf = requestAnimationFrame(frame);
  }

  return {
    /** Animate toward `next`, keeping current velocity. */
    set(next: number) {
      target = next;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    /** Move instantly (first layout, reduced motion). */
    jump(next: number) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      value = target = next;
      velocity = 0;
      onUpdate(value);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
    get value() {
      return value;
    },
  };
}

export type Spring = ReturnType<typeof createSpring>;
