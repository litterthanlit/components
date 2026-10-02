/**
 * Everything personal lives here. Edit once and it flows into the header,
 * footer, metadata, OG images and the watermark on capture frames.
 */
export const site = {
  name: "Components",
  author: "Nikolay",
  handle: "@yourhandle",
  description:
    "A living gallery of interface components — small experiments in motion, feedback and interaction craft.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  links: {
    x: "https://x.com/yourhandle",
    github: "https://github.com/litterthanlit/components",
    portfolio: "https://example.com",
  },
} as const;
