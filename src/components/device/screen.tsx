"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Preview } from "@/components/gallery/preview";
import { cn, createSpring, springs, type Spring } from "@/design-system";
import type { StageBackground } from "@/registry";
import { site } from "@/site.config";

export type Study = { slug: string; title: string; tagline: string; background?: StageBackground };

export type Row = { kind: "study"; study: Study; at: number } | { kind: "about" } | { kind: "system" } | { kind: "portfolio" };

export const rowLabel = (row: Row) =>
  row.kind === "study" ? row.study.title : row.kind === "about" ? "About" : row.kind === "system" ? "System" : "litt.design";

/* --- Sizing ------------------------------------------------------------- */

/** The content box of an element, kept current with a ResizeObserver. */
export function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setSize((s) => (s && Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const floor2 = (z: number) => Math.floor(z * 100) / 100;

/**
 * How much to zoom a running prototype. Demos are made for stages from a
 * phone's (about 330 × 380) up to a desktop's, so a smaller screen shrinks
 * them uniformly instead of clipping, and a big one grows them a little.
 */
export function appZoom({ w, h }: { w: number; h: number }) {
  return floor2(w >= 680 && h >= 480 ? Math.min(1.3, w / 680, h / 480) : Math.min(1, w / 330, h / 380));
}

/** The preview beside the menu is a live thumbnail: a desktop-sized stage, scaled down to the pane. */
export function previewZoom({ w, h }: { w: number; h: number }) {
  return floor2(Math.min(1, w / 560, h / 400));
}

/* --- Status bar --------------------------------------------------------- */

function Battery() {
  return (
    <svg aria-hidden viewBox="0 0 26 12" className="h-[11px] w-auto">
      <rect x="0.75" y="0.75" width="21.5" height="10.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" />
      <rect x="2.6" y="2.6" width="15" height="6.8" rx="1.6" fill="currentColor" />
      <path d="M23.8 4.2c.9.2 1.45.9 1.45 1.8s-.55 1.6-1.45 1.8z" fill="currentColor" fillOpacity="0.45" />
    </svg>
  );
}

/**
 * Title centred, play and hold on the left, battery on the right, as on the
 * 2009 screen. Inside a prototype a hairline under it fills with the position.
 */
export function StatusBar({ title, shuffle, held, progress }: { title: string; shuffle: boolean; held: boolean; progress: number | null }) {
  return (
    <div className="relative z-10 grid h-[30px] shrink-0 grid-cols-[1fr_auto_1fr] items-center bg-canvas px-3 text-ink shadow-[0_1px_0_var(--line)] @[640px]/display:h-[36px] @[640px]/display:px-4">
      <div className="flex items-center gap-1.5">
        {shuffle && (
          <svg aria-hidden viewBox="0 0 12 12" className="size-[10px] animate-enter fill-accent-strong">
            <path d="M2.5 1.5 10.5 6l-8 4.5z" />
          </svg>
        )}
        {held && (
          <svg aria-hidden viewBox="0 0 12 14" className="h-[12px] w-auto animate-enter text-(--device-hold)">
            <rect x="1" y="6" width="10" height="7.5" rx="1.6" fill="currentColor" />
            <path d="M3.4 6V4.3a2.6 2.6 0 0 1 5.2 0V6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <p key={title} className="max-w-[60cqw] animate-enter truncate text-[13px] font-medium tracking-[-0.01em] @[640px]/display:text-[14px]">
        {title}
      </p>
      <div className="flex justify-end">
        <Battery />
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-accent transition-[transform,opacity] duration-(--duration-move) ease-out"
        style={{ transform: `scaleX(${progress ?? 0})`, opacity: progress === null ? 0 : 1 }}
      />
    </div>
  );
}

/* --- Menu --------------------------------------------------------------- */

function Chevron({ external }: { external?: boolean }) {
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

function RowContent({ row }: { row: Row }) {
  return (
    <>
      <span className="w-[2ch] shrink-0 text-[11px] tabular-nums opacity-45">{row.kind === "study" ? String(row.at + 1).padStart(2, "0") : ""}</span>
      <span className="min-w-0 flex-1 truncate">{rowLabel(row)}</span>
      {row.kind !== "about" && <Chevron external={row.kind === "portfolio"} />}
    </>
  );
}

const rowClass = "flex h-[38px] items-center gap-3 px-4 @[640px]/display:h-[42px] @[640px]/display:px-5 @[640px]/display:text-[15px]";

/**
 * The list. The highlight is a second copy of the rows in accent and white,
 * clipped to the selection by a spring, so the bar glides between rows and
 * the text inside it changes colour exactly where the bar is.
 */
export function MenuList({
  rows,
  index,
  idPrefix,
  reduced,
  listRef,
  onPick,
  className,
}: {
  rows: Row[];
  index: number;
  idPrefix: string;
  reduced: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onPick: (index: number) => void;
  className?: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const bar = useRef<Spring | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const el = overlayRef.current!;
    const s = createSpring(0, springs.snappy, (y) => el.style.setProperty("--y", `${y}px`));
    bar.current = s;
    return () => s.stop();
  }, []);

  /** Where the scroll position puts the thumb of the classic scrollbar. */
  function syncThumb() {
    const list = listRef.current;
    const thumb = thumbRef.current;
    if (!list || !thumb) return;
    const overflow = list.scrollHeight - list.clientHeight;
    thumb.style.opacity = overflow > 1 ? "1" : "0";
    const size = list.clientHeight / list.scrollHeight;
    thumb.style.height = `${size * 100}%`;
    thumb.style.transform = `translateY(${overflow > 0 ? (list.scrollTop / overflow) * (1 / size - 1) * 100 : 0}%)`;
  }

  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-row="${index}"]`);
    if (!list || !row) return;
    const animate = placed.current && !reduced;
    overlayRef.current?.style.setProperty("--h", `${row.offsetHeight}px`);
    if (animate) bar.current?.set(row.offsetTop);
    else bar.current?.jump(row.offsetTop);
    // Keep a row of context above and below the highlight, as the original did.
    const top = row.offsetTop - row.offsetHeight;
    const bottom = row.offsetTop + row.offsetHeight * 2;
    let next = list.scrollTop;
    if (top < list.scrollTop) next = Math.max(0, top);
    else if (bottom > list.scrollTop + list.clientHeight) next = bottom - list.clientHeight;
    if (next !== list.scrollTop) list.scrollTo({ top: next, behavior: animate ? "smooth" : "auto" });
    placed.current = true;
    syncThumb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduced, rows.length]);

  // Row heights change with the screen's size; put the bar back without a glide.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      const row = list.querySelector<HTMLElement>("[aria-selected=true]");
      if (!row) return;
      overlayRef.current?.style.setProperty("--h", `${row.offsetHeight}px`);
      bar.current?.jump(row.offsetTop);
      syncThumb();
    });
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRef]);

  const divider = (i: number) => i > 0 && rows[i].kind !== "study" && rows[i - 1].kind === "study";

  return (
    <div className={cn("relative min-h-0", className)}>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label="Studies"
        aria-activedescendant={`${idPrefix}-${index}`}
        onScroll={syncThumb}
        className="absolute inset-0 overflow-y-auto overscroll-contain py-1.5 text-[14px] text-ink outline-offset-[-2px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative">
          {rows.map((row, i) => (
            <div key={i}>
              {divider(i) && <div aria-hidden className="mx-4 my-1.5 h-px bg-line" />}
              <div
                id={`${idPrefix}-${i}`}
                role="option"
                aria-selected={i === index}
                data-row={i}
                onClick={() => onPick(i)}
                className={cn(rowClass, "cursor-default")}
              >
                <RowContent row={row} />
              </div>
            </div>
          ))}
          {/* The highlight: the same rows in white on accent, clipped to the selected one. */}
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] [clip-path:inset(var(--y,0px)_6px_calc(100%-var(--y,0px)-var(--h,0px))_6px_round_6px)]"
          >
            {rows.map((row, i) => (
              <div key={i}>
                {divider(i) && <div className="mx-4 my-1.5 h-px" />}
                <div className={rowClass}>
                  <RowContent row={row} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* The classic scrollbar, only while the list overflows. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-2 right-[3px] w-[3px] overflow-hidden rounded-full">
        <div ref={thumbRef} className="w-full rounded-full bg-ink/25 opacity-0 transition-opacity duration-(--duration-exit)" />
      </div>
    </div>
  );
}

/* --- Panes beside the menu ------------------------------------------------ */

/** A live, inert thumbnail of the highlighted prototype; a click opens it. */
export function StudyPane({ study, mounted, caption, onOpen }: { study: Study | null; mounted: Study | null; caption: boolean; onOpen: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  return (
    <div className="flex size-full min-h-0 flex-col">
      <div ref={box} onClick={onOpen} data-device-preview className="group/pane relative min-h-0 flex-1 cursor-pointer">
        {mounted && size && (
          <div inert className="pointer-events-none absolute inset-0">
            <Preview key={mounted.slug} slug={mounted.slug} background={mounted.background} zoom={previewZoom(size)} className="h-full" />
          </div>
        )}
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] font-medium text-ink opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-(--duration-exit) group-hover/pane:opacity-100 group-hover/pane:duration-(--duration-enter)">
          Open
        </span>
      </div>
      {caption && study && (
        <div className="hidden shrink-0 items-center gap-3 px-4 py-3 shadow-[0_-1px_0_var(--line)] @[520px]/display:flex @[640px]/display:px-5">
          <div className="min-w-0 flex-1">
            <p key={study.slug} className="animate-enter truncate font-medium text-ink">
              {study.title}
            </p>
            <p className="truncate text-meta text-muted">{study.tagline}</p>
          </div>
          <Link href={`/c/${study.slug}`} className="shrink-0 rounded-sm text-meta text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)">
            Open page <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  );
}

const quietLink = "rounded-sm text-muted transition-colors duration-(--duration-exit) hover:text-ink hover:duration-(--duration-enter)";

function InfoPane({ children }: { children: ReactNode }) {
  return <div className="flex size-full min-h-0 animate-enter flex-col justify-center gap-3 overflow-hidden px-5 py-4 @[640px]/display:px-8">{children}</div>;
}

const socials = [
  { href: site.links.x, label: "X" },
  { href: site.links.linkedin, label: "LinkedIn" },
  { href: site.links.contra, label: "Contra" },
  { href: site.links.github, label: "GitHub" },
];

export function AboutPane() {
  return (
    <InfoPane>
      {/* The Litt mark in ink: the logo's alpha as a mask, so it takes the theme. */}
      <span
        aria-hidden
        className="block aspect-[24/17] h-9 bg-ink [mask-position:left_center] [mask-repeat:no-repeat] [mask-size:contain] @[640px]/display:h-12"
        style={{ maskImage: `url(${site.basePath}/logo-mark.png)` }}
      />
      <p className="max-w-[24ch] text-[15px] font-medium leading-snug tracking-[-0.015em] text-ink @[640px]/display:text-title">{site.intro}</p>
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
    </InfoPane>
  );
}

export function SystemPane() {
  return (
    <InfoPane>
      <p className="text-[15px] font-medium text-ink @[640px]/display:text-title">Design system</p>
      <p className="max-w-[36ch] text-meta text-muted @[640px]/display:text-body">
        Colour, type, shape, motion and the primitives every study is built from, rendered from the real tokens.
      </p>
      <Link href="/system" className={cn(quietLink, "self-start text-meta")}>
        Open System <span aria-hidden>→</span>
      </Link>
    </InfoPane>
  );
}

export function PortfolioPane() {
  return (
    <InfoPane>
      <p className="text-[15px] font-medium text-ink @[640px]/display:text-title">litt.design</p>
      <p className="max-w-[36ch] text-meta text-muted @[640px]/display:text-body">
        Selected work, writing and the rest of {site.author.split(" ")[0]}&rsquo;s portfolio.
      </p>
      {/* Same domain, different app: a plain <a> for a full page load. */}
      <a href={site.links.portfolio} className={cn(quietLink, "self-start text-meta")}>
        Visit litt.design <span aria-hidden>↗</span>
      </a>
    </InfoPane>
  );
}

/** A running prototype, filling the screen at a zoom that fits it. */
export function AppStage({ study }: { study: Study }) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  return (
    <div ref={box} data-app className="absolute inset-0">
      {size && <Preview key={study.slug} slug={study.slug} background={study.background} zoom={appZoom(size)} className="h-full" />}
    </div>
  );
}
