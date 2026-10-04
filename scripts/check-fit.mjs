#!/usr/bin/env node
/**
 * Fail if any component demo spills out of its stage.
 *
 *   npm run check:fit                      # every component
 *   npm run check:fit -- agent-shapes      # one component
 *   npm run check:fit -- --widths=375,1280 # chosen viewport widths
 *
 * The stage (src/components/gallery/preview.tsx) clips whatever leaves its
 * padded box, so a demo that is too tall loses its top and bottom edges
 * without any error. This loads each component page, every component on the
 * home page's device (running full width on its screen), and the capture
 * frame at several viewport widths and
 * measures every demo, including absolutely positioned and transformed
 * children, against that padded box.
 *
 * Needs the app running (npm run build && npm start). Set BASE_URL (the app root,
 * including /studies) to point
 * elsewhere, CHROMIUM_PATH to use a specific browser binary.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/studies";
// Phones, the sm/md/lg breakpoints, laptop and desktop: each changes a stage's size.
const DEFAULT_WIDTHS = [375, 640, 768, 1024, 1280, 1536];
// Sub-pixel rounding and anti-aliasing never count as overflow.
const TOLERANCE = 1;
const SETTLE = 900; // entrance animations: --duration-enter plus the stagger

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const widths = flag("widths")?.split(",").map(Number) ?? DEFAULT_WIDTHS;

const registrySource = await readFile(path.resolve("src/registry/index.ts"), "utf8");
const allSlugs = [...registrySource.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
const requested = args.filter((a) => !a.startsWith("--"));
const slugs = requested.length ? requested : allSlugs;
const unknown = slugs.filter((s) => !allSlugs.includes(s));
if (unknown.length) {
  console.error(`Unknown component(s): ${unknown.join(", ")}\nAvailable: ${allSlugs.join(", ")}`);
  process.exit(1);
}

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

/**
 * Runs in the page. For every stage, returns how far the demo's painted extent
 * reaches past the stage's padded box on each side (positive = overflow).
 * `only` limits it to some slugs, `within` to stages inside one element.
 */
function measureStages({ only, within } = {}) {
  const union = (a, b) =>
    a ? { top: Math.min(a.top, b.top), left: Math.min(a.left, b.left), bottom: Math.max(a.bottom, b.bottom), right: Math.max(a.right, b.right) } : b;
  const intersect = (a, b) => ({
    top: Math.max(a.top, b.top),
    left: Math.max(a.left, b.left),
    bottom: Math.min(a.bottom, b.bottom),
    right: Math.min(a.right, b.right),
  });

  // Painted extent of an element and its descendants, cut down by any
  // clipping ancestor inside the demo (overflow: hidden, clip, auto, scroll).
  function extent(el, clip) {
    const style = getComputedStyle(el);
    // Hidden or fully faded elements (and everything inside them) paint nothing.
    if (style.display === "none" || parseFloat(style.opacity) === 0) return null;
    // So do visually hidden ones (sr-only): their -1px margin only shows once a stage zooms in.
    if (style.clipPath === "inset(50%)" || style.clip === "rect(0px, 0px, 0px, 0px)") return null;
    let box = null;
    const r = el.getBoundingClientRect();
    if (style.visibility !== "hidden" && r.width > 0 && r.height > 0) {
      const visible = clip ? intersect(r, clip) : r;
      if (visible.right > visible.left && visible.bottom > visible.top) box = visible;
    }
    const clips = style.overflowX !== "visible" || style.overflowY !== "visible";
    const childClip = clips ? (clip ? intersect(r, clip) : r) : clip;
    for (const child of el.children) {
      const inner = extent(child, childClip);
      if (inner) box = union(box, inner);
    }
    return box;
  }

  const root = within ? document.querySelector(within) : document;
  if (!root) return (only ?? []).map((slug) => ({ slug, mounted: false }));
  return [...root.querySelectorAll("[data-preview]")]
    .filter((stage) => !only || only.includes(stage.dataset.preview))
    .map((stage) => {
      const slug = stage.dataset.preview;
      const content = stage.querySelector("[data-preview-content]");
      const demo = content?.firstElementChild;
      if (!demo) return { slug, mounted: false };
      const s = stage.getBoundingClientRect();
      const cs = getComputedStyle(content);
      const zoom = parseFloat(cs.zoom) || 1;
      const pad = (side) => parseFloat(cs[`padding${side}`]) * zoom;
      const inner = { top: s.top + pad("Top"), left: s.left + pad("Left"), bottom: s.bottom - pad("Bottom"), right: s.right - pad("Right") };
      const e = extent(demo, null) ?? inner;
      return {
        slug,
        mounted: true,
        stage: `${Math.round(s.width)}×${Math.round(s.height)}`,
        over: { top: inner.top - e.top, bottom: e.bottom - inner.bottom, left: inner.left - e.left, right: e.right - inner.right },
      };
    });
}

