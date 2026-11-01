"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SymbioteField } from "@/registry/components/symbiote-field";
import { ProtoCanvas, type Prototype } from "./prototypes/ink";
import { pet } from "./prototypes/pet";
import { pinArt } from "./prototypes/pin-art";
import { swarm } from "./prototypes/swarm";
import { tendrils } from "./prototypes/tendrils";

/*
 * Five takes on the symbiote, side by side, to pick one. Each is a quick
 * Canvas 2D sketch of an idea, not a finished study: the one picked gets
 * built properly. The fifth is the study as it stands.
 */

type Take = { id: string; name: string; idea: string; hint: string; prototype?: Prototype };

const TAKES: Take[] = [
  {
    id: "pin-art",
    name: "Pin art",
    idea: "A field of needles you sculpt, like a pin-art toy. They rise under the pointer and stay; where they stand thick, black goo wells up between them and the shape comes alive.",
    hint: "Move to raise needles; move fast to raise more. Hold to push up a spike.",
    prototype: pinArt,
  },
  {
    id: "tendrils",
    name: "Tendrils",
    idea: "A black core that shoots ink tendrils at the pointer. Click and a tendril latches where you are; the creature grows along every anchor, a web of goo with spines.",
    hint: "Move to tempt it. Click to anchor a tendril. Anchor a few and watch it spread along them.",
    prototype: tendrils,
  },
  {
    id: "pet",
    name: "Pet",
    idea: "One blob that follows the pointer like a pet. Move fast and it stretches and splits into droplets that crawl home; click to feed it and it grows, bristling with more spikes.",
    hint: "Lead it around. Flick to split it. Click to feed it.",
    prototype: pet,
  },
  {
    id: "swarm",
    name: "Swarm",
    idea: "Needles lying loose on the paper. Near the pointer they stand and flock into a bristling ball that follows you; leave, or click, and they drop where they are, so you build piles.",
    hint: "Gather them up. Click to slam them down. Build a mound.",
    prototype: swarm,
  },
  {
    id: "paint",
    name: "Paint",
    idea: "The study as it stands: a mass you paint with the pointer, with needles where it is thick and veins creeping out.",
    hint: "Move to grow it. Hold to pump it up.",
  },
];

export function SymbiotePrototypes() {
  const [at, setAt] = useState(0);
  const [run, setRun] = useState(0); // bumping it remounts the take: a blank page
  const take = TAKES[at];

  // 1–5 pick a take; R starts it again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TAKES.length) setAt(n - 1);
      if (e.key === "r") setRun((r) => r + 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-[100svh] min-h-[560px] overflow-hidden bg-white text-black">
      {take.prototype ? (
        <ProtoCanvas key={`${take.id}-${run}`} prototype={take.prototype} className="absolute inset-0" />
      ) : (
        <SymbioteField key={`${take.id}-${run}`} className="absolute inset-0" />
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-6 p-4 sm:p-8">
        <div className="max-w-[30rem]">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-black/40">
            Symbiote · take {at + 1} of {TAKES.length}
          </p>
          <h1 className="mt-3 text-[clamp(28px,4.4vw,44px)] font-medium leading-[1.02] tracking-[-0.025em]">{take.name}</h1>
          <p className="mt-3 text-[15px] leading-[1.5] text-black/60">{take.idea}</p>
          <p className="mt-2 text-[13px] leading-[1.5] text-black/40">{take.hint}</p>
        </div>
        <Link href="/lab/symbiote-field" className="pointer-events-auto shrink-0 rounded-md text-[14px] text-black/55 transition-colors duration-150 hover:text-black">
          The study →
        </Link>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-8">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-[18px] border border-black/[0.08] bg-white/80 p-2 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.25)] backdrop-blur-xl">
          <div role="radiogroup" aria-label="Take" className="flex flex-wrap rounded-[12px] bg-black/[0.05] p-0.5">
            {TAKES.map((t, i) => (
              <label
                key={t.id}
                className="grid h-8 cursor-pointer place-items-center rounded-[10px] px-3 text-[13px] font-medium text-black/55 transition-colors duration-150 hover:text-black has-checked:bg-black has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-black"
              >
                <input type="radio" name="take" checked={i === at} onChange={() => setAt(i)} className="sr-only" />
                <span>
                  <span className="mr-1.5 tabular-nums opacity-50">{i + 1}</span>
                  {t.name}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="h-8 rounded-[10px] px-3 text-[13px] font-medium text-black/60 transition-colors duration-150 hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            Start again
          </button>
        </div>
      </div>
    </div>
  );
}
