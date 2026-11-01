import { INK, PAPER, needle, project, seeded, wobble, type Prototype } from "./ink";

/*
 * Pin art: a board of needles you sculpt. The pointer raises the pins it
 * passes, faster the faster it moves, and they stay up; holding the button
 * pushes up a column of spikes. Where pins stand tall, black goo wells up
 * between them, so the shape you raise becomes a body, and the body is
 * alive: it breathes, its tallest parts slowly spread, and its pins lean
 * toward the pointer and wiggle.
 */

const N = 48; // pins a side
const SPAN = 3.8; // world units from the centre to the board's edge
const STEP = (2 * SPAN) / (N - 1);
const REST = 0.035; // a pin at rest: a short tick on the board
const MAX = 1.7;

export const pinArt: Prototype = () => {
  const random = seeded(11);
  const height = new Float32Array(N * N).fill(REST); // the sculpted height
  const shown = new Float32Array(N * N).fill(REST); // on a spring toward it, so pins shoot up and settle
  const speed = new Float32Array(N * N);
  const jitter = Float32Array.from({ length: N * N * 2 }, () => (random() - 0.5) * STEP * 0.35);
  const at = (i: number, j: number) => [-SPAN + i * STEP + jitter[(i * N + j) * 2], -SPAN + j * STEP + jitter[(i * N + j) * 2 + 1]] as const;
  // The goo stands a little under the pins' tips, only where they are tall.
  const goo = (h: number) => Math.max(0, h - 0.22) * 0.55;

  return {
    frame({ ctx, view, pointer, time, dt, boil }) {
      // Sculpt: raise pins round the pointer, more for speed, a column while held.
      if (pointer.present) {
        const fast = Math.min(1, Math.hypot(pointer.vx, pointer.vz) / 5);
        const reach = pointer.pressed ? 0.32 : 0.5;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const [x, z] = at(i, j);
            const d2 = (x - pointer.x) ** 2 + (z - pointer.z) ** 2;
            if (d2 > 1.2) continue;
            const k = i * N + j;
            const fall = Math.exp(-d2 / (reach * reach));
            height[k] = Math.min(MAX, height[k] + fall * dt * (pointer.pressed ? 2.6 : 0.15 + 1.1 * fast));
          }
        }
      }
      // Alive: tall regions creep outward a little into their neighbours.
      for (let i = 1; i < N - 1; i++) {
        for (let j = 1; j < N - 1; j++) {
          const k = i * N + j;
          const around = Math.max(height[k - 1], height[k + 1], height[k - N], height[k + N]);
          if (around > 0.5 && height[k] < around * 0.7) height[k] += dt * 0.03 * around;
        }
      }
      // The pins' springs: they overshoot and settle, so a raise looks like a pin shooting up.
      for (let k = 0; k < N * N; k++) {
        speed[k] += ((height[k] - shown[k]) * 160 - speed[k] * 14) * dt;
        shown[k] += speed[k] * dt;
      }

      ctx.fillStyle = PAPER; // the pins are the board's only marks
      ctx.fillRect(0, 0, view.width, view.height);
      const breath = (i: number, j: number) => 1 + 0.05 * Math.sin(time * 1.6 - (i + j) * 0.18);
      const tall = (i: number, j: number) => shown[i * N + j] * breath(i, j);

      // Back to front: the diagonal i + j grows toward the viewer.
      for (let s = 0; s <= 2 * (N - 1); s++) {
        // The goo's surface on this diagonal: one quad a cell, black, with a white glint where it faces the light.
        for (let i = Math.max(0, s - (N - 2)); i <= Math.min(N - 2, s); i++) {
          const j = s - i;
          if (j > N - 2) continue;
          const h00 = goo(tall(i, j)), h10 = goo(tall(i + 1, j)), h01 = goo(tall(i, j + 1)), h11 = goo(tall(i + 1, j + 1));
          if (h00 + h10 + h01 + h11 <= 0) continue;
          const corners = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
          const hs = [h00, h10, h11, h01];
          ctx.beginPath();
          corners.forEach(([x, z], c) => {
            const [px, py] = project(view, x, hs[c], z);
            if (c === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          // The surface's slope across the cell: a glint where it tips toward the light.
          const gx = (h10 + h11 - h00 - h01) / (2 * STEP), gz = (h01 + h11 - h00 - h10) / (2 * STEP);
          const glint = -gx * 0.5 + gz * 0.65 + wobble(i * N + j, 3, boil) * 0.12;
          ctx.fillStyle = glint > 0.9 ? PAPER : INK;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.8;
          ctx.fill();
          if (glint <= 0.9) ctx.stroke(); // close the hairline seams between cells
        }

        // The pins on this diagonal.
        for (let i = Math.max(0, s - (N - 1)); i <= Math.min(N - 1, s); i++) {
          const j = s - i;
          const k = i * N + j;
          const h = tall(i, j);
          const [x, z] = at(i, j);
          const base = goo(h);
          if (h < 0.08) {
            // At rest: a short tick on the board.
            const [x0, y0] = project(view, x, 0, z);
            ctx.strokeStyle = h < REST * 1.5 ? "#b8b8b8" : INK;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + wobble(k, 1, boil) * 1.2, y0 - Math.max(2.5, h * view.scale));
            ctx.stroke();
            continue;
          }
          // Lean toward the pointer, and wiggle; tall pins sway more.
          let lx = wobble(k, 5, boil) * 0.06, lz = wobble(k, 6, boil) * 0.06;
          lx += Math.sin(time * 2 + k) * 0.03 * h;
          if (pointer.present) {
            const dx = pointer.x - x, dz = pointer.z - z;
            const d = Math.hypot(dx, dz);
            const pull = Math.exp(-(d * d) / 0.8) * 0.5;
            lx += (dx / (d + 0.05)) * pull * (h - base);
            lz += (dz / (d + 0.05)) * pull * (h - base);
          }
          const root = project(view, x, base - 0.02, z);
          const tip = project(view, x + lx, h, z + lz);
          needle(ctx, root, tip, h > 1 ? 2.6 : 1.9, base > 0, 0.55);
        }
      }
    },
  };
};
