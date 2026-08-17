import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Club crests are served from football-data's CDN; allow them through
  // next/image if it's ever used. Plain <img> tags don't need this, but it's
  // harmless and future-proofs the standings/match components.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "crests.football-data.org" },
    ],
  },
};

export default nextConfig;
