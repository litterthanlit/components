import type { Metadata, Viewport } from "next";
import { Black_Ops_One, Geist, Geist_Mono } from "next/font/google";
import { ThemeScript } from "@/components/gallery/theme-script";
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

// Stencil face for the Counter-Strike theme's title and HUD numerals.
const blackOps = Black_Ops_One({
  variable: "--font-black-ops",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.author}`,
    template: `%s — ${site.author}`,
  },
  description: site.description,
  openGraph: { type: "website", siteName: `${site.name} — ${site.author}` },
  twitter: { card: "summary_large_image", creator: site.handle },
};

export const viewport: Viewport = {
  // The Counter-Strike theme is the default whatever the OS prefers.
  themeColor: "#1e221a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="cs"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${blackOps.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
