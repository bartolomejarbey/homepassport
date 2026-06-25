import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// Only public, indexable routes belong in the sitemap. Gated app pages, the firm
// console and token-gated handover links are intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/registrace`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/prihlaseni`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
