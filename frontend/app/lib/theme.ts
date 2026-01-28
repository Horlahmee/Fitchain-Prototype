// Primary brand accent for the app
// (picked to match the neon-lime UI direction)
export const BASE_ACCENT = "#CCFF00" as const;

export const theme = {
  colors: {
    bg: "#070A10",
    card: "rgba(255,255,255,0.06)",
    card2: "rgba(0,0,0,0.22)",
    border: "rgba(255,255,255,0.10)",
    text: "#FFFFFF",
    text2: "rgba(255,255,255,0.78)",
    text3: "rgba(255,255,255,0.58)",
    accent: BASE_ACCENT,
    // Text/icon color to use on top of the neon accent background
    accentText: "#0B0B0B",
    accentGlow: "rgba(204, 255, 0, 0.35)",
    accentSoft: "rgba(204, 255, 0, 0.16)",
    danger: "#FF4D4D",
    success: "#28B478",
  },
  radius: {
    card: 18,
    pill: 999,
    btn: 14,
  },
  shadow: {
    card: "0 10px 30px rgba(0,0,0,0.35)",
  },
} as const;
