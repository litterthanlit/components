import { ImageResponse } from "next/og";
import { registry } from "@/registry";
import { site } from "@/site.config";

export const alt = `${site.author} / ${site.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0a0a0a",
          backgroundImage:
            "radial-gradient(60% 60% at 80% 0%, rgba(255,106,51,0.22), transparent 70%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 40px 40px, 40px 40px",
          color: "#f2f2f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#a3a3a0" }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: "#ff6a33" }} />
          {site.author} / {site.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, letterSpacing: -4, lineHeight: 1 }}>
          <span>Small details,</span>
          <span style={{ color: "#6b6b68" }}>carefully made.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#6b6b68" }}>
          <span>{registry.length} components</span>
          <span>{site.handle}</span>
        </div>
      </div>
    ),
    size,
  );
}
