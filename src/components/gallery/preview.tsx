"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/design-system";
import type { StageBackground } from "@/registry";
import { previews } from "@/registry/previews";

type PreviewProps = {
  slug: string;
  background?: StageBackground;
  /** Only mount the demo once it scrolls near the viewport. */
  lazy?: boolean;
  className?: string;
  /** Applied with CSS zoom — enlarges demos for capture frames. */
  zoom?: number;
};

export function Preview({ slug, background = "grid", lazy = false, className, zoom }: PreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const Demo = previews[slug];

  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className={cn("relative isolate flex items-center justify-center overflow-hidden bg-panel", className)}>
      {/* Pattern fades out toward the edges so it sits behind the component. */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 -z-10 stage-${background} stage-vignette`} />
      <div className="flex w-full items-center justify-center p-6" style={zoom ? { zoom } : undefined}>
        {visible && Demo ? (
          <PreviewBoundary slug={slug}>
            <Demo />
          </PreviewBoundary>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Error state: if a demo throws (no WebGL, say), the plate shows a proof
 * mark and a retry instead of taking the whole page down.
 */
class PreviewBoundary extends Component<{ slug: string; children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return <div key={this.state.attempt} className="contents">{this.props.children}</div>;
    return (
      <div role="alert" className="flex flex-col items-center gap-3 text-center">
        <span className="font-mono text-label uppercase text-proof">Misprint · {this.props.slug}</span>
        <p className="font-display text-[1.75rem] leading-none text-ink">This plate didn&rsquo;t print.</p>
        <button
          type="button"
          onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
          className="text-body text-ink underline decoration-line-strong underline-offset-4 hover:decoration-proof"
        >
          Pull it again
        </button>
      </div>
    );
  }
}
