import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { colors } from "@/design-system/tokens";
import { site } from "@/site.config";

export const ogSize = { width: 1200, height: 630 };

const c = colors.light;

/** Geist, bundled as TTF because the OG renderer can't read woff2. */
export async function ogFonts() {
  const [regular, medium] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Geist-400.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Geist-500.ttf")),
  ]);
  return [
    { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

export async function ogLogo() {
  // Ink-only mark with a transparent ground (the OG renderer has no blend modes).
  const png = await readFile(join(process.cwd(), "src/assets/logo-mark.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Shared frame: the litt.design canvas, colour washes and a byline row. */
export function OgFrame({ logo, children, right }: { logo: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px 64px",
        fontFamily: "Geist",
        color: c.ink,
        background: c.canvas,
        backgroundImage:
          "radial-gradient(circle at 0% 0%, rgba(255,214,214,0.6), rgba(255,214,214,0) 45%), radial-gradient(circle at 100% 45%, rgba(214,228,255,0.7), rgba(214,228,255,0) 50%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={136} height={96} alt="" style={{ marginLeft: -8 }} />
        <div style={{ display: "flex", fontSize: 22, color: c.muted }}>{right}</div>
      </div>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: c.muted }}>
        <span>
          {site.name} · {site.author}
        </span>
        <span>{site.handle}</span>
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
        boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
      }}
    />
  );
}
