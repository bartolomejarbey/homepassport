import { ImageResponse } from "next/og";

// Static Open Graph / Twitter share image for the whole site (1200×630). Brand
// navy field with honey accent and the Czech value proposition — gives links a
// recognisable, on-brand preview in social/messaging apps.
export const alt = "Home Passport — digitální pas vaší nemovitosti";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#11202E",
          color: "#FAF6EF",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1E3A5F",
              color: "#C99A4E",
              borderRadius: 14,
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            H
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            Home Passport
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            <div>Celý váš domov.</div>
            <div style={{ color: "#C99A4E" }}>Jeden digitální pas.</div>
          </div>
          <div
            style={{
              fontSize: 30,
              color: "#D7CDBC",
              maxWidth: 880,
              fontFamily: "Arial, sans-serif",
              lineHeight: 1.35,
            }}
          >
            Dokumenty, majetek, záruky a revize na jednom místě — chytře čtené AI.
          </div>
        </div>

        <div
          style={{
            fontSize: 22,
            color: "#9FB0BD",
            fontFamily: "Arial, sans-serif",
          }}
        >
          Data uložená v EU · šifrováno · bez sdílení třetím stranám
        </div>
      </div>
    ),
    { ...size },
  );
}
