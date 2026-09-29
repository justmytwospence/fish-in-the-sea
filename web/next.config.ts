import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route handlers and the page read data files from public/ at runtime.
  outputFileTracingIncludes: {
    "/": ["./public/data/**/*"],
    "/api/rank": ["./public/data/**/*"],
    "/api/og": ["./public/data/**/*"],
  },
};

export default nextConfig;