const browser = await launch();
const failures = [];
const tightest = new Map(); // slug → smallest margin seen, in px
let checks = 0;

function record(where, width, results) {
  for (const r of results) {
    if (!r.mounted) {
      failures.push(`${where.padEnd(8)} ${String(width).padStart(4)}px  ${r.slug}: demo never mounted`);
      continue;
    }
    checks++;
    const worst = Math.max(...Object.values(r.over));
    // The summary tracks spare height: full-width demos always sit flush left
    // and right, and bottom-aligned stages put all their slack above the demo.
    const margin = -(r.over.top + r.over.bottom);
    // A stage that grows with its demo (phone component pages) is flush on both
    // sides and can't overflow vertically, so it says nothing about room.
    const contentSized = Math.abs(r.over.top) <= TOLERANCE && Math.abs(r.over.bottom) <= TOLERANCE;
    if (!contentSized && (!tightest.has(r.slug) || margin < tightest.get(r.slug).margin)) {
      tightest.set(r.slug, { margin, where: `${where} @ ${width}px` });
    }
    if (worst > TOLERANCE) {
      const sides = Object.entries(r.over)
        .filter(([, px]) => px > TOLERANCE)
        .map(([side, px]) => `${side} ${Math.ceil(px)}px`)
        .join(", ");
      failures.push(`${where.padEnd(8)} ${String(width).padStart(4)}px  ${r.slug}: spills ${sides} (stage ${r.stage})`);
    }
  }
}

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(SETTLE);
}

// Waits for a stage's demo to mount; one that never does is reported by record().
async function mounted(page, stage) {
  await page.waitForFunction((s) => document.querySelector(`${s} [data-preview-content] > *`), stage, { timeout: 10000 }).catch(() => {});
}

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();

  // Component pages: the large stage.
  for (const slug of slugs) {
    await page.goto(`${BASE_URL}/c/${slug}`, { waitUntil: "load" });
    await settle(page);
    record("detail", width, await page.evaluate(measureStages, { only: [slug] }));
  }

  // The home page is a device that mounts one study at a time, full width on
  // its screen. Step through them with the → key and measure each one there.
  await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
  await settle(page);
  for (const [i, slug] of allSlugs.entries()) {
    if (i > 0) await page.keyboard.press("ArrowRight");
    if (!slugs.includes(slug)) continue;
    await mounted(page, `[data-app] [data-preview="${slug}"]`);
    await page.waitForTimeout(SETTLE);
    record("screen", width, await page.evaluate(measureStages, { only: [slug], within: "[data-app]" }));
  }

  await context.close();
}

// Capture frames are fixed at 1200×675 and zoom the demo up for social posts.
{
  const context = await browser.newContext({ viewport: { width: 1200, height: 675 } });
  const page = await context.newPage();
  for (const slug of slugs) {
    await page.goto(`${BASE_URL}/capture/${slug}`, { waitUntil: "load" });
    await settle(page);
    record("capture", 1200, await page.evaluate(measureStages, { only: [slug] }));
  }
  await context.close();
}

await browser.close();

console.log(`Checked ${checks} stages: ${slugs.length} component(s) × ${widths.length} widths, plus capture frames.\n`);
console.log("Least spare height per component, in px:");
for (const slug of slugs) {
  const t = tightest.get(slug);
  if (t) console.log(`  ${slug.padEnd(20)} ${String(Math.floor(t.margin)).padStart(5)}  ${t.where}`);
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} overflow(s):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\n✓ Every demo fits its stage.");
