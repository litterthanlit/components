import { ImageResponse } from "next/og";
import { colors } from "@/design-system/tokens";
import { OgDot, OgFrame, ogFonts, ogLogo, ogSize } from "@/lib/og";
import { formatDate, getEntry, registry } from "@/registry";
import { site } from "@/site.config";

export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return registry.map((entry) => ({ slug: entry.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getEntry(slug);
  const number = String(registry.findIndex((e) => e.slug === slug) + 1).padStart(2, "0");
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);

  return new ImageResponse(
    (
      <OgFrame
        logo={logo}
        right={
          <span>
            No. {number} · {entry ? formatDate(entry.date) : ""}
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 24, fontFamily: "Instrument Serif", fontSize: 112, letterSpacing: -2.5, lineHeight: 1 }}>
            {entry?.status && <OgDot size={18} />}
            {entry?.title ?? site.name}
          </span>
          <span style={{ fontSize: 30, color: colors.light.muted, letterSpacing: -0.4, lineHeight: 1.4 }}>
            {entry?.tagline ?? site.description}
          </span>
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
