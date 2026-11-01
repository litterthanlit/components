"use client";

import { useEffect, useRef } from "react";

/*
 * The harness every symbiote prototype runs in: a Canvas 2D page of dotted
 * paper in true isometric, a frame loop, the pointer on the floor, and the
 * few ink helpers they share, so each prototype is only its idea.
 *
 * World units: x and z on the floor, y up. The page shows about ±4.5 units
 * across. Isometric: a floor step in x goes right and down, one in z goes
 * left and down, at 30° (cos 30° across, sin 30° down), and y goes straight up.
 */

export const INK = "#0a0a0a";
export const PAPER = "#ffffff";
export const DOTS = "#cfcfcf";
export const BOIL = 8; // redraws a second: the ink's wobble steps at this rate

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

export type View = {
  width: number; // CSS pixels
  height: number;
  scale: number; // CSS pixels per world unit
  ox: number; // where the world's origin lands
  oy: number;
};

export type Pointer = {
  /** On the floor, world units. */
  x: number;
  z: number;
  /** On the canvas, CSS pixels. */
  sx: number;
  sy: number;
  /** Floor velocity, world units a second (smoothed). */
  vx: number;
  vz: number;
  present: boolean;
  pressed: boolean;
  /** Seconds since the pointer last arrived, pressed or released. */
  since: { arrive: number; press: number; release: number };
  /** True while the harness's ghost drives it: no hand has arrived yet. */
  ghost: boolean;
};

/**
 * The ghost: until a hand arrives, a pointer drifts in a widening figure of
 * eight, holds the button down once, and leaves, every 9 s.
 */
export function ghostAt(t: number) {
  const k = t % 9;
  const present = k > 0.6 && k < 7.4;
  const r = 0.6 + 1.6 * Math.min(1, k / 6);
  const a = k * 1.25;
  return { x: r * Math.sin(a), z: r * Math.sin(a * 2) * 0.55, present, pressed: k > 3.2 && k < 4.2 };
}

export type Frame = {
  ctx: CanvasRenderingContext2D;
  view: View;
  pointer: Pointer;
  /** Seconds since the prototype mounted, and since the last frame. */
  time: number;
  dt: number;
  /** The boil's step: an integer that changes BOIL times a second. */
  boil: number;
};

/** A prototype: called once with the first view, it returns its frame function (and optional cleanup). */
export type Prototype = (view: View) => { frame: (f: Frame) => void; dispose?: () => void };

export function makeView(width: number, height: number): View {
  // Fit ±4.5 world units across, or the floor's diamond height, whichever is tighter.
  const scale = Math.min(width / (2 * 4.6 * COS), height / (2 * 4.6 * SIN + 1.6));
  return { width, height, scale, ox: width / 2, oy: height / 2 + scale * 0.3 };
}

/** World to screen. */
export function project(v: View, x: number, y: number, z: number): [number, number] {
  return [v.ox + (x - z) * COS * v.scale, v.oy + ((x + z) * SIN - y) * v.scale];
}

/** Screen to the floor (y = 0). */
export function unproject(v: View, sx: number, sy: number): { x: number; z: number } {
  const a = (sx - v.ox) / (COS * v.scale); // x − z
  const b = (sy - v.oy) / (SIN * v.scale); // x + z
  return { x: (a + b) / 2, z: (b - a) / 2 };
}

/** A hash to [0, 1). Deterministic, so the same needle wobbles the same way on the same boil step. */
export function hash(a: number, b = 0, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** −0.5 to 0.5, new on every boil step: a hand-drawn line's wobble. */
export const wobble = (id: number, salt: number, boil: number) => hash(id, salt, boil) - 0.5;

/** Seeded random, for placing things the same way every mount. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clears to white paper with notebook dots on the isometric lattice. */
export function paper(ctx: CanvasRenderingContext2D, v: View) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.fillStyle = DOTS;
  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const [x, y] = project(v, i * 0.5, 0, j * 0.5);
      if (x < -4 || y < -4 || x > v.width + 4 || y > v.height + 4) continue;
      ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
  }
}

/**
 * One needle as a tapered pen stroke from a root to a tip, bent toward the
 * tip like a blade of grass, with a white gap round it so it reads on black.
 */
