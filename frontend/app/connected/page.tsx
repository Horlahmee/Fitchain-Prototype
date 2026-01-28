"use client";

import React from "react";
import Link from "next/link";
import { theme } from "../lib/theme";

export default function ConnectedPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 18,
        color: theme.colors.text,
        background:
          "radial-gradient(1200px 800px at 50% -20%, rgba(204,255,0,0.20) 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, #05070B 0%, #000000 75%)",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900 }}>Connected ✅</div>
      <div style={{ marginTop: 10, opacity: 0.75, lineHeight: 1.5 }}>
        Your provider connection was successful.
      </div>

      <Link
        href="/settings"
        style={{
          marginTop: 16,
          display: "inline-flex",
          padding: "14px 14px",
          borderRadius: 16,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.accent,
          color: theme.colors.accentText,
          fontWeight: 900,
          textDecoration: "none",
          boxShadow: `0 12px 28px ${theme.colors.accentGlow}`,
        }}
      >
        Back to Settings
      </Link>
    </div>
  );
}
