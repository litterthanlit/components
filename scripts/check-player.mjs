#!/usr/bin/env node
/**
 * Fail if the home page's player drifts from what was decided for it
 * (docs/superpowers/specs/2026-11-01-slab-player-design.md): one object at
 * 160 × 116, never wider than 880 px; a finish that follows the theme; the
 * study's name said once, on the readout, with no transport chip; a study's
 * plate and its own screen dissolved on the player; a pop-up that only says
 * the volume. Each case loads the home page in a fresh page.
 *
 *   npm run check:player
 *
 * Needs the app running (npm run build && npm start). Set BASE_URL (the app
 * root, including /studies) to point elsewhere, CHROMIUM_PATH to use a
 * specific browser binary.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000/studies";
const SETTLE = 900; // entrance animations: --duration-enter plus the stagger
const SILVER = "rgb(228, 231, 234)"; // the casing's top stop in light
const GRAPHITE = "rgb(75, 78, 84)"; // and in dark

const registrySource = await readFile(path.resolve("src/registry/index.ts"), "utf8");
const takes = [...registrySource.matchAll(/slug:\s*"([^"]+)",\s*title:\s*"([^"]+)"/g)].map((m) => ({ slug: m[1], title: m[2] }));

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

const browser = await launch();
const failures = [];
let checks = 0;

/** Opens the home page at a size and theme, settled, and runs a case on it. */
async function check(name, { width = 1440, height = 900, theme = "light" } = {}, run) {
  checks++;
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const problems = [];
  const expect = (ok, what) => ok || problems.push(what);
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "load" });
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.waitForSelector("[data-player-readout]");
    await page.waitForTimeout(SETTLE);
    await run(page, expect);
  } catch (error) {
    problems.push(`threw: ${error.message.split("\n")[0]}`);
  }
  for (const p of problems) failures.push(`${name} @ ${width}×${height} ${theme}: ${p}`);
  await context.close();
}

const box = (page, selector) => page.locator(selector).first().boundingBox();
/** Whether a box lies wholly inside the viewport, with a pixel of rounding. */
const inside = (b, w, h) => b && b.x >= -1 && b.y >= -1 && b.x + b.width <= w + 1 && b.y + b.height <= h + 1;
const casing = (page) => page.$eval("[data-player]", (el) => getComputedStyle(el).backgroundImage);
/** Steps the dial to a take by slug, with → from wherever it is. */
async function dialTo(page, slug) {
  for (let i = 0; i < takes.length; i++) {
    const name = await page.$eval("[data-player-name]", (el) => el.textContent.trim());
    if (name === takes.find((t) => t.slug === slug).title) return;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
  }
  throw new Error(`never reached ${slug}`);
}

await check("size", {}, async (page, expect) => {
  const b = await box(page, "[data-player]");
  expect(b.width <= 880.5, `object is ${b.width.toFixed(1)} px wide, more than 880`);
  expect(Math.abs(b.width / b.height - 160 / 116) < 0.01, `object is ${(b.width / b.height).toFixed(3)}:1, not 160 × 116`);
});

await check("short desktop", { width: 1280, height: 600 }, async (page, expect) => {
  expect(inside(await box(page, "[data-player]"), 1280, 600), "object runs off the window");
  expect(inside(await box(page, '[aria-label^="Dial"]'), 1280, 600), "dial runs off the window");
});

await check("phone", { width: 390, height: 844 }, async (page, expect) => {
  expect(inside(await box(page, "[data-player]"), 390, 844), "object runs off the window");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page scrolls sideways");
});

await check("short landscape", { width: 844, height: 390 }, async (page, expect) => {
  for (const [what, selector] of [["object", "[data-player]"], ["dial", '[aria-label^="Dial"]'], ["readout", "[data-player-readout]"]])
    expect(inside(await box(page, selector), 844, 390), `${what} runs off the window`);
  const screen = await box(page, "[data-player-screen]");
  expect(screen && screen.height >= 240, `screen is ${screen?.height.toFixed(0)} px tall, under 240`);
});

await check("finish, light", {}, async (page, expect) => expect((await casing(page)).includes(SILVER), "light casing is not silver"));
await check("finish, dark", { theme: "dark" }, async (page, expect) => expect((await casing(page)).includes(GRAPHITE), "dark casing is not graphite"));

await check("theme flip", {}, async (page, expect) => {
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.waitForTimeout(50);
  expect((await casing(page)).includes(GRAPHITE), "casing kept its silver after the theme went dark");
});

await check("readout", {}, async (page, expect) => {
  const text = await page.$eval("[data-player-readout]", (el) => el.innerText.replace(/\s+/g, " ").trim());
  const title = await page.$eval("[data-player-name]", (el) => el.textContent.trim());
  expect(new RegExp(`^${title} \\d{2} / ${takes.length}$`).test(text), `readout reads "${text}", not "${title} NN / ${takes.length}"`);
  expect(!/\b(Play|Pause|Stop)\b/i.test(text), "readout carries a transport word");
});