export function needle(ctx: CanvasRenderingContext2D, root: [number, number], tip: [number, number], width: number, gap = true, gapScale = 1) {
  const [x0, y0] = root;
  const [x1, y1] = tip;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = -dy / len, ny = dx / len;
  // A bend: the control point sits a little to one side of the midpoint.
  const cx = x0 + dx * 0.55 + nx * len * 0.06, cy = y0 + dy * 0.55 + ny * len * 0.06;
  const shape = (w: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 + nx * w, y0 + ny * w);
    ctx.quadraticCurveTo(cx + nx * w * 0.5, cy + ny * w * 0.5, x1, y1);
    ctx.quadraticCurveTo(cx - nx * w * 0.5, cy - ny * w * 0.5, x0 - nx * w, y0 - ny * w);
    ctx.closePath();
    ctx.fill();
  };
  if (gap) {
    ctx.fillStyle = PAPER;
    shape((width * 1.6 + 1) * gapScale);
  }
  ctx.fillStyle = INK;
  shape(width / 2);
}

/**
 * Mounts a prototype on a canvas that fills its box, runs its frame loop
 * while on screen, and keeps the pointer on the floor.
 */
export function ProtoCanvas({ prototype, className = "" }: { prototype: Prototype; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const canvas = document.createElement("canvas");
    canvas.className = "block size-full touch-none";
    host.append(canvas);
    const ctx = canvas.getContext("2d")!;
    let view = makeView(1, 1);
    let proto: ReturnType<Prototype> | null = null;
    const pointer: Pointer = { x: 0, z: 0, sx: 0, sy: 0, vx: 0, vz: 0, present: false, pressed: false, since: { arrive: 1e9, press: 1e9, release: 1e9 }, ghost: true };
    let raf = 0, last = 0, time = 0;
    let visible = false;

    function resize() {
      const rect = host.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view = makeView(rect.width, rect.height);
      proto ??= prototype(view);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      time += dt;
      for (const k of ["arrive", "press", "release"] as const) pointer.since[k] += dt;
      if (pointer.ghost) drive(dt);
      ctx.save();
      proto!.frame({ ctx, view, pointer, time, dt, boil: Math.floor(time * BOIL) });
      ctx.restore();
      raf = visible ? requestAnimationFrame(frame) : 0;
    }

    /** The ghost's pointer, with the same velocity and edges a hand's would have. */
    function drive(dt: number) {
      const g = ghostAt(time);
      if (g.present && !pointer.present) pointer.since.arrive = 0;
      if (g.pressed && !pointer.pressed) pointer.since.press = 0;
      if (!g.pressed && pointer.pressed) pointer.since.release = 0;
      pointer.vx = g.present && pointer.present ? (g.x - pointer.x) / Math.max(dt, 1e-3) : 0;
      pointer.vz = g.present && pointer.present ? (g.z - pointer.z) / Math.max(dt, 1e-3) : 0;
      pointer.x = g.x;
      pointer.z = g.z;
      [pointer.sx, pointer.sy] = project(view, g.x, 0, g.z);
      pointer.present = g.present;
      pointer.pressed = g.pressed;
    }

    let prev = { x: 0, z: 0, t: 0 };
    function aim(e: PointerEvent) {
      if (pointer.ghost) {
        pointer.ghost = false; // a hand: the ghost is gone for good
        pointer.present = pointer.pressed = false;
      }
      const rect = canvas.getBoundingClientRect();
      pointer.sx = e.clientX - rect.left;
      pointer.sy = e.clientY - rect.top;
      const floor = unproject(view, pointer.sx, pointer.sy);
      const t = performance.now() / 1000;
      const h = Math.max(t - prev.t, 1 / 240);
      if (pointer.present) {
        const k = Math.min(1, h * 12);
        pointer.vx += ((floor.x - prev.x) / h - pointer.vx) * k;
        pointer.vz += ((floor.z - prev.z) / h - pointer.vz) * k;
      } else {
        pointer.present = true;
        pointer.since.arrive = 0;
        pointer.vx = pointer.vz = 0;
      }
      prev = { x: floor.x, z: floor.z, t };
      pointer.x = floor.x;
      pointer.z = floor.z;
    }
    const down = (e: PointerEvent) => {
      aim(e);
      pointer.pressed = true;
      pointer.since.press = 0;
    };
    const up = () => {
      pointer.pressed = false;
      pointer.since.release = 0;
    };
    const leave = () => {
      pointer.present = pointer.pressed = false;
      pointer.vx = pointer.vz = 0;
    };
    host.addEventListener("pointermove", aim);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    // Velocity decays when the pointer rests, since no move event says so.
    const rest = setInterval(() => {
      if (performance.now() / 1000 - prev.t > 0.06) {
        pointer.vx *= 0.5;
        pointer.vz *= 0.5;
      }
    }, 50);

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(host);

    return () => {
      cancelAnimationFrame(raf);
      visible = false;
      clearInterval(rest);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", aim);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      proto?.dispose?.();
      canvas.remove();
    };
  }, [prototype]);

  return <div ref={hostRef} className={`cursor-crosshair bg-white ${className}`} />;
}
