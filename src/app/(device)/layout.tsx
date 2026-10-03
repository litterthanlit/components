import type { Viewport } from "next";

// The device runs edge to edge on phones and pads itself with the safe areas.
export const viewport: Viewport = { viewportFit: "cover" };

/**
 * The home page is the device: no header or footer to compete with it. The
 * device carries the logo, the links and the theme switch itself.
 */
export default function DeviceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="atmosphere pointer-events-none fixed inset-0 -z-10" />
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
