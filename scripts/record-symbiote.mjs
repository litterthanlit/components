#!/usr/bin/env node
/**
 * Render Symbiote Field to video, a frame at a time. A frame depends only on
 * its time and the pointer's path up to it, so a scripted path makes the
 * same film every time, at any resolution, however slow the machine.
 *
 *   npm run record:symbiote                          # 1280 × 720, 30 fps, 15 s
 *   npm run record:symbiote -- --w=1920 --h=1080 --fps=60
 *   npm run record:symbiote -- --seconds=6           # just the ghost's creature
 *
 * Needs the app running (npm run dev / npm start) and ffmpeg on the PATH.
 * BASE_URL is the app root, including /studies; CHROMIUM_PATH picks the browser.
 *
 * Output: captures/symbiote-field.mp4 (H.264, yuv420p, CRF 16).
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/studies";
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value === undefined ? true : value;
};

const width = Number(flag("w", 1280));
const height = Number(flag("h", 720));
const fps = Number(flag("fps", 30));
const seconds = Number(flag("seconds", 15));
const needles = flag("needles", "");
const out = path.resolve(String(flag("out", "captures/symbiote-field.mp4")));

const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The hand, after the ghost's first five seconds: it draws a long S across
 * the page, holds the button down to pump up a lump, hovers by the edge so
 * the veins reach for it, then switches to repel, pushes back and forth
 * through the middle, and leaves.
 */
function hand(t) {
  const presence = smooth(5.6, 6.0, t) * (1 - smooth(13.8, 14.4, t));
  let x, z;
  if (t < 9.4) {
    const u = smooth(5.6, 8.2, t);
    x = lerp(-2.6, 2.4, u);
    z = 1.1 * Math.sin(u * Math.PI * 1.6) - 0.3;
  } else if (t < 10.8) {
    const u = smooth(9.4, 10.4, t);
    x = lerp(2.4, 1.2, u);
    z = lerp(-0.3 + 1.1 * Math.sin(Math.PI * 1.6), 1.9, u);
  } else {
    const u = (t - 10.8) / 3;
    x = 1.8 * Math.cos(u * Math.PI * 2.2);
    z = 0.5 * Math.sin(u * Math.PI * 3.1);
  }
  const mode = 1 - 2 * smooth(10.6, 11.0, t);
  return { pointer: { x, z, presence, pressed: t > 8.2 && t < 9.2 }, mode };
}

await mkdir(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width, height } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`${BASE_URL}/lab/symbiote-field?render=1&w=${width}&h=${height}${needles ? `&needles=${needles}` : ""}`);
await page.waitForFunction(() => window.symbiote, null, { timeout: 120_000 });

const ffmpeg = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));

const frames = Math.round(seconds * fps);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  const url = await page.evaluate(({ t, hand }) => {
    const pointer = t < 5.2 ? window.symbiote.ghost(t) : hand.pointer;
    return window.symbiote.frame({ time: t, pointer, mode: t < 5.2 ? 1 : hand.mode });
  }, { t, hand: hand(t) });
  if (!ffmpeg.stdin.write(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % fps === 0) process.stdout.write(`\r${String(Math.round((i / frames) * 100)).padStart(3)}%  frame ${i} of ${frames}`);
}
ffmpeg.stdin.end();
await done;
await browser.close();
console.log(`\r100%  ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), out)}`);
