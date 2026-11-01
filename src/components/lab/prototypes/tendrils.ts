import { hash, INK, needle, PAPER, paper, project, wobble, type Prototype, type View } from "./ink";

/*
 * Tendrils: a black core on the paper that shoots ink tendrils at the
 * pointer. Each tendril is a verlet rope of 18 points on the floor that
 * lengthens toward the pointer when it is near and coils back when it
 * leaves; the one aimed best reaches hardest, the rest fan after it. A
 * click latches the reaching tendril where the pointer is. The anchor
 * stays, and over two seconds the rope thickens into goo, beads along its
 * length and sprouts spines, while a fresh tendril grows out to replace
 * it. The core swells with every anchor, breathes, and bristles when the
 * pointer comes close.
 */

const N = 18; // points a rope
const REACH = 3.4; // world units a free tendril can stretch
const FREE = 4; // free tendrils at any time
const GROW = 2; // seconds an anchored tendril takes to thicken into goo
const BRISTLES = 64;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

type Tendril = {
  id: number;
  angle: number; // where it leaves the core
  x: Float32Array; // verlet positions on the floor, and the last step's
  z: Float32Array;
  px: Float32Array;
  pz: Float32Array;
  length: number; // the rope's current length, eased toward what it wants
  anchor: { x: number; z: number } | null;
  born: number; // when it was anchored
};

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fills a rope of screen points as a ribbon, its half-width per point. */
function ribbon(ctx: CanvasRenderingContext2D, pts: [number, number][], half: number[]) {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    left.push([pts[i][0] + nx * half[i], pts[i][1] + ny * half[i]]);
    right.push([pts[i][0] - nx * half[i], pts[i][1] - ny * half[i]]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** A lobed blob lying on the floor (or at a height), filled. */
function blob(ctx: CanvasRenderingContext2D, v: View, cx: number, y: number, cz: number, r: number, seed: number, time: number, boil: number) {
  ctx.beginPath();
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const rr = r * (1 + 0.09 * Math.sin(3 * a + time * 0.8 + seed) + 0.05 * Math.sin(5 * a - time * 1.1 + seed * 2) + wobble(seed, k, boil) * 0.05);
    const [sx, sy] = project(v, cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
    if (k) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
}

export const tendrils: Prototype = () => {
  const ropes: Tendril[] = [];
  let ids = 0;
  let wasPressed = false;
  let near = 0; // how close the pointer is to the core, eased
  const core = { r: 0.62 };

  function spawn(angle: number) {
    const t: Tendril = { id: ids++, angle, x: new Float32Array(N), z: new Float32Array(N), px: new Float32Array(N), pz: new Float32Array(N), length: 0.05, anchor: null, born: 0 };
    for (let i = 0; i < N; i++) {
      t.x[i] = t.px[i] = Math.cos(angle) * core.r * 0.85;
      t.z[i] = t.pz[i] = Math.sin(angle) * core.r * 0.85;
    }
    ropes.push(t);
    return t;
  }
  for (let i = 0; i < FREE; i++) spawn((i / FREE) * Math.PI * 2 + 0.4);

  return {
    frame({ ctx, view, pointer, time, dt, boil }) {
      const anchored = ropes.filter((t) => t.anchor).length;
      const breath = 1 + 0.045 * Math.sin(time * 1.6);
      core.r = (0.62 + 0.06 * Math.min(anchored, 10)) * breath;
      const height = core.r * 0.8;
      const pd = Math.hypot(pointer.x, pointer.z);
      const pa = Math.atan2(pointer.z, pointer.x);
      near += ((pointer.present ? Math.exp(-((pd - core.r) ** 2) / 3) : 0) - near) * (1 - Math.exp(-dt * 4));

      // A click latches the tendril aimed best at the pointer, where the pointer is; a new one grows to replace it.
      if (pointer.pressed && !wasPressed && pointer.present && pd > core.r && pd < REACH + core.r) {
        let best: Tendril | null = null, score = -Infinity;
        for (const t of ropes) {
          if (t.anchor) continue;
          const s = Math.cos(t.angle - pa) + t.length * 0.2;
          if (s > score) {
            score = s;
            best = t;
          }
        }
        if (best) {
          best.anchor = { x: pointer.x, z: pointer.z };
          best.angle = pa;
          best.born = time;
          spawn(pa + (hash(ids, 7) - 0.5) * 1.2);
        }
      }
      wasPressed = pointer.pressed;

      // The ropes: verlet on the floor, the root pinned to the core, an anchored tip pinned to its anchor.
      for (const t of ropes) {
        const rx = Math.cos(t.angle) * core.r * 0.85, rz = Math.sin(t.angle) * core.r * 0.85;
        let want: number;
        let tx = rx;
        let tz = rz;
        let pull = 0;
        if (t.anchor) {
          want = Math.hypot(t.anchor.x - rx, t.anchor.z - rz) * 1.06;
        } else {
          const aim = pointer.present ? Math.max(0, Math.cos(t.angle - pa)) ** 3 : 0;
          const curl = t.angle + 0.7 * Math.sin(time * 0.7 + t.id * 1.7);
          const idle = 0.7 + 0.35 * Math.sin(time * 1.3 + t.id);
          want = idle + (Math.min(Math.hypot(pointer.x - rx, pointer.z - rz), REACH) - idle) * aim;
          tx = rx + Math.cos(curl) * want * (1 - aim) + (pointer.x - rx) * aim;
          tz = rz + Math.sin(curl) * want * (1 - aim) + (pointer.z - rz) * aim;
          pull = 6 + 10 * aim;
          // Drift its root toward the pointer a little, so the core turns to face it.
          if (pointer.present) t.angle += Math.sin(pa - t.angle) * dt * 0.4 * aim;
        }
        t.length += (want - t.length) * (1 - Math.exp(-dt * (t.anchor ? 3 : 5)));
        const seg = t.length / (N - 1);
        for (let i = 1; i < N; i++) {
          const vx = (t.x[i] - t.px[i]) * 0.86, vz = (t.z[i] - t.pz[i]) * 0.86;
          t.px[i] = t.x[i];
          t.pz[i] = t.z[i];
          // A wriggle travels down it.
          const w = Math.sin(time * 4 - i * 0.6 + t.id) * 0.012 * (t.anchor ? 0.3 : 1);
          t.x[i] += vx - Math.sin(t.angle) * w;
          t.z[i] += vz + Math.cos(t.angle) * w;
        }
        const k = Math.min(1, pull * dt);
        t.x[N - 1] += (tx - t.x[N - 1]) * k;
        t.z[N - 1] += (tz - t.z[N - 1]) * k;
        for (let it = 0; it < 6; it++) {
          t.x[0] = rx;
          t.z[0] = rz;
          if (t.anchor) {
            t.x[N - 1] = t.anchor.x;
            t.z[N - 1] = t.anchor.z;
          }
          for (let i = 0; i < N - 1; i++) {
            const dx = t.x[i + 1] - t.x[i], dz = t.z[i + 1] - t.z[i];
            const d = Math.hypot(dx, dz) || 1e-6;
            const c = (d - seg) / d;
            // A pinned end doesn't move; the other takes the whole correction.
            const ma = i === 0 ? 0 : 1;
            const mb = t.anchor && i + 1 === N - 1 ? 0 : 1;
            if (!ma && !mb) continue;
            const wa = ma / (ma + mb), wb = mb / (ma + mb);
            t.x[i] += dx * c * wa;
            t.z[i] += dz * c * wa;
            t.x[i + 1] -= dx * c * wb;
            t.z[i + 1] -= dz * c * wb;
          }
        }
      }

      paper(ctx, view);
      const jit = (id: number, i: number) => wobble(id * 97 + i, 3, boil) * 1.3;

      // A hatched shadow on the paper, cast down and to the right.
      {
        const [sx, sy] = project(view, 0.25, 0, -0.1);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(sx + core.r * view.scale * 0.35, sy + core.r * view.scale * 0.15, core.r * view.scale * 1.15, core.r * view.scale * 0.6, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        const span = core.r * view.scale * 3;
        for (let x = -span; x < span; x += 4) {
          ctx.beginPath();
          ctx.moveTo(sx + x + wobble(x, 9, boil) * 1.5, sy - span * 0.5);
          ctx.lineTo(sx + x + span * 0.5 + wobble(x, 10, boil) * 1.5, sy + span * 0.5);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Anchored tendrils: goo on the floor, thickening from the core out, beaded, with a splat at the anchor and spines along it.
      ctx.fillStyle = INK;
      for (const t of ropes) {
        if (!t.anchor) continue;
        const g = smooth(0, GROW, time - t.born);
        const pts: [number, number][] = [];
        const half: number[] = [];
        for (let i = 0; i < N; i++) {
          const s = i / (N - 1);
          const [sx, sy] = project(view, t.x[i], 0.02, t.z[i]);
          pts.push([sx + jit(t.id, i), sy + jit(t.id, i + 50)]);
          const pulse = 1 + 0.18 * Math.sin(s * 12 - time * 5 + t.id);
          half.push((0.8 + g * (5.5 * (1 - s) ** 0.8 + 1.4) * pulse) * (view.scale / 90));
        }
        ribbon(ctx, pts, half);
        blob(ctx, view, t.anchor.x, 0.01, t.anchor.z, 0.07 + 0.13 * g, t.id, time, boil);
        for (const s of [0.35, 0.6, 0.82]) {
          const i = Math.round(s * (N - 1));
          blob(ctx, view, t.x[i], 0.02, t.z[i], 0.05 + 0.06 * g * (1 - s * 0.5), t.id + s * 10, time, boil);
        }
      }
      for (const t of ropes) {
        if (!t.anchor) continue;
        const g = smooth(0.3, GROW + 0.6, time - t.born);
        if (g <= 0) continue;
        for (let i = 2; i < N - 1; i += 1) {
          const sideways = i % 2 ? 1 : -1;
          const dx = t.x[i + 1] - t.x[i - 1], dz = t.z[i + 1] - t.z[i - 1];
          const l = Math.hypot(dx, dz) || 1;
          const len = (0.1 + 0.16 * hash(t.id, i)) * g * (1 + 0.3 * near);
          const root = project(view, t.x[i], 0.03, t.z[i]);
          const tip = project(view, t.x[i] - (dz / l) * sideways * len * 0.7 + wobble(t.id, i, boil) * 0.02, len, t.z[i] + (dx / l) * sideways * len * 0.7);
          needle(ctx, root, tip, 1.5 * (view.scale / 90) + 0.6);
        }
      }

      // Free tendrils: tapering ropes that lift off the paper as they reach.
      ctx.fillStyle = INK;
      for (const t of ropes) {
        if (t.anchor) continue;
        const pts: [number, number][] = [];
        const half: number[] = [];
        const lift = Math.min(1, t.length / REACH);
        for (let i = 0; i < N; i++) {
          const s = i / (N - 1);
          const y = Math.sin(s * Math.PI) * 0.35 * lift + 0.03;
          const [sx, sy] = project(view, t.x[i], y, t.z[i]);
          pts.push([sx + jit(t.id, i), sy + jit(t.id, i + 50)]);
          half.push((4.6 * (1 - s) ** 1.2 + 0.7) * (view.scale / 90));
        }
        ribbon(ctx, pts, half);
      }

      // The core's bristles: those on its far side first, so the dome covers their roots.
      const bristle = (front: boolean) => {
        for (let j = 0; j < BRISTLES; j++) {
          const a = j * GOLDEN + 0.3;
          const f = 0.15 + 0.8 * Math.sqrt(hash(j, 11));
          const ring = core.r * Math.sqrt(1 - f * f);
          const px = Math.cos(a) * ring, pz = Math.sin(a) * ring, py = height * f;
          let nx = px / (core.r * core.r), ny = py / (height * height), nz = pz / (core.r * core.r);
          const nl = Math.hypot(nx, ny, nz);
          nx /= nl;
          ny /= nl;
          nz /= nl;
          if (nx + ny + nz > 0.3 !== front) continue;
          const spike = hash(j, 13) > 0.92 ? 0.3 : 0;
          const len = (0.1 + 0.14 * hash(j, 12) + spike) * (1 + 0.8 * near) * (1 + 0.08 * Math.sin(time * 2.2 + j));
          const lean = pointer.present ? 0.25 * near : 0;
          const lx = pointer.present ? Math.cos(pa) * lean : 0, lz = pointer.present ? Math.sin(pa) * lean : 0;
          const root = project(view, px, py, pz);
          const tip = project(view, px + (nx + lx) * len + wobble(j, 1, boil) * 0.03, py + ny * len, pz + (nz + lz) * len + wobble(j, 2, boil) * 0.03);
          needle(ctx, root, tip, 1.6 * (view.scale / 90) + 0.5);
        }
      };
      bristle(false);

      // The core: a dome of stacked lobed rings, solid black.
      ctx.fillStyle = INK;
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        blob(ctx, view, 0, height * f, 0, core.r * Math.sqrt(1 - f * f * 0.98), 0.5, time, boil);
      }

      // Hard white glints, Venom-style: a crescent high on the left and a fleck beside it.
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      const arc = (rr: number, y: number, rev: boolean) => {
        for (let k = 0; k <= 10; k++) {
          const s = rev ? 1 - k / 10 : k / 10;
          const a = Math.PI * (1.02 + 0.32 * s) + wobble(k, rev ? 5 : 6, boil) * 0.04;
          const [sx, sy] = project(view, Math.cos(a) * rr, y, Math.sin(a) * rr);
          if (k || rev) ctx.lineTo(sx, sy);
          else ctx.moveTo(sx, sy);
        }
      };
      arc(core.r * 0.7, height * 0.72, false);
      arc(core.r * 0.5, height * 0.88, true);
      ctx.closePath();
      ctx.fill();
      {
        const [sx, sy] = project(view, -core.r * 0.15, height * 0.95, core.r * 0.25);
        ctx.beginPath();
        ctx.ellipse(sx, sy, 3 * (view.scale / 90) + 1, 1.6 * (view.scale / 90) + 0.6, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      bristle(true);
    },
  };
};
