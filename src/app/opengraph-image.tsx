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
            <OgDot /> {registry.length} plates
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 880 }}>
          <span style={{ fontFamily: "Instrument Serif", fontSize: 92, letterSpacing: -2, lineHeight: 0.98 }}>
            Small studies in motion, feedback &amp; touch.
          </span>
          <span style={{ fontSize: 28, color: colors.light.muted, letterSpacing: -0.4, lineHeight: 1.4 }}>
            Interface components, pulled like proofs.
          </span>
        </div>
      </OgFrame>
    ),
    { ...size, fonts },
  );
}
