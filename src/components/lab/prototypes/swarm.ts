import { INK, needle, paper, project, seeded, wobble, type Prototype } from "./ink";

/*
 * Swarm: needles lying loose on the paper. Near the pointer they twitch, then
 * stand and stream to it, packing into a bristling ball of spines round a
 * black core that churns and follows the pointer, trailing stragglers. Leave
 * and they fall where they are; click and the ball slams down, bursting out
 * across the page. Dropped needles stack, so gathering and dropping builds
 * dark heaps: you draw with the swarm.
 *
 * Every needle is a small spring toward a slot on a churning shell, or a
 * falling body, or a stroke lying flat on a heap. O(n) a frame, no neighbours.
 */

const COUNT = 1500;
const MAX_SWARM = 900;
const CELL = 0.12; // heap grid, world units
const GRID = 84; // cells a side, covering ±5

const FLAT = 0, SWARM = 1, FALL = 2;

export const swarm: Prototype = () => {
  const random = seeded(4);
  // Per needle: position, velocity, flat angle, length, mode, its slot on the shell, a random of its own.
  const px = new Float32Array(COUNT), py = new Float32Array(COUNT), pz = new Float32Array(COUNT);
  const vx = new Float32Array(COUNT), vy = new Float32Array(COUNT), vz = new Float32Array(COUNT);
  const ang = new Float32Array(COUNT), len = new Float32Array(COUNT), mode = new Uint8Array(COUNT);
  const dx = new Float32Array(COUNT), dy = new Float32Array(COUNT), dz = new Float32Array(COUNT);
  const shell = new Float32Array(COUNT), seed = new Float32Array(COUNT);
  // Orientation while airborne (radial in the ball, tumbling to flat as it falls).
  const ox = new Float32Array(COUNT), oy = new Float32Array(COUNT), oz = new Float32Array(COUNT);
  const heap = new Uint16Array(GRID * GRID);
  const cellOf = (x: number, z: number) => {
    const i = Math.min(GRID - 1, Math.max(0, Math.floor(x / CELL + GRID / 2)));
    const j = Math.min(GRID - 1, Math.max(0, Math.floor(z / CELL + GRID / 2)));
    return j * GRID + i;
  };
  const heapY = (x: number, z: number) => Math.min(0.22, heap[cellOf(x, z)] * 0.011);

  // Most start in a few loose piles, the rest strewn between them.
  const piles = [[-1.6, -0.9], [1.5, -1.3], [0.4, 1.6], [-1.9, 1.4], [2.2, 1.1]];
  for (let i = 0; i < COUNT; i++) {
    if (random() < 0.6) {
      const [cx, cz] = piles[i % piles.length];
      const r = 0.55 * Math.sqrt(random()) * (0.6 + 0.4 * random()), a = random() * Math.PI * 2;
      px[i] = cx + r * Math.cos(a);
      pz[i] = cz + r * Math.sin(a);
    } else {
      const r = 3.1 * Math.sqrt(random()), a = random() * Math.PI * 2;
      px[i] = r * Math.cos(a);
      pz[i] = r * Math.sin(a);
    }
    ang[i] = random() * Math.PI;
    len[i] = 0.09 + 0.12 * random() ** 2 + (random() > 0.96 ? 0.18 : 0);
    // A slot on the unit sphere, biased upward so the ball sits on its spines.
    const u = random() * 2 - 0.7, t = random() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - u * u));
    dx[i] = s * Math.cos(t);
    dy[i] = Math.min(1, u);
    dz[i] = s * Math.sin(t);
    shell[i] = 0.55 + 0.45 * random();
    seed[i] = random();
    heap[cellOf(px[i], pz[i])]++;
  }

  // The swarm's centre, on a spring behind the pointer.
  const C = { x: 0, y: 0.8, z: 0, vx: 0, vy: 0, vz: 0 };
  let count = 0;
  let wasPressed = false;
  let hadPointer = false;

  function drop(i: number, burst: number) {
    mode[i] = FALL;
    const rx = px[i] - C.x, ry = py[i] - C.y, rz = pz[i] - C.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    vx[i] += (rx / r) * burst;
    vz[i] += (rz / r) * burst;
    vy[i] += (ry / r) * burst * 0.6 + burst * 0.5;
    count--;
  }

  // Standing needles collected each frame and drawn back to front.
  const order: number[] = [];
  const depth = new Float32Array(COUNT);
  const tips = new Float32Array(COUNT * 3); // world-space tip per standing needle
  const roots = new Float32Array(COUNT * 3);

  return {
    frame({ ctx, view, pointer, time, dt, boil }) {
      // --- The pointer: present and not slamming means it gathers. ---
      const present = pointer.present;
      const slam = pointer.pressed && !wasPressed;
      wasPressed = pointer.pressed;
      const R = (0.22 + 0.02 * Math.sqrt(count)) * (1 + 0.06 * Math.sin(time * 3.1));
      if (present) {
        if (!hadPointer) {
          C.x = pointer.x;
          C.z = pointer.z;
          C.vx = C.vz = 0;
        }
        const k = 26, c = 2 * Math.sqrt(k) * 0.75;
        const ty = 0.3 + R * 0.75;
        C.vx += (k * (pointer.x - C.x) - c * C.vx) * dt;
        C.vz += (k * (pointer.z - C.z) - c * C.vz) * dt;
        C.vy += (k * (ty - C.y) - c * C.vy) * dt;
        C.x += C.vx * dt;
        C.y += C.vy * dt;
        C.z += C.vz * dt;
      }
      // Leaving lets them fall softly; a click slams them down and out.
      if ((!present && hadPointer) || slam) {
        for (let i = 0; i < COUNT; i++) if (mode[i] === SWARM) drop(i, slam ? 2.6 + seed[i] * 1.6 : 0.3);
      }
      hadPointer = present;
      const gathering = present && !pointer.pressed && pointer.since.release > 0.35;
      const reach = 0.9 + R * 1.4;
      const grab = 1 - Math.exp(-dt * 5);
      const churn = time * 0.7;
      const cs = Math.cos(churn), sn = Math.sin(churn);

      order.length = 0;
      for (let i = 0; i < COUNT; i++) {
        const m = mode[i];
        if (m === FLAT) {
          const fx = px[i] - C.x, fz = pz[i] - C.z;
          const d = Math.hypot(fx, fz);
          if (gathering && count < MAX_SWARM && d < reach && random() < grab) {
            // It stands and goes to the swarm.
            heap[cellOf(px[i], pz[i])] = Math.max(0, heap[cellOf(px[i], pz[i])] - 1);
            mode[i] = SWARM;
            count++;
            vy[i] = 1.5 + seed[i];
            continue;
          }
          // Near the swarm, flat needles twitch: their tips lift toward it.
          const lift = present ? Math.max(0, 1 - d / (reach + 0.9)) ** 2 * (0.7 + 0.6 * wobble(i, 7, boil)) : 0;
          if (lift > 0.06) {
            const hx = Math.cos(ang[i]) * len[i] * 0.5, hz = Math.sin(ang[i]) * len[i] * 0.5;
            // The end nearer the swarm lifts.
            const flip = hx * fx + hz * fz > 0 ? -1 : 1;
            roots[i * 3] = px[i] - hx * flip;
            roots[i * 3 + 1] = py[i];
            roots[i * 3 + 2] = pz[i] - hz * flip;
            tips[i * 3] = px[i] + hx * flip * (1 - lift * 0.4);
            tips[i * 3 + 1] = py[i] + lift * len[i] * 0.9;
            tips[i * 3 + 2] = pz[i] + hz * flip * (1 - lift * 0.4);
            depth[i] = px[i] + pz[i] + py[i];
            order.push(i);
          }
          continue;
        }

        if (m === SWARM) {
          // A spring toward its slot on the churning shell; far away it streams, close in it settles.
          const sx0 = dx[i] * cs - dz[i] * sn, sz0 = dx[i] * sn + dz[i] * cs;
          const sway = 0.08 * Math.sin(time * 2 + seed[i] * 30);
          const r = R * (shell[i] + sway);
          const tx = C.x + sx0 * r, ty = C.y + dy[i] * r, tz = C.z + sz0 * r;
          const k = 34, c = 7;
          vx[i] += (k * (tx - px[i]) - c * vx[i]) * dt;
          vy[i] += (k * (ty - py[i]) - c * vy[i]) * dt;
          vz[i] += (k * (tz - pz[i]) - c * vz[i]) * dt;
          // Don't let a straggler overtake the swarm: cap its speed.
          const sp = Math.hypot(vx[i], vy[i], vz[i]);
          if (sp > 9) {
            vx[i] *= 9 / sp;
            vy[i] *= 9 / sp;
            vz[i] *= 9 / sp;
          }
          px[i] += vx[i] * dt;
          py[i] += vy[i] * dt;
          pz[i] += vz[i] * dt;
          // Radial from the centre: a spine.
          let rx = px[i] - C.x, ry = py[i] - C.y, rz = pz[i] - C.z;
          const rl = Math.hypot(rx, ry, rz) || 1;
          rx /= rl;
          ry /= rl;
          rz /= rl;
          ox[i] = rx;
          oy[i] = ry;
          oz[i] = rz;
          const spine = len[i] * (1.7 + 0.3 * wobble(i, 3, boil));
          roots[i * 3] = px[i] - rx * len[i] * 0.3;
          roots[i * 3 + 1] = py[i] - ry * len[i] * 0.3;
          roots[i * 3 + 2] = pz[i] - rz * len[i] * 0.3;
          tips[i * 3] = px[i] + rx * spine;
          tips[i * 3 + 1] = py[i] + ry * spine;
          tips[i * 3 + 2] = pz[i] + rz * spine;
          depth[i] = px[i] + py[i] + pz[i];
          order.push(i);
          continue;
        }

        // FALL: gravity, a little drag, tumbling toward flat; it lands on the heap.
        vy[i] -= 9.8 * dt;
        vx[i] *= 1 - dt * 0.8;
        vz[i] *= 1 - dt * 0.8;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const floor = heapY(px[i], pz[i]);
        if (py[i] <= floor) {
          py[i] = floor;
          mode[i] = FLAT;
          ang[i] = Math.atan2(oz[i], ox[i]) + (seed[i] - 0.5) * 0.6;
          vx[i] = vy[i] = vz[i] = 0;
          heap[cellOf(px[i], pz[i])]++;
          continue;
        }
        const flatten = Math.min(1, Math.max(0, 1 - py[i] / 0.9));
        let ex = ox[i], ey = oy[i] * (1 - flatten), ez = oz[i];
        const el = Math.hypot(ex, ey, ez) || 1;
        ex /= el;
        ey /= el;
        ez /= el;
        roots[i * 3] = px[i] - ex * len[i] * 0.5;
        roots[i * 3 + 1] = py[i] - ey * len[i] * 0.5;
        roots[i * 3 + 2] = pz[i] - ez * len[i] * 0.5;
        tips[i * 3] = px[i] + ex * len[i] * 0.5;
        tips[i * 3 + 1] = py[i] + ey * len[i] * 0.5;
        tips[i * 3 + 2] = pz[i] + ez * len[i] * 0.5;
        depth[i] = px[i] + py[i] + pz[i];
        order.push(i);
      }

      // --- Draw: paper, the flat needles in one stroke, the shadow, then everything standing, back to front. ---
      paper(ctx, view);

      // Where needles lie thick, the heap reads as an ink blot under them.
      ctx.fillStyle = INK;
      ctx.beginPath();
      for (let c = 0; c < GRID * GRID; c++) {
        const n = heap[c];
        if (n < 4) continue;
        const cx = ((c % GRID) - GRID / 2 + 0.5) * CELL, cz = (Math.floor(c / GRID) - GRID / 2 + 0.5) * CELL;
        const h = Math.min(0.22, n * 0.011);
        // A round blot on the floor (an isometric circle: an ellipse half as tall as it is wide), a little ragged.
        const r = CELL * Math.min(1.1, 0.35 + n * 0.07) * (1 + 0.15 * wobble(c, 13, boil)) * view.scale * 1.22;
        const [ex, ey] = project(view, cx + wobble(c, 14, boil) * 0.03, h, cz + wobble(c, 15, boil) * 0.03);
        ctx.moveTo(ex + r, ey);
        ctx.ellipse(ex, ey, r, r * 0.58, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.strokeStyle = INK;
      ctx.lineCap = "round";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < COUNT; i++) {
        if (mode[i] !== FLAT) continue;
        const hx = Math.cos(ang[i]) * len[i] * 0.5, hz = Math.sin(ang[i]) * len[i] * 0.5;
        const j = 0.012;
        const [ax, ay] = project(view, px[i] - hx + wobble(i, 1, boil) * j, py[i], pz[i] - hz + wobble(i, 2, boil) * j);
        const [bx, by] = project(view, px[i] + hx + wobble(i, 3, boil) * j, py[i], pz[i] + hz + wobble(i, 4, boil) * j);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      // A hatched shadow on the paper under the ball, its lines boiling.
      if (count > 8) {
        const [cx, cy] = project(view, C.x, 0, C.z);
        const rw = R * 0.8 * view.scale * 1.22, rh = rw * 0.58;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let k = -rw * 2; k < rw * 2; k += 5) {
          const w = wobble(k | 0, 9, boil) * 1.5;
          ctx.moveTo(cx + k + w, cy - rh);
          ctx.lineTo(cx + k - rh * 1.2 + w, cy + rh);
        }
        ctx.stroke();
        ctx.restore();
      }

      order.sort((a, b) => depth[a] - depth[b]);
      // The black core: drawn where the swarm's centre falls in the depth order, so spines behind it hide.
      const coreDepth = C.x + C.y + C.z;
      let coreDrawn = count < 12;
      const core = () => {
        const [cx, cy] = project(view, C.x, C.y, C.z);
        const r = R * 0.85 * view.scale;
        ctx.fillStyle = INK;
        ctx.beginPath();
        // A lumpy, boiling blob rather than a circle.
        for (let a = 0; a <= 24; a++) {
          const t = (a / 24) * Math.PI * 2;
          const rr = r * (1 + 0.12 * wobble(a % 24, 11, boil) + 0.08 * Math.sin(t * 3 + time * 2));
          const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.92;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.fill();
        coreDrawn = true;
      };
      for (const i of order) {
        if (!coreDrawn && depth[i] > coreDepth) core();
        const root = project(view, roots[i * 3], roots[i * 3 + 1], roots[i * 3 + 2]);
        const tip = project(view, tips[i * 3] + wobble(i, 5, boil) * 0.02, tips[i * 3 + 1], tips[i * 3 + 2] + wobble(i, 6, boil) * 0.02);
        // Spines behind the core go without their white gap, so the ball stays black, not grey.
        const behind = mode[i] === SWARM && !coreDrawn;
        needle(ctx, root, tip, mode[i] === SWARM ? 2.3 : 1.5, !behind);
      }
      if (!coreDrawn) core();
    },
  };
};
