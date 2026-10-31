"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { focusQuietly } from "@/design-system";
import { hostTransport, play } from "@/lib/sound";

/*
 * A pointer-reactive field of needles on a sphere: attract or repel, as a
 * magnetic field would. A thousand thin cones, Fibonacci-distributed so they
 * cover the sphere evenly, are one InstancedMesh — one draw call. The pointer
 * is raycast onto a plane through the centre; needles within an angular
 * radius tilt toward it or away, on a damped ease, and the whole group leans
 * a little. A ghost orbits until a hand takes over.
 *
 * Plain three, no React Three Fiber. The loop writes instance matrices, never
 * React state; it stops off-screen. Reduced motion snaps and never orbits.
 * Colours come from the device's tokens, so the field stays monochrome with
 * the rest of the plate.
 */

const NEEDLES = 1000;
const NEEDLE_LENGTH = 0.9; // world units; the sphere is 1
const NEEDLE_RADIUS = 0.012;
const SPHERE_RADIUS = 1;
const INFLUENCE = 0.9; // radians of angular falloff
const STRENGTH = 0.9; // max tilt, radians
const DAMPING = 0.12; // per-frame lerp; higher is snappier
const GROUP_LEAN = 0.25; // whole-group lean toward the pointer, radians
const IDLE_SPEED = 1.15; // rad/s of the ghost's orbit
const IDLE_RADIUS = 0.58; // NDC radius of that orbit
const DPR_CAP = 2;
const STEP = 2000; // ms on each mode before the demo flips attract ↔ repel

export type NeedleMode = "attract" | "repel";

export type NeedleOptions = {
  needleCount?: number;
  needleLength?: number;
  needleRadius?: number;
  sphereRadius?: number;
  mode?: NeedleMode;
  influenceRadius?: number;
  strength?: number;
  damping?: number;
  groupLean?: number;
  /** Ghost orbit until a pointer takes over. */
  idle?: boolean;
  needleColor?: THREE.ColorRepresentation;
  sphereColor?: THREE.ColorRepresentation;
  background?: THREE.ColorRepresentation | null;
};

type SceneOptions = Required<NeedleOptions>;

export const DEFAULTS: SceneOptions = {
  needleCount: NEEDLES,
  needleLength: NEEDLE_LENGTH,
  needleRadius: NEEDLE_RADIUS,
  sphereRadius: SPHERE_RADIUS,
  mode: "attract",
  influenceRadius: INFLUENCE,
  strength: STRENGTH,
  damping: DAMPING,
  groupLean: GROUP_LEAN,
  idle: true,
  needleColor: "#f5f5f5",
  sphereColor: "#0d0d0e",
  background: null,
};

export type NeedleScene = {
  set: (patch: Partial<NeedleOptions>) => void;
  setPointer: (x: number | null, y?: number) => void;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
};

const token = (el: HTMLElement, name: string, fallback: string) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

function applyOptions(target: SceneOptions, patch: Partial<NeedleOptions>) {
  for (const [key, value] of Object.entries(patch) as [keyof NeedleOptions, NeedleOptions[keyof NeedleOptions]][]) {
    if (value !== undefined) Object.assign(target, { [key]: value });
  }
}

