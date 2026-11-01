import { hash, INK, needle, PAPER, paper, project, seeded, wobble, type Prototype, type View } from "./ink";

/*
 * Pet: one blob that follows the pointer like a pet. It is a cluster of
 * metaballs on springs to a leader that trots after the pointer and stops a
 * little short of it. Flick past it and the bonds break: droplets fly off
 * and crawl home, merging back in. Click to feed it: it gulps, grows, and
 * bristles with more spikes; spikes stand up and lengthen when the pointer
 * is close and moving. Two white Venom eyes look where it is going.
 *
 * It reads as 3D by stacking contours of the summed field at rising
 * thresholds and heights (a dome, in isometric), all filled black as one
 * path, so their union is the silhouette; the field's grid values wobble
 * with the 8 fps boil, so the edge boils.
 */

type Drop = { x: number; z: number; vx: number; vz: number; r: number; a: number; d: number; free: number; phase: number };

const CELL = 0.06; // world units a grid cell, at its finest
const LAYERS = 6; // contours stacked into the dome
const STEP = 0.075; // world units of height between them
const MAX_DROPS = 18;

export const pet: Prototype = () => {
  const random = seeded(11);
  const lead = { x: 0, z: 0, vx: 0, vz: 0 };
  const drops: Drop[] = [];
  const add = (x: number, z: number, r: number, d: number) =>
    drops.push({ x, z, vx: 0, vz: 0, r, a: random() * Math.PI * 2, d, free: 0, phase: random() * Math.PI * 2 });
  add(0, 0, 0.36, 0); // the core
  for (let i = 0; i < 6; i++) add(0, 0, 0.17 + random() * 0.08, 0.16 + random() * 0.24);

  let fed = 0;
  let wasPressed = false;
  let gulp = 0; // swells for a moment after a meal
  let agitation = 0;
  let cooldown = 0; // between splits
  const face = { x: 0.7, z: 0.7 };
  let blinkAt = 2.5;

  /**
   * The summed field of every droplet at a floor point. Each is a bounded bump, (1 − d²/R²)², peaking
   * higher for a bigger droplet, so a small one makes a low dome rather than a tower of every layer.
   */
  function field(x: number, z: number, scale: number) {
    let f = 0;
    for (const d of drops) {
      const dx = x - d.x, dz = z - d.z;
      const reach = d.r * scale * 1.6;
      const q = 1 - (dx * dx + dz * dz) / (reach * reach);
      if (q > 0) f += 3.8 * Math.pow(d.r / 0.36, 0.8) * q * q;
    }
    return f;
  }

  /** Adds the contour of the field at a threshold, at a height, as subpaths of the current path. */
  function contour(ctx: CanvasRenderingContext2D, view: View, grid: Float32Array, cell: number, gi0: number, gj0: number, nx: number, nz: number, t: number, y: number, sx: number, sz: number) {
    const at = (i: number, j: number) => grid[j * (nx + 1) + i];
    const pts: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        if (v[0] < t && v[1] < t && v[2] < t && v[3] < t) continue;
        const cx = [i, i + 1, i + 1, i], cz = [j, j, j + 1, j + 1];
        pts.length = 0;
        for (let e = 0; e < 4; e++) {
          const f = (e + 1) % 4;
          if (v[e] >= t) pts.push(cx[e], cz[e]);
          if (v[e] >= t !== v[f] >= t) {
            const k = (t - v[e]) / (v[f] - v[e]);
            pts.push(cx[e] + (cx[f] - cx[e]) * k, cz[e] + (cz[f] - cz[e]) * k);
          }
        }
        for (let p = 0; p < pts.length; p += 2) {
          const [px, py] = project(view, (gi0 + pts[p]) * cell + sx, y, (gj0 + pts[p + 1]) * cell + sz);
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    }
  }

  return {
    frame({ ctx, view, pointer, time, dt, boil }) {
      paper(ctx, view);
      const size = 1 + Math.min(fed, 10) * 0.085;
      const speed = Math.hypot(pointer.vx, pointer.vz);
      const toPointer = Math.hypot(pointer.x - lead.x, pointer.z - lead.z);

      // A meal: on each press it gulps, grows, and a new droplet flies in from the pointer.
      if (pointer.pressed && !wasPressed && pointer.present) {
        fed++;
        gulp = 1;
        if (drops.length < MAX_DROPS) {
          add(pointer.x, pointer.z, 0.15 + random() * 0.08, 0.2 + random() * 0.35);
          drops[drops.length - 1].free = 0.5;
        }
      }
      wasPressed = pointer.pressed;
      gulp = Math.max(0, gulp - dt * 1.8);
      cooldown -= dt;

      // The leader trots after the pointer and stops just short of it; alone, it wanders.
      let tx = 1.3 * Math.sin(time * 0.4), tz = 0.8 * Math.sin(time * 0.55);
      if (pointer.present) {
        const ux = (lead.x - pointer.x) / (toPointer || 1), uz = (lead.z - pointer.z) / (toPointer || 1);
        tx = pointer.x + ux * 0.6 * size;
        tz = pointer.z + uz * 0.6 * size;
      }
      lead.vx += (5 * (tx - lead.x) - 3 * lead.vx) * dt;
      lead.vz += (5 * (tz - lead.z) - 3 * lead.vz) * dt;
      lead.x += lead.vx * dt;
      lead.z += lead.vz * dt;
      const pace = Math.min(1, Math.hypot(lead.vx, lead.vz) / 2);

      // Flicked past at speed, it splits: droplets fly off along the flick.
      if (pointer.present && speed > 5 && toPointer < 1.4 * size && cooldown <= 0) {
        cooldown = 1.6;
        for (let i = 1; i < drops.length; i++) {
          if (random() > 0.75) continue;
          const d = drops[i];
          const a = random() * Math.PI * 2;
          d.free = 1.2 + random() * 1.3;
          const fling = Math.min(1, 4 / speed) * 0.6; // a hard flick throws them no further than a firm one
          d.vx = pointer.vx * fling + Math.cos(a) * 1.4;
          d.vz = pointer.vz * fling + Math.sin(a) * 1.4;
        }
      }

      // Droplets: snug on stiff springs, or crawling home on weak ones after a split.
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const a = d.a + time * 0.25;
        const reach = d.d * size * (1 + 0.08 * Math.sin(time * 1.7 + d.phase));
        const hx = lead.x + Math.cos(a) * reach, hz = lead.z + Math.sin(a) * reach;
        const free = d.free > 0;
        const k = free ? 1.6 : 40, c = free ? 1.4 : 11;
        d.free -= dt;
        let fx = k * (hx - d.x) - c * d.vx, fz = k * (hz - d.z) - c * d.vz;
        if (free) {
          // A crawl: it inches forward in pulses, wriggling side to side.
          const pulse = 0.6 + 0.4 * Math.sin(time * 9 + d.phase);
          fx *= pulse;
          fz *= pulse;
          fx += Math.sin(time * 7 + d.phase) * 0.8 * -(hz - d.z);
          fz += Math.sin(time * 7 + d.phase) * 0.8 * (hx - d.x);
        }
        d.vx += fx * dt;
        d.vz += fz * dt;
        d.x += d.vx * dt;
        d.z += d.vz * dt;
      }

      // How worked up it is: a close, moving pointer, or a meal.
      const near = pointer.present ? Math.exp(-(toPointer * toPointer) / 2) : 0;
      agitation += (Math.min(1, near * (0.45 + speed / 3)) + gulp * 0.6 - agitation) * Math.min(1, dt * 6);

      // It looks where it is going, or at the pointer.
      const look = pointer.present ? { x: pointer.x - lead.x, z: pointer.z - lead.z } : { x: lead.vx, z: lead.vz };
      const lookLen = Math.hypot(look.x, look.z);
      if (lookLen > 0.05) {
        face.x += (look.x / lookLen - face.x) * Math.min(1, dt * 5);
        face.z += (look.z / lookLen - face.z) * Math.min(1, dt * 5);
        const n = Math.hypot(face.x, face.z) || 1;
        face.x /= n;
        face.z /= n;
      }

      // The field on a grid snapped to the world, so each point's boil wobble stays put as it moves.
      const scale = size * (1 + gulp * 0.12);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const d of drops) {
        minX = Math.min(minX, d.x);
        maxX = Math.max(maxX, d.x);
        minZ = Math.min(minZ, d.z);
        maxZ = Math.max(maxZ, d.z);
      }
      const pad = 0.9 * scale;
      // Coarser when the droplets are spread far apart, so the grid never grows past 130 cells a side.
      const cell = Math.max(CELL, (Math.max(maxX - minX, maxZ - minZ) + 2 * pad) / 130);
      const gi0 = Math.floor((minX - pad) / cell), gj0 = Math.floor((minZ - pad) / cell);
      const nx = Math.ceil((maxX + pad) / cell) - gi0, nz = Math.ceil((maxZ + pad) / cell) - gj0;
      const grid = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
          const wob = 1 + wobble((gi0 + i) * 7 + 3, gj0 + j, boil) * 0.14;
          grid[j * (nx + 1) + i] = field((gi0 + i) * cell, (gj0 + j) * cell, scale) * wob;
        }
      }

      // A hatched shadow, cast down and to the right.
      ctx.save();
      ctx.beginPath();
      contour(ctx, view, grid, cell, gi0, gj0, nx, nz, 1, 0, 0.32, -0.12);
      ctx.clip();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -view.height; x < view.width; x += 5) {
        ctx.moveTo(x + wobble(x, 1, boil) * 2, view.height);
        ctx.lineTo(x + view.height * 0.58 + wobble(x, 2, boil) * 2, 0);
      }
      ctx.stroke();
      ctx.restore();

      // The spikes: round the rim and over the top, standing up and out; longer when it is worked up.
      const count = Math.min(70, 26 + fed * 4);
      type Spike = { root: [number, number]; tip: [number, number]; w: number; far: boolean };
      const spikes: Spike[] = [];
      for (let i = 0; i < count; i++) {
        const top = i % 3 === 2; // a third stand on the dome itself
        const a = (i / count) * Math.PI * 2 + hash(i, 5) * 0.4 + time * 0.05;
        const dx = Math.cos(a), dz = Math.sin(a);
        // March out from the leader to the dome's edge (or partway up it).
        const edge = top ? 2.4 : 1.25;
        let r = 0.02;
        while (r < 3.5 * scale && field(lead.x + dx * r, lead.z + dz * r, scale) > edge) r += 0.04;
        if (r < 0.06) continue;
        const rx = lead.x + dx * (r - 0.03), rz = lead.z + dz * (r - 0.03);
        const ry = top ? STEP * 3.2 * size : STEP * 1.2 * size;
        const len = (0.16 + 0.22 * hash(i, 9) + (hash(i, 4) > 0.9 ? 0.25 : 0)) * size * (1 + agitation * 0.9) * (top ? 0.8 : 1);
        const out = top ? 0.45 : 1;
        const lean = agitation * 0.35;
        const ux = dx * out + face.x * lean + wobble(i, 1, boil) * 0.15;
        const uz = dz * out + face.z * lean + wobble(i, 2, boil) * 0.15;
        const uy = top ? 1.1 : 0.75 + agitation * 0.3;
        const n = Math.hypot(ux, uy, uz);
        spikes.push({
          root: project(view, rx, ry, rz),
          tip: project(view, rx + (ux / n) * len, ry + (uy / n) * len, rz + (uz / n) * len),
          w: (1.8 + hash(i, 6) * 1.4) * (view.scale / 100),
          far: dx + dz < 0 && !top,
        });
      }
      for (const s of spikes) if (s.far) needle(ctx, s.root, s.tip, s.w);

      // The body: every layer of the dome in one black path, leaning toward where it looks.
      const bob = 1 + 0.07 * Math.sin(time * 12) * pace;
      ctx.beginPath();
      for (let k = 0; k < LAYERS; k++) {
        const lean = k * 0.03 * (0.4 + agitation);
        contour(ctx, view, grid, cell, gi0, gj0, nx, nz, 1 + k * 0.55, k * STEP * size * bob, face.x * lean, face.z * lean);
      }
      ctx.fillStyle = INK;
      ctx.fill();

      for (const s of spikes) if (!s.far) needle(ctx, s.root, s.tip, s.w);

      // A comic glint on top, up and to the left.
      const topY = (LAYERS - 1) * STEP * size * bob;
      const [gx, gy] = project(view, lead.x - 0.16 * size, topY * 0.95, lead.z - 0.08 * size);
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.ellipse(gx + wobble(1, 3, boil), gy + wobble(1, 4, boil), 0.2 * size * view.scale, 0.06 * size * view.scale, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gx + 0.26 * size * view.scale, gy + 0.05 * size * view.scale, 0.035 * size * view.scale, 0, Math.PI * 2);
      ctx.fill();

      // The eyes: two jagged white Venom eyes on the side it faces, when that side faces us. It blinks.
      if (time > blinkAt + 0.14) blinkAt = time + 2.5 + hash(Math.floor(time), 7) * 3;
      const open = time > blinkAt && time < blinkAt + 0.14 ? 0.12 : 1;
      if (face.x + face.z > -0.75) {
        const side = { x: -face.z, z: face.x };
        for (const s of [-1, 1]) {
          const ex = lead.x + face.x * 0.38 * size + side.x * s * 0.15 * size;
          const ez = lead.z + face.z * 0.38 * size + side.z * s * 0.15 * size;
          const [cx, cy] = project(view, ex, topY * 0.72, ez);
          const w = 0.15 * size * view.scale, h = 0.1 * size * view.scale * open;
          const tilt = s * 0.45; // slanted down toward the middle: it means it
          const pt = (u: number, v: number) => [cx + u * Math.cos(tilt) - v * Math.sin(tilt), cy + u * Math.sin(tilt) + v * Math.cos(tilt)] as const;
          ctx.beginPath();
          const shape: [number, number][] = [[-w, -h * 0.2], [-w * 0.2, -h], [w * 0.9, -h * 0.55], [w * 1.05, h * 0.2], [w * 0.1, h * 0.7], [-w * 0.8, h * 0.35]];
          shape.forEach(([u, v], i) => {
            const [px, py] = pt(u * s + wobble(i, 11 + s, boil) * 1.2, v + wobble(i, 13 + s, boil) * 1.2);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
        }
      }
    },
  };
};
