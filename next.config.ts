import type { NextConfig } from "next";

// Defense-in-depth against stored XSS: even if the wikitext sanitizer ever
// slips, injected scripts can't load from anywhere else and the page can't be
// framed. `unsafe-inline`/`unsafe-eval` allowances follow what Next.js itself
// needs (inline hydration scripts; eval only in dev for fast refresh).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Thumbnails/wiki images are hot-linked from arbitrary hosts by design.
  "img-src * data: blob:",
  "media-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone npm run build` produces a self-contained
  // .next/standalone server for Docker/Node hosts. Left off by default so
  // `npm start` keeps working for platforms that auto-detect Next.js.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
