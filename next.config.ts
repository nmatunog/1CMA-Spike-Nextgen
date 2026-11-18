import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: false, // Never print raw partner request URLs in the local dev server.
  serverExternalPackages: ["postgres"],
  async redirects() {
    return []; // The root GET receiver consumes sensitive handoffs before redirecting.
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      ...['/', '/spike-preview', '/signup', '/signup-done', '/signin', '/member/:path*', '/api/member/:path*'].map(source => ({ source, headers: [
        { key: 'Cache-Control', value: 'no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' },
      ] })),
    ];
  },
};

export default nextConfig;
