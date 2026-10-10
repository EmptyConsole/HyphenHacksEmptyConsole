import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab favicon: star + red / blue / yellow dots (vector → PNG). */
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
          borderRadius: 8,
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32">
          {/* Bold filled star */}
          <path
            d="M16 3.2 L19.15 12.1 L28.6 12.4 L21.15 18.15 L23.75 27.2 L16 21.9 L8.25 27.2 L10.85 18.15 L3.4 12.4 L12.85 12.1 Z"
            fill="#FFF4D6"
          />
          {/* Constellation links */}
          <path
            d="M16 7.5 L10.2 23.2 L21.8 23.2 Z"
            fill="none"
            stroke="#1B2450"
            strokeWidth="1.4"
            strokeLinejoin="round"
            opacity="0.35"
          />
          {/* Yellow */}
          <circle cx="16" cy="6.4" r="4.1" fill="#FFB547" />
          {/* Red */}
          <circle cx="9.5" cy="24.6" r="4.1" fill="#FF4D5E" />
          {/* Blue */}
          <circle cx="22.5" cy="24.6" r="4.1" fill="#6B7CFF" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
