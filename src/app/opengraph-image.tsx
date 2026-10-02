import { ImageResponse } from "next/og";
import { colors } from "@/design-system/tokens";
import { OgDot, OgFrame, ogFonts, ogLogo, ogSize } from "@/lib/og";
import { registry } from "@/registry";
import { site } from "@/site.config";

export const alt = `${site.name} by ${site.author}`;
export const size = ogSize;
export const contentType = "image/png";

export default async function Image() {
  const [fonts, logo] = await Promise.all([ogFonts(), ogLogo()]);
  return new ImageResponse(
    (
      <OgFrame
        logo={logo}
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <OgDot /> {registry.length} components
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
          <span style={{ fontSize: 64, fontWeight: 500, letterSpacing: -2.4, lineHeight: 1.08 }}>
            Interface components, designed and built.
          </span>
          <span style={{ fontSize: 30, color: colors.light.muted, letterSpacing: -0.4, lineHeight: 1.4 }}>
            Small studies in motion, feedback and touch.
          </span>
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
