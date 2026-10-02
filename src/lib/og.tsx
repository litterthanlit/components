import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { colors } from "@/design-system/tokens";
import { site } from "@/site.config";

export const ogSize = { width: 1200, height: 630 };

const c = colors.light;

/** Geist and Instrument Serif, bundled as TTF because the OG renderer can't read woff2. */
export async function ogFonts() {
  const [regular, medium, serif] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Geist-400.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Geist-500.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/InstrumentSerif-400.ttf")),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "Instrument Serif", data: serif, weight: 400 as const, style: "normal" as const },
  ];
}

/** Mono-voice stand-in for OG: Geist, uppercase and tracked. */
export const ogLabel = { fontSize: 20, letterSpacing: 1.6, textTransform: "uppercase" as const, color: c.muted };

export async function ogLogo() {
  // Ink-only mark with a transparent ground (the OG renderer has no blend modes).
  const png = await readFile(join(process.cwd(), "src/assets/logo-mark.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}

const INSET = 44;

/**
 * Four crop marks around the sheet. The OG renderer clips negative offsets
 * and positions from the padded content box, so coordinates are worked out
 * in page space and shifted back by INSET.
 */
function CropMarks() {
  const len = 16;
  const gap = 8;
  const near = INSET - gap - len; // where an outward tick starts
  const edge = INSET; // the sheet's edge
  const far = ogSize.width - INSET; // right edge
  const low = ogSize.height - INSET; // bottom edge
  const h = (left: number, top: number) => ({ left, top, width: len, height: 2 });
  const v = (left: number, top: number) => ({ left, top, width: 2, height: len });
  const marks = [
    h(near, edge), v(edge, near),
    h(far + gap, edge), v(far - 2, near),
    h(near, low - 2), v(edge, low + gap),
    h(far + gap, low - 2), v(far - 2, low + gap),
  ];
  return (
    <>
      {marks.map((m, i) => (
        <div key={i} style={{ position: "absolute", background: c.proof, ...m, left: m.left - INSET, top: m.top - INSET }} />
      ))}
    </>
  );
}

/** Shared frame: a proof sheet held by crop marks, laid on paper. */
export function OgFrame({ logo, children, right }: { logo: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        padding: INSET,
        fontFamily: "Geist",
        color: c.ink,
        background: c.panel,
      }}
    >
      <CropMarks />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "36px 56px 44px",
          background: c.surface,
          borderRadius: 10,
          boxShadow: "0 0 0 1px rgba(20,20,19,0.1), 0 28px 56px -14px rgba(40,30,10,0.18)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={110} height={78} alt="" style={{ marginLeft: -8 }} />
          <div style={{ display: "flex", ...ogLabel }}>{right}</div>
        </div>
        {children}
        <div style={{ display: "flex", justifyContent: "space-between", ...ogLabel }}>
          <span>
            {site.name} · {site.author}
          </span>
          <span>{site.handle}</span>
        </div>
      </div>
    </div>
  );
}

export function OgDot({ size = 14 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: c.accent,
        boxShadow: "0 0 0 1px rgba(20,20,19,0.1)",
      }}
    />
  );
}
