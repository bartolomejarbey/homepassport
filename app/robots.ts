import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// Allow crawling of the public marketing + auth entry points; keep gated app
// areas, the firm console and token-bearing handover links out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/prehled",
        "/dokumenty",
        "/majetek",
        "/pripominky",
        "/hledat",
        "/nemovitost/",
        "/pro",
        "/prevzit/",
        "/auth/",
        "/nove-heslo",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
