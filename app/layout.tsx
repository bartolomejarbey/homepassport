import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "Home Passport — digitální pas vaší nemovitosti",
  description:
    "Veškerá data o domě i domácnosti na jednom místě. Dokumenty, majetek, záruky a revize — chytře čtené AI. Pas, který předáte novému majiteli.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
