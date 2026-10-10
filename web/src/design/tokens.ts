/**
 * JS mirror of src/styles/tokens.css for WebGL/canvas code (globe.gl, MapLibre)
 * that can't read CSS variables. Keep values in sync with the CSS file.
 */
export const tokens = {
  color: {
    bg: "#05070d",
    surface: "#0f1320",
    border: "rgba(255, 255, 255, 0.08)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    text: "#f4f5f9",
    textSecondary: "#a4aabd",
    accent: "#ffb547",
    constellation: "#7b8cff",
  },
  /** Sequential data ramp, low -> high. */
  data: ["#1e2747", "#3b4a9a", "#7b6fd0", "#e38c5b", "#ffc56b"],
} as const;
