"use client";

import React from "react";
import { theme } from "../lib/theme";

type TopEarner = {
  name: string;
  streakDays: number;
  fit: number;
  medal: "gold" | "silver" | "bronze";
};

type Achievement = {
  name: string;
  text: string;
  when: string;
  icon: string;
};

const topEarners: TopEarner[] = [
  { name: "EliteRunner", streakDays: 90, fit: 85000, medal: "gold" },
  { name: "FitnessPro", streakDays: 75, fit: 72000, medal: "silver" },
  { name: "FitQueen", streakDays: 45, fit: 25000, medal: "bronze" },
];

const achievements: Achievement[] = [
  { name: "RunnerKing", text: "Just hit a 30-day streak!", when: "30m ago", icon: "🔥" },
  { name: "FitQueen", text: "Earned the “Marathon Legend” badge!", when: "2h ago", icon: "🏅" },
  { name: "CycleChamp", text: "Reached 10,000 $FIT total earnings!", when: "5h ago", icon: "📈" },
];

function formatFit(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function medalIcon(m: TopEarner["medal"]) {
  if (m === "gold") return "👑";
  if (m === "silver") return "🥈";
  return "🥉";
}

export default function CommunityPage() {
  return (
    <div style={styles.page}>
      <div style={styles.title}>Community</div>

      <div style={styles.sectionRow}>
        <div style={styles.sectionIcon}>🏆</div>
        <div style={styles.sectionTitle}>Top Earners</div>
      </div>

      <div style={styles.cardSoft}>
        {topEarners.map((u, idx) => (
          <div
            key={u.name}
            style={{
              ...styles.row,
              borderTop: idx ? `1px solid ${theme.colors.border}` : "none",
              paddingTop: idx ? 14 : 0,
              marginTop: idx ? 14 : 0,
            }}
          >
            <div style={styles.medal}>{medalIcon(u.medal)}</div>
            <div style={styles.avatar} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900 }}>{u.name}</div>
              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                🔥 {u.streakDays} day streak
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: theme.colors.accent, fontWeight: 900 }}>{formatFit(u.fit)}</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>$FIT</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />

      <div style={styles.sectionTitleOnly}>Recent Achievements</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {achievements.map((a) => (
          <div key={a.name + a.when} style={styles.achievementCard}>
            <div style={styles.avatarLarge} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 900 }}>{a.name}</div>
                <div style={{ opacity: 0.8 }}>{a.icon}</div>
              </div>
              <div style={{ marginTop: 6, opacity: 0.75 }}>{a.text}</div>
              <div style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>{a.when}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 18,
    color: theme.colors.text,
    background:
      "radial-gradient(1200px 800px at 50% -20%, rgba(204,255,0,0.20) 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, #05070B 0%, #000000 75%)",
  },
  title: { fontSize: 22, fontWeight: 900, marginBottom: 14 },
  sectionRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionIcon: {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.colors.accent,
  },
  sectionTitle: { fontSize: 16, fontWeight: 900 },
  sectionTitleOnly: { fontSize: 16, fontWeight: 900, marginBottom: 10 },
  cardSoft: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  row: { display: "flex", alignItems: "center", gap: 12 },
  medal: {
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.9,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
  },
  achievementCard: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    gap: 12,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  avatarLarge: {
    width: 46,
    height: 46,
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: `2px solid ${theme.colors.accentSoft}`,
  },
};
