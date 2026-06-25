import type { MetadataRoute } from "next";

// Web App Manifest — installable PWA shell for Home Passport. Colours follow the
// design system: brand navy theme on warm paper. Icons resolve to the
// code-generated app/icon.tsx + app/apple-icon.tsx routes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Passport — digitální pas vaší nemovitosti",
    short_name: "Home Passport",
    description:
      "Celý váš domov v jednom digitálním pasu. Dokumenty, majetek, záruky a revize chytře čtené umělou inteligencí.",
    start_url: "/",
    display: "standalone",
    lang: "cs",
    dir: "ltr",
    background_color: "#FAF6EF",
    theme_color: "#1E3A5F",
    categories: ["productivity", "utilities", "lifestyle"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
