import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab favicon: inset outline star + red / blue / yellow dots. */
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
          background: "#1B2450",
          borderRadius: 10,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32">
          <path
            d="M16 7 L18.17 13.01 L24.56 13.22 L19.52 17.14 L21.29 23.28 L16 19.7 L10.71 23.28 L12.48 17.14 L7.44 13.22 L13.83 13.01 Z"
            fill="none"
            stroke="#FFF4D6"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M16 9.2 L11.6 21.6 L20.4 21.6 Z"
            fill="none"
            stroke="#FFF4D6"
            strokeOpacity="0.28"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="7.2" r="3.1" fill="#FFB547" />
          <circle cx="10.9" cy="22.9" r="3.1" fill="#FF4D5E" />
          <circle cx="21.1" cy="22.9" r="3.1" fill="#6B7CFF" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
