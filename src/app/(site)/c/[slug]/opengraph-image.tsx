import { ImageResponse } from "next/og";
import { getEntry, registry } from "@/registry";
import { site } from "@/site.config";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return registry.map((entry) => ({ slug: entry.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getEntry(slug);
  const number = String(registry.findIndex((e) => e.slug === slug) + 1).padStart(2, "0");

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
            "radial-gradient(50% 60% at 85% 10%, rgba(255,106,51,0.25), transparent 70%), radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 1.5px)",
          backgroundSize: "100% 100%, 22px 22px",
          color: "#f2f2f0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#a3a3a0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#ff6a33" }} />
            {site.author} / {site.name}
          </div>
          <span style={{ color: "#6b6b68" }}>No. {number}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ fontSize: 96, letterSpacing: -4, lineHeight: 1 }}>{entry?.title ?? site.name}</span>
          <span style={{ fontSize: 32, color: "#a3a3a0", maxWidth: 900 }}>{entry?.tagline ?? site.description}</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 22, color: "#a3a3a0" }}>
          {(entry?.tags ?? []).map((tag) => (
            <span key={tag} style={{ border: "1px solid #2f2f2d", borderRadius: 999, padding: "6px 18px" }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
