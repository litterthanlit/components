#!/usr/bin/env node
/**
 * Export every component (or a chosen few) as tweet-ready PNGs.
 *
 *   npm run capture                         # all components, dark + light
 *   npm run capture -- spotlight-card       # one component
 *   npm run capture -- --theme=dark --bg=glow --video
 *
 * Needs the app running (npm run dev / npm start). Set BASE_URL (the app root,
 * including /studies) to point
 * elsewhere, CHROMIUM_PATH to use a specific browser binary.
 *
 * Output: captures/<slug>-<theme>.png at 2× (2400×1350), plus a short
 * .webm per component with --video (convert to mp4 for X; see README).
 */
import { mkdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/studies";
const OUT = path.resolve("captures");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value ?? true;
};

const registrySource = await readFile(path.resolve("src/registry/index.ts"), "utf8");
const allSlugs = [...registrySource.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
const requested = args.filter((a) => !a.startsWith("--"));
const slugs = requested.length ? requested : allSlugs;
const unknown = slugs.filter((s) => !allSlugs.includes(s));
if (unknown.length) {
  console.error(`Unknown component(s): ${unknown.join(", ")}\nAvailable: ${allSlugs.join(", ")}`);
  process.exit(1);
}

const themeFlag = flag("theme", "both");
const themes = themeFlag === "both" ? ["dark", "light"] : [themeFlag];
const width = Number(flag("w", 1200));
const height = Number(flag("h", 675));
const bg = flag("bg", "");
const video = Boolean(flag("video", false));
const wait = Number(flag("wait", 1600));

await mkdir(OUT, { recursive: true });

// Prefer an explicit binary, then Playwright's own Chromium, then installed Chrome.
async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}
const browser = await launch();

for (const slug of slugs) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      ...(video ? { recordVideo: { dir: OUT, size: { width, height } } } : {}),
    });
    const page = await context.newPage();
    const query = new URLSearchParams({ theme, w: String(width), h: String(height) });
    if (bg) query.set("bg", bg);
    const url = `${BASE_URL}/capture/${slug}?${query}`;

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(wait); // let entrance animations settle

    // Nudge pointer-driven demos so stills show them "alive".
    const frame = page.locator("#capture-frame");
    const box = await frame.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.4, { steps: 12 });
      await page.waitForTimeout(500);
    }

    const file = path.join(OUT, `${slug}-${theme}.png`);
    await frame.screenshot({ path: file });
    console.log(`✓ ${path.relative(process.cwd(), file)}`);

    if (video) {
      // A short, gentle cursor path so recordings have motion.
      if (box) {
        for (let i = 0; i <= 60; i++) {
          const t = i / 60;
          await page.mouse.move(
            box.x + box.width * (0.3 + 0.4 * t),
            box.y + box.height * (0.45 + 0.1 * Math.sin(t * Math.PI * 2)),
          );
          await page.waitForTimeout(30);
        }
      }
      await page.waitForTimeout(1200);
      const recording = page.video();
      await context.close();
      if (recording) {
        const target = path.join(OUT, `${slug}-${theme}.webm`);
        await rename(await recording.path(), target);
        console.log(`✓ ${path.relative(process.cwd(), target)}`);
      }
    } else {
      await context.close();
    }
  }
}

await browser.close();
