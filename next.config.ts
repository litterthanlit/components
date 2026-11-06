import type { NextConfig } from "next";
import { site } from "./src/site.config";

const nextConfig: NextConfig = {
  // litt.design/studies is served by this app (a separate Next.js "zone"):
  // litt.design's next.config.ts rewrites /studies and /studies/* here.
  basePath: site.basePath,
  // Nothing here imports sharp; Vercel resizes images outside the function and next/og draws
  // share images without it. Tracing it put ~47 MB (three platform builds) into every page.
  outputFileTracingExcludes: {
    "*": ["node_modules/sharp/**", "node_modules/@img/**"],
  },
  async redirects() {
    // The bare deployment URL has nothing at its root; send it to the app.
    return [{ source: "/", destination: site.basePath, basePath: false, permanent: false }];
  },
};

export default nextConfig;
