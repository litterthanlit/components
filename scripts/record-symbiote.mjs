#!/usr/bin/env node
/**
 * Render Symbiote Field to video, a frame at a time. Every frame is a pure
 * function of its time, progress, pointer and mode, so the same run always
 * makes the same film, at any resolution, however slow the machine.
 *
 *   npm run record:symbiote                                  # 1280 × 720, 30 fps, 13 s
 *   npm run record:symbiote -- --w=1920 --h=1080 --fps=60
 *   npm run record:symbiote -- --seconds=7 --still           # just the awakening, no pointer
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
const seconds = Number(flag("seconds", 13));
const needles = flag("needles", "");
const still = flag("still", false) === true;
const out = path.resolve(String(flag("out", "captures/symbiote-field.mp4")));

const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/**
 * The film's direction, as a function of time. The awakening plays out over
 * its 6 s; then a hand comes in from the front right, circles the field as
 * the needles reach for it, switches to repel so they duck away, and leaves.
 */
function direct(t, duration) {
  const progress = Math.min(1, t / duration);
  if (still) return { time: t, progress, pointer: { x: 0, z: 0, presence: 0 }, mode: 1 };
  const arrive = duration + 0.4, leave = duration + 5.2;
  const presence = smooth(arrive, arrive + 1.2, t) * (1 - smooth(leave, leave + 1.4, t));
  const a = 0.35 + (t - arrive) * 0.32; // radians round the creature
  const r = 2.2 - 0.9 * smooth(arrive, arrive + 2, t);
  const mode = 1 - 2 * smooth(duration + 3.2, duration + 3.8, t);
  return { time: t, progress, pointer: { x: r * Math.cos(a), z: r * Math.sin(a), presence }, mode };
}

await mkdir(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width, height } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`${BASE_URL}/lab/symbiote-field?render=1&w=${width}&h=${height}${needles ? `&needles=${needles}` : ""}`);
await page.waitForFunction(() => window.symbiote, null, { timeout: 120_000 });
const duration = await page.evaluate(() => window.symbiote.duration);

const ffmpeg = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));

const frames = Math.round(seconds * fps);
const started = Date.now();
for (let i = 0; i < frames; i++) {
  const url = await page.evaluate((frame) => window.symbiote.frame(frame), direct(i / fps, duration));
  if (!ffmpeg.stdin.write(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"))) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (i % fps === 0) process.stdout.write(`\r${String(Math.round((i / frames) * 100)).padStart(3)}%  frame ${i} of ${frames}`);
}
ffmpeg.stdin.end();
await done;
await browser.close();
console.log(`\r100%  ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), out)}`);
