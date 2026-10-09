"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createSpring, focusQuietly, springs, type Spring } from "@/design-system";
import { play } from "@/lib/sound";
import { partInfo } from "@/registry/anatomy";
import { stackOrder } from "./parts";

/*
 * A study taken apart. The study keeps running inside: the camera tilts it
 * isometric (the angles Agent Shapes uses) and the parts marked `data-part`
 * lift apart in floors, one for each kind: the plate at the bottom, then its
 * collars and LCDs, its keys and caps, and the lettering on top. It is real
 * CSS 3D, so the browser sorts the parts by their true depth: a cap lifted
 * above an LCD paints over it wherever the two cross, which no stacking
 * order in 2D can do.
 *
 * Overflow, isolation, filters and blends flatten 3D, and every plate is
 * `isolate overflow-hidden` with its grain blended soft-light, so globals.css
 * opens only the path from the scene down to each part; a part with nothing
 * lifted inside it (an LCD, a canvas) still clips, as one plane.
 *
 * A shadowless plane lifted straight up looks, in a parallel projection, much
 * like one lying further back. So the picked layer rises a little above the
 * rest, takes the hand's colour, and stands on dashed risers that run down to
 * the part each of its pieces sits on.
 *
 * Springs draw it, writing CSS variables: the camera's tilt and the spread
 * (springs.gentle), and the lift of the picked layer (springs.snappy). The
 * spread clicks every 5%, as a detent does. While it is apart the study is
 * inert: the hand works the anatomy, not the study, whose drags read
 * on-screen boxes that a tilted camera would get wrong.
 */

const PITCH = 54.74; // degrees the camera tilts back: true isometric, with YAW
const YAW = 45;
const GAP = 2.2; // em of the plate between floors, at full spread
const PICK = 0.4; // floors the picked layer rises above the others
const DETENTS = 20; // a click every 5% of spread
const STAGE_PAD = 48; // the stage's padding, both sides (p-6 in preview.tsx)

/** The camera's resting values; the springs take --tilt and --spread from here. */
const camera = { "--tilt": 0, "--spread": 0, "--pitch": `${PITCH}deg`, "--yaw": `${YAW}deg`, "--pick": PICK } as CSSProperties;

const rad = (deg: number) => (deg * Math.PI) / 180;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export type AnatomyProps = {
  slug: string;
  open: boolean;
  /** 0 to 1: how far apart the layers stand. */
  spread: number;
  /** The kind of part picked, as its `data-part` names it. */
  picked: string | null;
  /** The stage's CSS zoom, so the scene can fit it. */
  zoom?: number;
  /** The kinds of part found in the study, top to bottom. */
  onKinds: (kinds: string[]) => void;
  onPick: (kind: string) => void;
  onSpread: (spread: number) => void;
  onClose: () => void;
  label: string;
  children: ReactNode;
};

type Placed = Map<HTMLElement, { kind: string; floor: number; z: number; parent: HTMLElement | null }>;

/**
 * Stacks a scene's parts in floors, one for each kind of part, top to bottom
 * by how high the kind sits (a key's lettering sits on the key), then by the
 * order the materials stack in. Each part is told how many floors to climb
 * from the part it sits on (--z), so the transforms nest to the right height.
 */
function stack(scene: HTMLElement) {
  const els = [...scene.querySelectorAll<HTMLElement>("[data-part]")];
  const parentOf = (el: HTMLElement) => {
    const p = el.parentElement?.closest<HTMLElement>("[data-part]");
    return p && scene.contains(p) ? p : null;
  };
  const depthOf = (el: HTMLElement) => {
    let d = 0;
    for (let p = parentOf(el); p; p = parentOf(p)) d++;
    return d;
  };
  const height = new Map<string, number>();
  for (const el of els) height.set(el.dataset.part!, Math.max(height.get(el.dataset.part!) ?? 0, depthOf(el)));
  const rank = (k: string) => (stackOrder.includes(k) ? stackOrder.indexOf(k) : stackOrder.length);
  const kinds = [...height.keys()].sort((a, b) => height.get(b)! - height.get(a)! || rank(a) - rank(b));
  const floorOf = (el: HTMLElement | null) => (el ? kinds.length - 1 - kinds.indexOf(el.dataset.part!) : 0);

  const placed: Placed = new Map();
  for (const el of els) {
    const parent = parentOf(el);
    const z = Math.max(0, floorOf(el) - floorOf(parent));
    el.style.setProperty("--z", String(z));
    placed.set(el, { kind: el.dataset.part!, floor: floorOf(el), z, parent });
  }
  return { kinds, floors: Math.max(0, kinds.length - 1), placed };
}

