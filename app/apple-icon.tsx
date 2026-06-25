import { ImageResponse } from "next/og";

// Apple touch icon — same brand monogram, sized for iOS home-screen (180px) with
// a touch of padding so it reads well inside the rounded mask.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 112,
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
