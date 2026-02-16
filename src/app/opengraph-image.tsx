import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 70% 20%, #1d4ed8 0%, #111827 45%, #020617 100%)",
          color: "#f8fafc",
          padding: "64px",
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.9 }}>vdex.cloud</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>
            vdesk
          </div>
          <div style={{ fontSize: 38, opacity: 0.9 }}>
            Cloud Workspace Desktop
          </div>
        </div>
      </div>
    ),
    size,
  );
}
