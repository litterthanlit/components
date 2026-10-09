#!/usr/bin/env node
/**
 * Fail if a study can't be taken apart cleanly on its page.
 *
 *   npm run check:anatomy                  # every study in src/registry/anatomy.ts
 *   npm run check:anatomy -- knob          # one study (others are skipped)
 *   npm run check:anatomy -- --widths=375  # chosen viewport widths
 *
 * The anatomy (src/components/anatomy) is real CSS 3D, and 3D is fragile: a
 * filter, an opacity, a clip or a blend anywhere on the path from the scene
 * down to a part flattens everything under it into one plane, silently. So
 * this opens each study's anatomy, spreads it all the way, and fails when:
 *
 *   - something on the path to a part would flatten it (globals.css opens
 *     overflow and isolation itself; this finds the rest),
 *   - a part moves by its own transform (the anatomy owns transform; use
 *     translate, rotate or scale), or is display: inline (transforms skip it),
 *   - a part names a kind components/anatomy/parts.ts doesn't know,
 *   - the parts, fully apart, spill out of the stage.
 *
 * Needs the app running (npm run build && npm start). BASE_URL and
 * CHROMIUM_PATH work as they do for check:fit.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/studies";
const DEFAULT_WIDTHS = [375, 1280];
const TOLERANCE = 1;
const OPEN = 1400; // ms for the camera and the spread to settle

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const widths = flag("widths")?.split(",").map(Number) ?? DEFAULT_WIDTHS;

// The studies that can be taken apart are the top-level keys of the anatomy map.
const anatomySource = await readFile(path.resolve("src/registry/anatomy.ts"), "utf8");
const block = anatomySource.slice(anatomySource.indexOf("export const anatomy"));
const allSlugs = [...block.matchAll(/^ {2}"?([a-z0-9-]+)"?: \{/gm)].map((m) => m[1]);
const partsSource = await readFile(path.resolve("src/components/anatomy/parts.ts"), "utf8");
const kinds = [...partsSource.matchAll(/^ {2}([a-z]+): \{/gm)].map((m) => m[1]);

// Slugs that can't be taken apart are skipped, so verify.sh can pass this the same list as check:fit.
const requested = args.filter((a) => !a.startsWith("--"));
const slugs = requested.length ? requested.filter((s) => allSlugs.includes(s)) : allSlugs;
if (!slugs.length) {
  console.log(`Nothing to take apart: ${requested.join(", ")} ${requested.length === 1 ? "isn't" : "aren't"} in src/registry/anatomy.ts.`);
  process.exit(0);
}

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

/** Runs in the page, with the study apart. Returns a list of problems. */
function inspect(known) {
  const scene = document.querySelector("[data-anatomy]");
  if (!scene) return ["the anatomy never opened"];
  const problems = [];
  const name = (el) => {
    const part = el.dataset?.part ? `[data-part="${el.dataset.part}"]` : "";
    const cls = typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    return `<${el.tagName.toLowerCase()}${part}${cls}>`;
  };
  // What flattens 3D, beyond the overflow and isolation that globals.css opens on the path.
  const flattens = (cs) =>
    [
      cs.transformStyle !== "preserve-3d" && "transform-style: flat",
      cs.filter !== "none" && `filter: ${cs.filter}`,
      parseFloat(cs.opacity) < 1 && `opacity: ${cs.opacity}`,
      cs.clipPath !== "none" && `clip-path: ${cs.clipPath}`,
      cs.maskImage && cs.maskImage !== "none" && "mask",
      cs.mixBlendMode !== "normal" && `mix-blend-mode: ${cs.mixBlendMode}`,
      cs.isolation === "isolate" && "isolation: isolate",
      !["visible", "clip"].includes(cs.overflowX) && `overflow: ${cs.overflowX}`,
      /paint|strict|content/.test(cs.contain) && `contain: ${cs.contain}`,
    ].filter(Boolean);

  const parts = [...scene.querySelectorAll("[data-part]")];
  if (!parts.length) problems.push("no parts are marked with data-part");
  const path = new Set();
  for (const part of parts) {
    const cs = getComputedStyle(part);
    if (!known.includes(part.dataset.part)) problems.push(`${name(part)}: unknown kind "${part.dataset.part}" (add it to components/anatomy/parts.ts)`);
    if (part.style.transform) problems.push(`${name(part)}: moves by an inline transform, which the anatomy owns (use translate)`);
    if (cs.display === "inline") problems.push(`${name(part)}: display: inline, so it can't be lifted`);
    for (let el = part.parentElement; el && el !== scene; el = el.parentElement) path.add(el);
  }
  for (const el of path) {
    const why = flattens(getComputedStyle(el));
    if (why.length) problems.push(`${name(el)} on the path to a part: ${why.join(", ")}`);
    // A blending child makes its parent an isolated group, which flattens it.
    for (const child of el.children) {
      if (path.has(child) || child.dataset?.part) continue;
      const blend = getComputedStyle(child).mixBlendMode;
      if (blend !== "normal") problems.push(`${name(child)}: blends (${blend}) under ${name(el)}, which isolates it`);
    }
  }

  // Fully apart, every part stays on the stage.
  const stage = scene.closest("[data-preview]").getBoundingClientRect();
  const over = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const el of [scene.firstElementChild, ...parts]) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    over.top = Math.max(over.top, stage.top - r.top);
    over.left = Math.max(over.left, stage.left - r.left);
    over.bottom = Math.max(over.bottom, r.bottom - stage.bottom);
    over.right = Math.max(over.right, r.right - stage.right);
  }
  const spills = Object.entries(over).filter(([, px]) => px > 1);
  if (spills.length) problems.push(`fully apart, spills ${spills.map(([side, px]) => `${side} ${Math.ceil(px)}px`).join(", ")} (stage ${Math.round(stage.width)}×${Math.round(stage.height)})`);
  return problems;
}

const browser = await launch();
const failures = [];
let checks = 0;

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  for (const slug of slugs) {
    await page.goto(`${BASE_URL}/c/${slug}`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await page.locator("[data-anatomy-key]").click();
    // Fully apart: End on the spread slider.
    await page.locator('input[type="range"]').focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(OPEN);
    const problems = await page.evaluate(inspect, kinds);
    checks++;
    // The same problem at every width is said once.
    for (const p of problems) failures.push(`${String(width).padStart(4)}px  ${slug}: ${p}`);
  }
  await context.close();
}
await browser.close();

console.log(`Took ${slugs.length} stud${slugs.length === 1 ? "y" : "ies"} apart at ${widths.length} width${widths.length === 1 ? "" : "s"} (${checks} checks).\n`);
if (failures.length) {
  console.error(`✗ ${failures.length} problem${failures.length === 1 ? "" : "s"}:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("✓ Every study comes apart in 3D and stays on its stage.");