/** Framework-free core. `createNeedleScene(el, opts)` mounts a renderer in `el`. */
export function createNeedleScene(container: HTMLElement, opts: NeedleOptions = {}): NeedleScene {
  const o: SceneOptions = { ...DEFAULTS };
  applyOptions(o, opts);
  const reduced = reducedMotion();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
  renderer.setClearColor(o.background ?? 0x000000, o.background == null ? 0 : 1);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);

  // Soft fill, a key from above-right, a white rim from behind — no coloured light.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-4, 1, -5);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  const sphereMat = new THREE.MeshStandardMaterial({ color: o.sphereColor, roughness: 0.35, metalness: 0.4 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(o.sphereRadius, 64, 32), sphereMat);
  group.add(sphere);

  // Cone pointing +Y with its base at the origin, so it pivots at the sphere surface.
  const needleGeo = new THREE.ConeGeometry(o.needleRadius, o.needleLength, 6, 1, true);
  needleGeo.translate(0, o.needleLength / 2, 0);
  const needleMat = new THREE.MeshStandardMaterial({ color: o.needleColor, roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide });
  const needles = new THREE.InstancedMesh(needleGeo, needleMat, o.needleCount);
  needles.frustumCulled = false;
  group.add(needles);

  const n = o.needleCount;
  const rest: THREE.Vector3[] = [];
  const cur: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const t = golden * i;
    const d = new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
    rest.push(d);
    cur.push(d.clone());
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const target = new THREE.Vector3();
  let active = false;
  let hand = false; // a real pointer has been here: the ghost never comes back

  function setPointer(x: number | null, y?: number) {
    if (x == null || y == null) {
      active = false;
      return;
    }
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    active = !!ray.ray.intersectPlane(plane, target);
  }

  const onMove = (e: PointerEvent) => {
    // Chrome also sends moves as the study slides in under a resting cursor; those don't count.
    if (e.pointerType === "mouse" && !e.movementX && !e.movementY) return;
    hand = true;
    const r = container.getBoundingClientRect();
    setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onLeave = () => {
    if (hand) setPointer(null);
  };
  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerleave", onLeave);

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const paint = () => {
    needleMat.color.set(o.needleColor);
    sphereMat.color.set(o.sphereColor);
  };
  const theme = new MutationObserver(paint);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const want = new THREE.Vector3();
  const local = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const front = new THREE.Vector3();
  const pDir = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const origin = performance.now();
  let visible = true;

  function frame() {
    const k = reduced ? 1 : o.damping;
    const sign = o.mode === "attract" ? 1 : -1;
    const ghosting = o.idle && !hand && !reduced;

    if (ghosting) {
      const t = ((performance.now() - origin) / 1000) * IDLE_SPEED;
      ndc.set(Math.cos(t) * IDLE_RADIUS, Math.sin(t * 0.9) * IDLE_RADIUS * 0.75);
      ray.setFromCamera(ndc, camera);
      active = !!ray.ray.intersectPlane(plane, target);
    }

    const tx = active ? (-target.y / 3) * o.groupLean : 0;
    const ty = active ? (target.x / 3) * o.groupLean : 0;
    if (!reduced) {
      group.rotation.x += (tx - group.rotation.x) * k;
      group.rotation.y += (ty - group.rotation.y) * k;
    } else {
      group.rotation.x = tx;
      group.rotation.y = ty;
    }
    group.updateMatrixWorld();
    inv.copy(group.matrixWorld).invert();
    front.set(0, 0, o.sphereRadius);
    local.copy(target).add(front).applyMatrix4(inv);
    pDir.copy(local).normalize();

    for (let i = 0; i < n; i++) {
      want.copy(rest[i]);
      if (active) {
        const ang = rest[i].angleTo(pDir);
        const f = Math.max(0, 1 - ang / o.influenceRadius);
        if (f > 0) {
          const fall = f * f * (3 - 2 * f); // smoothstep
          radial.copy(rest[i]).multiplyScalar(o.sphereRadius);
          offset.copy(local).sub(radial);
          axis.copy(rest[i]).cross(offset);
          if (axis.lengthSq() > 1e-8) {
            axis.normalize();
            want.applyAxisAngle(axis, sign * o.strength * fall);
          }
        }
      }
      cur[i].lerp(want, k).normalize();
      q.setFromUnitVectors(up, cur[i]);
      pos.copy(rest[i]).multiplyScalar(o.sphereRadius);
      needles.setMatrixAt(i, m.compose(pos, q, one));
    }
    needles.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function playLoop(on: boolean) {
    renderer.setAnimationLoop(on && visible ? frame : null);
  }
  playLoop(true);

  const seeing = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    playLoop(true);
  });
  seeing.observe(container);

  return {
    set(patch) {
      applyOptions(o, patch);
      if (patch.needleColor != null || patch.sphereColor != null) paint();
    },
    setPointer,
    scene,
    camera,
    renderer,
    dispose() {
      playLoop(false);
      ro.disconnect();
      seeing.disconnect();
      theme.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      needleGeo.dispose();
      needleMat.dispose();
      sphere.geometry.dispose();
      sphereMat.dispose();
      needles.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export type NeedleFieldProps = Omit<NeedleOptions, "background" | "needleColor" | "sphereColor"> & {
  colors?: { needle?: string; sphere?: string; background?: string | null };
  className?: string;
};

/**
 * A 'use client' wrapper: ResizeObserver, a DPR cap, reduced motion, full
 * dispose on unmount. Changing geometry or colours rebuilds the scene; mode
 * and the feel knobs update in place.
 */
export function NeedleField({
  needleCount,
  needleLength,
  needleRadius,
  sphereRadius,
  mode = "attract",
  influenceRadius,
  strength,
  damping,
  groupLean,
  idle = true,
  colors,
  className,
}: NeedleFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<NeedleScene | null>(null);
  const live = useRef<Partial<NeedleOptions>>({ mode, influenceRadius, strength, damping, groupLean, idle });
  const needle = colors?.needle;
  const sphere = colors?.sphere;
  const background = colors?.background;

  useLayoutEffect(() => {
    live.current = { mode, influenceRadius, strength, damping, groupLean, idle };
    handle.current?.set(live.current);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scene = createNeedleScene(el, {
      needleCount,
      needleLength,
      needleRadius,
      sphereRadius,
      needleColor: needle ?? token(el, "--device-lcd-ink", "#f5f5f5"),
      sphereColor: sphere ?? token(el, "--device-rim", "#0d0d0e"),
      background: background ?? null,
      ...live.current,
    });
    handle.current = scene;
    return () => {
      scene.dispose();
      handle.current = null;
    };
  }, [needleCount, needleLength, needleRadius, sphereRadius, needle, sphere, background]);

  return <div ref={ref} className={cx("absolute inset-0 touch-none", className)} />;
}

/* --- Demo: a window on the field, two keys for attract and repel ---------- */

const MODES: { value: NeedleMode; label: string }[] = [
  { value: "attract", label: "Attract" },
  { value: "repel", label: "Repel" },
];

export default function Demo() {
  const [mode, setMode] = useState<NeedleMode>("attract");
  const [idle, setIdle] = useState(false);
  const [cycling, setCycling] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  function takeOver() {
    if (touched.current) return;
    touched.current = true;
    setCycling(false);
    setIdle(false);
  }

  /** A real move of the hand. Chrome also sends moves as the study slides in under a resting cursor; those don't count. */
  const moved = (e: ReactPointerEvent) => e.pointerType !== "mouse" || e.movementX !== 0 || e.movementY !== 0;

  const powerUp = useEffectEvent(() => {
    if (touched.current || hostTransport(rootRef.current) === "stop") return;
    if (reducedMotion()) return;
    setIdle(true);
    setCycling(true);
  });
  useEffect(() => {
    const root = rootRef.current;
    const start = requestAnimationFrame(powerUp);
    const host = root?.closest("[data-transport]");
    const observer = new MutationObserver(() => hostTransport(root) === "play" && powerUp());
    if (host) observer.observe(host, { attributes: true, attributeFilter: ["data-transport"] });
    return () => {
      cancelAnimationFrame(start);
      observer.disconnect();
    };
  }, []);

  // The ghost flips attract and repel so both read in the first four seconds.
  useEffect(() => {
    if (!cycling) return;
    const root = rootRef.current;
    const id = setTimeout(() => {
      const next: NeedleMode = mode === "attract" ? "repel" : "attract";
      setMode(next);
      if (hostTransport(root) === "play") play("tick", { gain: 0.4, pitch: next === "repel" ? 1.06 : 0.94 });
    }, STEP);
    return () => clearTimeout(id);
  }, [cycling, mode]);

  function onKeyKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: MODES.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= MODES.length || next === i) return play("bump", { gain: 0.6 });
    play("tick");
    setMode(MODES[next].value);
    rootRef.current?.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus();
  }

  function choose(next: NeedleMode) {
    if (next === mode) return;
    setMode(next);
  }

  return (
    <div
      ref={rootRef}
      onPointerDownCapture={takeOver}
      onPointerMove={(e) => moved(e) && takeOver()}
      onKeyDownCapture={takeOver}
      className="@container w-full max-w-[340px] select-none"
    >
      <div data-part="plate" className="relative isolate animate-enter overflow-hidden rounded-[1.25em] p-[0.9em] text-[clamp(11px,4cqw,14px)] [background:var(--device-body)] shadow-[var(--device-body-edge),0_1px_2px_rgb(0_0_0/0.06),0_16px_32px_-18px_rgb(0_0_0/0.3)] @[26rem]:p-[1.1em]">
        <div aria-hidden className="device-grain pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" />

        <div data-part="well" className="rounded-[1.05em] bg-(--device-well) p-[0.4em] shadow-(--device-recess)">
          <div data-part="bezel" className="rounded-[0.7em] bg-(--device-rim) p-[0.3em] shadow-[0_1px_0_rgb(255_255_255/0.7),inset_0_1px_2px_rgb(0_0_0/0.6)] dark:shadow-[0_1px_0_rgb(255_255_255/0.06),inset_0_1px_2px_rgb(0_0_0/0.6)]">
            <div
              data-part="screen"
              role="img"
              aria-label="A sphere of needles that tilt toward the pointer, or away from it."
              className="relative aspect-[5/4] overflow-hidden rounded-[0.45em] [background:var(--device-window)]"
            >
              <NeedleField mode={mode} idle={idle} />
              <span aria-hidden data-part="glass" className="pointer-events-none absolute inset-0 rounded-[inherit] [background:var(--screen-glass)]" />
            </div>
          </div>
        </div>

        <div role="radiogroup" aria-label="Field mode" className="mt-[0.7em] grid grid-cols-2 gap-[0.55em]">
          {MODES.map((item, i) => {
            const on = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                data-key={i}
                data-sound="key"
                data-part="key"
                onPointerDown={(e) => e.button === 0 && focusQuietly(e.currentTarget)}
                onClick={() => choose(item.value)}
                onKeyDown={(e) => onKeyKeyDown(e, i)}
                className="group/key rounded-[0.7em] outline-offset-2"
              >
                <span className="relative grid h-[2.5em] place-items-center rounded-[0.7em] text-(--device-key-ink) [background:var(--device-key-face)] shadow-(--device-key-shadow) transition-[transform,box-shadow] duration-(--duration-exit) ease-out group-active/key:translate-y-[2px] group-active/key:shadow-(--device-key-shadow-pressed) group-active/key:duration-75">
                  <span
                    aria-hidden
                    data-part="light"
                    className={cx(
                      "absolute inset-x-[30%] top-[0.45em] h-[0.24em] rounded-full transition-[background-color]",
                      on ? "bg-(--device-meter-on) duration-0 drawn:bg-(--device-draw-ink)!" : "bg-(--device-meter-off) duration-(--duration-exit)",
                    )}
                  />
                  <span data-part="lettering" className="mt-[0.5em] text-[0.8em] font-medium uppercase leading-none tracking-[0.03em] [text-shadow:var(--device-engrave)]">
                    {item.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {mode === "attract" ? "Attracting" : "Repelling"}
      </p>
    </div>
  );
}
