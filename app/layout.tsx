import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap" });

// Absolute URLs for OG/canonical. Honour the deploy URL when present, fall back
// to localhost in dev so social-preview tags still resolve to a valid origin.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Home Passport — digitální pas vaší nemovitosti",
    template: "%s — Home Passport",
  },
  description:
    "Veškerá data o domě i domácnosti na jednom místě. Dokumenty, majetek, záruky a revize — chytře čtené AI. Pas, který předáte novému majiteli.",
  applicationName: "Home Passport",
  keywords: [
    "digitální pas nemovitosti",
    "dokumentace domu",
    "revize",
    "záruky",
    "PENB",
    "předání nemovitosti",
    "Home OS",
    "Digital Building Logbook",
  ],
  authors: [{ name: "Home Passport" }],
  // Czech UI: stop browsers auto-linking numbers/addresses as phone/e-mail.
  formatDetection: { telephone: false, address: false, email: false },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    siteName: "Home Passport",
    url: "/",
    title: "Home Passport — digitální pas vaší nemovitosti",
    description:
      "Dokumenty, majetek, záruky a revize na jednom místě — chytře čtené AI. Pas, který při prodeji předáte novému majiteli jediným odkazem.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Home Passport — digitální pas vaší nemovitosti",
    description:
      "Celý váš domov v jednom digitálním pasu. Dokumenty, záruky a revize chytře čtené AI.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#1E3A5F",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
