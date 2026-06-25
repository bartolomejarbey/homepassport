import { ImageResponse } from "next/og";

// Code-generated favicon/app icon — a brand "key" monogram in honey on navy,
// matching the KeyRound mark used across the public surface. Avoids shipping a
// binary asset while keeping the tab/bookmark icon on-brand.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E3A5F",
          color: "#C99A4E",
          fontSize: 320,
          fontWeight: 700,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        H
      </div>
    ),
    { ...size },
  );
}
