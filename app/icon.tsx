import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab icon — AIA red + “1” for 1CMA. */
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
          background: "#d31145",
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        1
      </div>
    ),
    { ...size },
  );
}
