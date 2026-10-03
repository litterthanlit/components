/**
 * Everything personal lives here. Edit once and it flows into the header,
 * footer, metadata, OG images and the watermark on capture frames.
 */
export const site = {
  name: "Components",
  author: "Nick Georgiev",
  role: "Designer & engineer",
  handle: "@litterthanli7",
  description:
    "Interface components I've designed and built. Small studies in motion, feedback and touch. Each one is a single file you can copy.",
  intro: "Small studies in motion, feedback and touch.",
  /** Served at litt.design/studies: litt.design rewrites that path here (multi-zones). */
  basePath: "/studies",
  /** Origin for metadata and OG images. Vercel builds default to the domain visitors see. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL ? "https://litt.design" : "http://localhost:3000"),
  links: {
    portfolio: "https://litt.design",
    x: "https://x.com/litterthanli7",
    github: "https://github.com/litterthanlit",
    linkedin: "https://www.linkedin.com/in/nick-conversionflow/",
    contra: "https://contra.com/nick_georgiev_0qdgnw7z",
  },
  email: "nick@litt.design",
} as const;
