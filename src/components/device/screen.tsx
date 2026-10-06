"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Preview } from "@/components/gallery/preview";
import { cn, createSpring, springs, type Spring } from "@/design-system";
import { VOLUME_MAX } from "@/lib/sound";
import type { StageBackground } from "@/registry";
import { site } from "@/site.config";
import { useBoxSize } from "./hooks";
import type { Transport } from "./readout";

export type Study = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  tags: string[];
  date: string;
  background?: StageBackground;
  /** The component's source file and its size, as the readout shows them. */
  file: string;
  bytes: number;
};

const floor2 = (z: number) => Math.floor(z * 100) / 100;

/**
 * How much to zoom a running study. Demos are made for stages from a phone's
 * (about 330 × 380) up to a desktop's, so a smaller screen shrinks them
 * uniformly instead of clipping, and a big one grows them a little.
 */
export function appZoom({ w, h }: { w: number; h: number }) {
  return floor2(w >= 680 && h >= 480 ? Math.min(1.3, w / 680, h / 480) : Math.min(1, w / 330, h / 380));
}

/* --- Status line ---------------------------------------------------------- */

/** The title of what's on screen, centred, over a hairline. */
export function StatusBar({ title }: { title: string }) {
  return (
    <div className="relative z-30 grid h-[32px] shrink-0 place-items-center bg-canvas px-[24px] text-ink shadow-[0_1px_0_var(--line)] wide:h-[36px] wide:px-[34px]">
      <p key={title} className="max-w-[60cqw] animate-enter truncate text-[13px] font-medium tracking-[-0.01em] wide:text-[14px]">
        {title}
      </p>
    </div>
  );
}

/* --- The running study ----------------------------------------------------- */

/**
 * A running study, filling the screen at a zoom that fits it. It carries the
 * transport as `data-transport`, so a study that makes sound can tell whether
 * the tape is playing (see `hostTransport` in lib/sound).
 */
export function AppStage({ study, from, transport }: { study: Study; from: number; transport: Transport }) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  return (
    <div ref={box} data-app data-transport={transport} className="take-in absolute inset-0" style={{ "--from": from } as CSSProperties}>
      {size && <Preview slug={study.slug} background={study.background} zoom={appZoom(size)} className="h-full" />}
    </div>
  );
}

/* --- Lists on the screen ---------------------------------------------------- */

export type ListItem = { key: string; label: ReactNode; detail?: ReactNode; trailing?: ReactNode };

const rowClass = "flex h-[40px] items-center gap-3 px-4 @[640px]/display:h-[44px] @[640px]/display:px-5 @[640px]/display:text-[15px]";

/**
 * A list on the screen with the player's highlight bar. The bar is a second
 * copy of the rows in accent and white, clipped to the selection by a spring,
 * so it glides between rows and the text inside it changes colour exactly
 * where the bar is.
 */
