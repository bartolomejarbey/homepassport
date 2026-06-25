import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // typedRoutes off during build-out: routes are created incrementally by feature slices.
  // Documents/photos are served via signed Supabase Storage URLs (TTL <= 1h).
  images: { remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }] },
};

export default nextConfig;
