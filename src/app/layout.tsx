import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Saira } from "next/font/google";
import { ThemeScript } from "@/components/gallery/theme-script";
import { SoundRuntime } from "@/components/sound/sound-runtime";
import { site } from "@/site.config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The race line's figures (the car studies): variable weight and width, upright and italic.
// Not preloaded, so pages without a car study never fetch it.
const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["wdth"],
  preload: false,
});

export const metadata: Metadata = {
  // Metadata paths are relative to the app, so the base includes basePath.
  metadataBase: new URL(`${site.url}${site.basePath}/`),
  title: {
    default: `${site.name} — ${site.author}`,
    template: `%s — ${site.author}`,
  },
  description: site.description,
  openGraph: { type: "website", siteName: `${site.name} — ${site.author}` },
  twitter: { card: "summary_large_image", creator: site.handle },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${saira.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        {/* Every page, the device included: unlocks audio and sounds the physical keys. */}
        <SoundRuntime />
      </body>
    </html>
  );
}