/** Where a part's centre lies on the plan, in the scene's own pixels: layout, untouched by the camera. */
function planCentre(part: Element, scene: HTMLElement) {
  // An SVG has no offsets; the parts drawn in SVG fill the box they sit in.
  const el = part instanceof HTMLElement ? part : part.parentElement!;
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let e: HTMLElement | null = el; e && e !== scene; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft;
    y += e.offsetTop;
  }
  return { x, y };
}

export function Anatomy({ slug, open, spread, picked, zoom = 1, onKinds, onPick, onSpread, onClose, label, children }: AnatomyProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const ids = useId();
  const engine = useRef<{ tilt: Spring; spread: Spring; lifts: WeakMap<Element, Spring>; placed: Placed; fit: () => void; guide: () => void } | null>(null);
  const openRef = useRef(open);
  const props = useRef({ onKinds, onPick, onSpread, picked, spread, zoom });
  useLayoutEffect(() => {
    props.current = { onKinds, onPick, onSpread, picked, spread, zoom };
    openRef.current = open;
  });

  // The camera, the spread and the risers, drawn straight to the scene.
  useLayoutEffect(() => {
    const scene = sceneRef.current!;
    let detent = 0;
    const tilt = createSpring(0, springs.gentle, (v) => {
      scene.style.setProperty("--tilt", v.toFixed(4));
      // Closed and level again: give the study back its clipping and its isolation.
      if (v === 0 && !openRef.current) delete scene.dataset.anatomy;
    });
    const spread = createSpring(0, springs.gentle, (v) => {
      scene.style.setProperty("--spread", v.toFixed(4));
      const d = Math.round(v * DETENTS);
      if (d !== detent) {
        detent = d;
        play("tick", { gain: 0.4, pitch: 0.9 + v * 0.25 });
      }
    });

    /** Scales the scene so it fits the stage at full spread, and keeps it centred as it rises. */
    const fit = () => {
      const stage = rootRef.current?.closest<HTMLElement>("[data-preview]");
      const demo = scene.firstElementChild as HTMLElement | null;
      if (!stage || !demo) return;
      const { floors, placed } = stack(scene);
      e.placed = placed;
      const plate = scene.querySelector<HTMLElement>('[data-part="plate"]') ?? demo;
      const gap = parseFloat(getComputedStyle(plate).fontSize) * GAP;
      const lift = (floors + PICK) * gap;
      const [w, h] = [demo.offsetWidth, demo.offsetHeight];
      const [p, y] = [rad(PITCH), rad(YAW)];
      const width = w * Math.cos(y) + h * Math.sin(y);
      const height = (w * Math.sin(y) + h * Math.cos(y)) * Math.cos(p) + lift * Math.sin(p);
      const { zoom } = props.current;
      const scale = Math.min(1, (stage.clientWidth / zoom - STAGE_PAD) / width, (stage.clientHeight / zoom - STAGE_PAD) / height);
      scene.style.setProperty("--gap", `${gap.toFixed(2)}px`);
      scene.style.setProperty("--fit", scale.toFixed(4));
      scene.style.setProperty("--rise", `${((floors * gap * Math.sin(p) * scale) / 2).toFixed(2)}px`);
      e.guide();
    };

    /** Dashed risers from each piece of the picked layer down to the part it sits on. */
    const guide = () => {
      const box = guidesRef.current!;
      const { picked } = props.current;
      const risers: HTMLElement[] = [];
      if (openRef.current && picked) {
        for (const [el, at] of e.placed) {
          if (at.kind !== picked || !el.isConnected) continue;
          const { x, y } = planCentre(el, scene);
          const base = at.parent ? (e.placed.get(at.parent)?.floor ?? 0) : 0;
          const riser = document.createElement("span");
          riser.className = "anatomy-riser";
          riser.style.cssText = `left:${x.toFixed(2)}px;top:${y.toFixed(2)}px;--base:${base};--climb:${at.z}`;
          risers.push(riser);
        }
      }
      box.replaceChildren(...risers);
    };

    const e = { tilt, spread, lifts: new WeakMap<Element, Spring>(), placed: new Map() as Placed, fit, guide };
    engine.current = e;
    return () => {
      tilt.stop();
      spread.stop();
    };
  }, []);

  // The demo loads in its own chunk, so its parts arrive after this mounts: watch until they do.
  useEffect(() => {
    const scene = sceneRef.current!;
    let raf = 0;
    const look = () => {
      raf = 0;
      const { kinds, placed } = stack(scene);
      if (!kinds.length) return;
      observer.disconnect();
      engine.current!.placed = placed;
      if (openRef.current) engine.current!.fit();
      setKinds(kinds);
      props.current.onKinds(kinds);
    };
    const observer = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(look);
    });
    observer.observe(scene, { childList: true, subtree: true });
    raf = requestAnimationFrame(look);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Open: tilt the camera in. Closed: bring the layers down and level the camera.
  useLayoutEffect(() => {
    const { tilt, fit } = engine.current!;
    const scene = sceneRef.current!;
    if (open) {
      scene.dataset.anatomy = "";
      fit();
    }
    if (reduced()) tilt.jump(open ? 1 : 0);
    else tilt.set(open ? 1 : 0);
  }, [open]);

  useLayoutEffect(() => {
    const s = engine.current!.spread;
    const to = open ? spread : 0;
    if (reduced()) s.jump(to);
    else s.set(to);
  }, [open, spread]);

  // The picked layer rises a little above the rest, takes the hand's colour and stands on its risers.
  useLayoutEffect(() => {
    const { lifts, guide } = engine.current!;
    const scene = sceneRef.current!;
    for (const el of scene.querySelectorAll<HTMLElement>("[data-part]")) {
      const on = open && el.dataset.part === picked;
      if (on) el.dataset.picked = "";
      else delete el.dataset.picked;
      let s = lifts.get(el);
      if (!s) {
        if (!on) continue;
        s = createSpring(0, springs.snappy, (v) => el.style.setProperty("--lift", v.toFixed(4)));
        lifts.set(el, s);
      }
      if (reduced()) s.jump(on ? 1 : 0);
      else s.set(on ? 1 : 0);
    }
    guide();
  }, [open, picked, kinds]);

  // While apart, the stage is the hand's: point at a layer to pick it, drag sideways to spread.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current!;
    const scene = sceneRef.current!;
    const stage = root.closest<HTMLElement>("[data-preview]")!;
    let raf = 0;
    let at = { x: 0, y: 0 };
    let drag: { id: number; x: number; from: number; moved: boolean } | null = null;

    // The study is inert, and inert parts can't be hit, so it is let back in for the one look.
    const kindAt = (x: number, y: number) => {
      scene.inert = false;
      const hit = document.elementFromPoint(x, y);
      scene.inert = true;
      const part = hit?.closest<HTMLElement>("[data-part]");
      return part && scene.contains(part) ? part.dataset.part! : null;
    };
    const pick = (x: number, y: number) => {
      const kind = kindAt(x, y);
      if (kind && kind !== props.current.picked) {
        play("tick", { gain: 0.55 });
        props.current.onPick(kind);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // or the press that follows takes focus to the page
      focusQuietly(root);
      stage.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, from: props.current.spread, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) {
        const dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 6) return;
        drag.moved = true;
        stage.dataset.dragging = "";
        // Half the stage's width takes the layers from closed to fully apart.
        props.current.onSpread(Math.min(1, Math.max(0, drag.from + dx / (stage.clientWidth * 0.5))));
        return;
      }
      if (e.pointerType !== "mouse") return;
      at = { x: e.clientX, y: e.clientY };
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          pick(at.x, at.y);
        });
    };
    const onUp = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      if (!drag.moved) pick(e.clientX, e.clientY); // a tap picks, for touch
      drag = null;
      delete stage.dataset.dragging;
    };

    const ro = new ResizeObserver(() => engine.current?.fit());
    ro.observe(stage);
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      delete stage.dataset.dragging;
    };
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = picked ? kinds.indexOf(picked) : -1;
    const to = (next: number) => {
      if (next < 0 || next >= kinds.length) return play("bump", { gain: 0.5 });
      play("tick", { gain: 0.55 });
      onPick(kinds[next]);
    };
    if (e.key === "ArrowDown") to(i + 1);
    else if (e.key === "ArrowUp") to(i < 0 ? 0 : i - 1);
    else if (e.key === "Home") to(0);
    else if (e.key === "End") to(kinds.length - 1);
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const next = Math.round((spread + (e.key === "ArrowRight" ? 0.05 : -0.05)) * 20) / 20;
      if (next < 0 || next > 1) play("bump", { gain: 0.5 });
      else onSpread(next);
    } else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
  }

  return (
    <div
      ref={rootRef}
      role={open ? "listbox" : undefined}
      tabIndex={open ? 0 : undefined}
      aria-label={open ? label : undefined}
      aria-activedescendant={open && picked ? `${ids}-${picked}` : undefined}
      onKeyDown={open ? onKeyDown : undefined}
      className="flex w-full justify-center rounded-lg outline-offset-4"
    >
      <div ref={sceneRef} inert={open} className="relative flex w-full justify-center" style={camera}>
        {children}
        <div ref={guidesRef} aria-hidden data-anatomy-guides className="pointer-events-none absolute inset-0" />
      </div>
      {open &&
        kinds.map((kind) => {
          const info = partInfo(slug, kind);
          return (
            <div key={kind} id={`${ids}-${kind}`} role="option" aria-selected={kind === picked} className="sr-only">
              {info.name}. {info.note}
            </div>
          );
        })}
    </div>
  );
}