export function ScreenList({
  items,
  index,
  label,
  idPrefix,
  reduced,
  listRef,
  onPick,
  className,
}: {
  items: ListItem[];
  index: number;
  label: string;
  idPrefix: string;
  reduced: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onPick: (index: number) => void;
  className?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const bar = useRef<Spring | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const el = overlayRef.current!;
    const s = createSpring(0, springs.snappy, (y) => el.style.setProperty("--y", `${y}px`));
    bar.current = s;
    return () => s.stop();
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-row="${index}"]`);
    if (!list || !row) return;
    const animate = placed.current && !reduced;
    overlayRef.current?.style.setProperty("--h", `${row.offsetHeight}px`);
    if (animate) bar.current?.set(row.offsetTop);
    else bar.current?.jump(row.offsetTop);
    // Keep a row of context above and below the highlight.
    const top = row.offsetTop - row.offsetHeight;
    const bottom = row.offsetTop + row.offsetHeight * 2;
    let next = list.scrollTop;
    if (top < list.scrollTop) next = Math.max(0, top);
    else if (bottom > list.scrollTop + list.clientHeight) next = bottom - list.clientHeight;
    if (next !== list.scrollTop) list.scrollTo({ top: next, behavior: animate ? "smooth" : "auto" });
    placed.current = true;
  }, [index, reduced, items.length, listRef]);

  // Row heights change with the screen's size; put the bar back without a glide.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      const row = list.querySelector<HTMLElement>("[aria-selected=true]");
      if (!row) return;
      overlayRef.current?.style.setProperty("--h", `${row.offsetHeight}px`);
      bar.current?.jump(row.offsetTop);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef]);

  const content = (item: ListItem) => (
    <>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.detail && <span className="hidden min-w-0 max-w-[45%] truncate text-[13px] opacity-60 @[520px]/display:block">{item.detail}</span>}
      {item.trailing}
    </>
  );

  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        ref={listRef}
        id={idPrefix}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={items.length ? `${idPrefix}-${index}` : undefined}
        className="absolute inset-0 overflow-y-auto overscroll-contain py-1.5 text-[14px] text-ink outline-offset-[-2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative">
          {items.map((item, i) => (
            <div key={item.key} id={`${idPrefix}-${i}`} role="option" aria-selected={i === index} data-row={i} onClick={() => onPick(i)} className={cn(rowClass, "cursor-default")}>
              {content(item)}
            </div>
          ))}
          <div
            ref={overlayRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] [clip-path:inset(var(--y,0px)_6px_calc(100%_-_var(--y,0px)_-_var(--h,0px))_6px_round_7px)]",
              !items.length && "hidden",
            )}
          >
            {items.map((item) => (
              <div key={item.key} className={rowClass}>
                {content(item)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Chevron({ external }: { external?: boolean }) {
  return external ? (
    <svg aria-hidden viewBox="0 0 12 12" className="size-[10px] shrink-0 opacity-70">
      <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg aria-hidden viewBox="0 0 7 12" className="h-[10px] w-auto shrink-0 opacity-70">
      <path d="M1.5 1.5 5.5 6l-4 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --- Panels: screens that take over the display ------------------------------ */

/** A screen over the running study. Mounted throughout, so it can slide; inert while closed. Callers set its layout. */
export function Panel({ open, label, children, className }: { open: boolean; label: string; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={label}
      inert={!open}
      data-open={open || undefined}
      className={cn(
        // Visibility only transitions on the way out, so an opening panel can take focus in its first frame.
        "invisible absolute inset-0 z-20 bg-canvas opacity-0 transition-[opacity,transform,visibility] duration-(--duration-exit) ease-out [transform:translateY(12px)] data-open:visible data-open:opacity-100 data-open:transition-[opacity,transform] data-open:[transform:none] data-open:duration-(--duration-enter)",
        className,
      )}
    >
      {children}
    </section>
  );
}

const quietLink = "rounded-sm text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)";

const socials = [
  { href: site.links.x, label: "X" },
  { href: site.links.linkedin, label: "LinkedIn" },
  { href: site.links.contra, label: "Contra" },
  { href: site.links.github, label: "GitHub" },
];

/** Home: who made this, and where else to go. */
export function HomeAbout() {
  return (
    <div className="flex min-w-0 flex-col justify-end gap-3 @[720px]/display:justify-center">
      {/* The Litt mark in ink: the logo's alpha as a mask, so it takes the theme. */}
      <span
        aria-hidden
        className="block aspect-[24/17] h-8 bg-ink [mask-position:left_center] [mask-repeat:no-repeat] [mask-size:contain] @[720px]/display:h-11"
        style={{ maskImage: `url(${site.basePath}/logo-mark.png)` }}
      />
      <p className="max-w-[22ch] text-[17px] font-medium leading-snug tracking-[-0.02em] text-ink @[720px]/display:text-[26px] @[720px]/display:leading-[1.2]">
        {site.intro}
      </p>
      <p className="text-meta text-muted">
        {site.author}, {site.role.toLowerCase()}.
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-meta">
        {socials.map((link) => (
          <li key={link.label}>
            <a href={link.href} target="_blank" rel="noreferrer" className={quietLink}>
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <a href={`mailto:${site.email}`} className={quietLink}>
            {site.email}
          </a>
        </li>
      </ul>
    </div>
  );
}

/** The volume as ten segments, lit up to the level. Clicking one sets it. */
export function VolumeBar({ volume, onSet, className }: { volume: number; onSet?: (volume: number) => void; className?: string }) {
  return (
    <span className={cn("flex items-end gap-[3px]", className)}>
      {Array.from({ length: VOLUME_MAX }, (_, i) => (
        <span
          key={i}
          onClick={
            onSet &&
            ((e) => {
              e.stopPropagation();
              onSet(i + 1 === volume ? i : i + 1);
            })
          }
          className={cn("w-[4px] rounded-[1px] bg-current transition-opacity duration-(--duration-exit)", i < volume ? "opacity-100" : "opacity-20", onSet && "cursor-pointer")}
          style={{ height: `${6 + i * 0.9}px` }}
        />
      ))}
    </span>
  );
}

/** Choices printed side by side, the current one in ink. */
export function Choice<T extends string>({ value, options }: { value: T; options: readonly { value: T; label: string }[] }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5 text-[13px]">
      {options.map((o) => (
        <span key={o.value} className={cn("transition-opacity duration-(--duration-exit)", o.value === value ? "font-medium opacity-100" : "opacity-40")}>
          {o.label}
        </span>
      ))}
    </span>
  );
}

/* --- Info sheet and HUD ------------------------------------------------------ */

/** Details of the study on screen, pulled up over its lower edge by OK. */
export function InfoSheet({ study, at, n, open, onClose }: { study: Study; at: number; n: number; open: boolean; onClose: () => void }) {
  return (
    <section
      aria-label={`About ${study.title}`}
      inert={!open}
      data-open={open || undefined}
      className="invisible absolute inset-x-2 bottom-2 z-10 translate-y-[calc(100%+40px)] rounded-[14px] bg-surface/88 p-4 shadow-lg backdrop-blur-xl transition-[translate,visibility] duration-(--duration-move) ease-drawer data-open:visible data-open:translate-y-0 data-open:transition-[translate] @[640px]/display:inset-x-auto @[640px]/display:left-1/2 @[640px]/display:w-[min(640px,calc(100%-32px))] @[640px]/display:-translate-x-1/2 @[640px]/display:p-5 @[640px]/display:bottom-4"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-meta tabular-nums text-muted">
          {String(at + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{study.title}</h2>
        <button type="button" onClick={onClose} className={cn(quietLink, "text-meta")}>
          Close
        </button>
      </div>
      <p className="mt-2 line-clamp-4 text-body text-muted @[640px]/display:line-clamp-none">{study.description}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-meta text-muted">
          {study.file} · {study.bytes < 1024 ? `${study.bytes} B` : `${(study.bytes / 1024).toFixed(1)} KB`}
        </p>
        <Link href={`/c/${study.slug}`} className="rounded-sm text-meta font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">
          View source <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

/** A readout over the screen while something is being set: where the dial has got to, or the volume. */
export function Hud({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/85 px-3 py-1.5 text-meta text-ink shadow-md backdrop-blur-md transition-[opacity,transform] ease-out",
        show ? "opacity-100 duration-(--duration-enter)" : "translate-y-1 opacity-0 duration-(--duration-move)",
      )}
    >
      {children}
    </div>
  );
}