await check("name once", {}, async (page, expect) => {
  const count = await page.evaluate(() => {
    const title = document.querySelector("[data-player-name]").textContent.trim();
    return [...document.querySelectorAll("body *")].filter((el) => {
      if (el.closest("[data-app], section[aria-label]")) return false;
      // Visually hidden lists (sr-only) are for screen readers and crawlers, not on show.
      for (let a = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.clipPath === "inset(50%)" || cs.clip === "rect(0px, 0px, 0px, 0px)") return false;
      }
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      const r = el.getBoundingClientRect();
      return own === title && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }).length;
  });
  expect(count === 1, `the study's name shows ${count} times outside the screen`);
});

await check("light", {}, async (page, expect) => {
  const lit = () => page.$eval("[data-player-light]", (el) => el.hasAttribute("data-on"));
  const before = await lit();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  expect((await lit()) !== before, "Space did not change the light");
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  expect((await lit()) === before, "a second Space did not put the light back");
});

await check("dissolve", {}, async (page, expect) => {
  const plates = await page.$$eval("[data-player-screen] [data-part=plate]", (els) =>
    els.map((el) => [getComputedStyle(el).backgroundImage, getComputedStyle(el).boxShadow]),
  );
  expect(plates.length > 0, "no plate on the screen to check");
  expect(plates.every(([bg, sh]) => bg === "none" && sh === "none"), "a plate keeps its finish on the screen");
  await dialTo(page, "spool");
  await page.waitForTimeout(SETTLE);
  const spool = await page.$eval("[data-player-screen] [data-part=bezel]", (el) => [getComputedStyle(el).boxShadow, getComputedStyle(el.querySelector("[data-part=glass]")).display]);
  expect(spool[0] === "none", "Spool's bezel keeps its rim");
  expect(spool[1] === "none", "Spool's glass still shows");
  await dialTo(page, "number-ticker");
  await page.waitForTimeout(SETTLE);
  const ticker = await page.$eval("[data-player-screen] [data-part=bezel]", (el) => getComputedStyle(el).boxShadow);
  expect(ticker !== "none", "Number Ticker's bezel lost its rim: it frames drums, not a screen");
});

await check("hud", {}, async (page, expect) => {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const hud = await page.$eval("[data-player-hud]", (el) => [getComputedStyle(el).opacity, el.textContent]);
  const title = await page.$eval("[data-player-name]", (el) => el.textContent.trim());
  expect(hud[0] === "0" || !hud[1].includes(title), "the pop-up repeats the study's name while dialling");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(300);
  const volume = await page.$eval("[data-player-hud]", (el) => [getComputedStyle(el).opacity, el.textContent]);
  expect(volume[0] !== "0" && volume[1].includes("Volume"), "the pop-up does not show the volume");
});

await check("long title", { width: 390, height: 844 }, async (page, expect) => {
  const longest = takes.reduce((a, b) => (b.title.length > a.title.length ? b : a));
  await dialTo(page, longest.slug);
  const name = await box(page, "[data-player-name]");
  const light = await box(page, "[data-player-light]");
  expect(name.x + name.width <= light.x + 0.5, `"${longest.title}" runs under the take figures`);
});

await check("header focus", {}, async (page, expect) => {
  let style = null;
  for (let i = 0; i < 12 && !style; i++) {
    await page.keyboard.press("Tab");
    style = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest("header") && /^(Menu|Back)$/.test(el.textContent.trim()) ? getComputedStyle(el).outlineStyle : null;
    });
  }
  expect(style === "solid", `Menu shows no focus ring from the keyboard (outline: ${style})`);
});

await check("details", {}, async (page, expect) => {
  const sheet = '[data-player-screen] section[aria-label^="About"]';
  const shown = () => page.$eval(sheet, (el) => getComputedStyle(el).visibility === "visible");
  await page.getByRole("button", { name: "Details" }).click();
  await page.waitForTimeout(500);
  expect(await shown(), "Details did not open the sheet");
  const ground = await page.$eval(sheet, (el) => getComputedStyle(el).backgroundColor);
  // The screens' glass colour, resolved the way the browser paints it.
  const panel = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--device-pane-panel)";
    document.querySelector("[data-player-screen]").append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  expect(ground !== panel, "the Details sheet took the screens' glass colour instead of its own surface");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Details" }).click();
  await page.waitForTimeout(500);
  expect(await shown(), "Details did not open the sheet a second time");
});

await browser.close();

console.log(`Checked the player ${checks} ways.\n`);
if (failures.length) {
  console.log(`✗ ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("✓ The player matches its design.");
