"use client";

import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";
import { LogActivityButton } from "../components/LogActivityButton";
import { SimpleToastsView, useSimpleToasts } from "../components/SimpleToasts";
import { formatTimeAgo } from "../lib/providerStatus";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";
const FIT_SYMBOL_UI = "$FIT";
const FIT_USD_RATE = Number(process.env.NEXT_PUBLIC_FIT_USD_RATE || "0");

function formatFit(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n >= 100 ? n.toFixed(2) : n.toFixed(3);
}

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fitToUsd(fit: number) {
  if (!Number.isFinite(fit) || !Number.isFinite(FIT_USD_RATE)) return 0;
  return fit * FIT_USD_RATE;
}

function badgeForIntensity(score: number) {
  if (score >= 70) return { label: "HIGH", style: styles.badgeHigh };
  if (score >= 40) return { label: "MID", style: styles.badgeMed };
  return { label: "LOW", style: styles.badgeLow };
}

type ClaimPreview = {
  ok: boolean;
  dayKey: string;
  claimableFit: number;
  activities: Array<{
    id: string;
    provider: string;
    type: "RUN" | "WALK";
    startTime: string;
    durationSec: number;
    distanceM: number;
    intensityScore: number;
    fitEarned: number;
  }>;
};

type ActivityRow = {
  type: string;
  intensity: "HIGH" | "MID" | "LOW";
  duration: string;
  distance: string;
  when: string;
  earned: number;
};

type ActivityListResponse = {
  ok: boolean;
  range: "week" | "month";
  activities: Array<{
    id: string;
    provider: string;
    type: "RUN" | "WALK";
    startTime: string;
    durationSec: number;
    distanceM: number;
    intensityScore: number;
    fitEarned: number;
  }>;
};

export default function ActivityPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, source } = useActiveWallet();
  const isConnected = Boolean(address);
  const { toasts, pushToast } = useSimpleToasts();
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [historyMode, setHistoryMode] = useState<"week" | "month">("week");
  const [history, setHistory] = useState<ActivityListResponse | null>(null);

  // Pull preview automatically once connected (so Activity isn't empty)
  useEffect(() => {
    if (!address) return;
    fetch(`${API_BASE_URL}/claim/preview?wallet=${address}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setPreview(j);
      })
      .catch(() => {});
  }, [address]);

  // Pull history from backend (real activities, not placeholders)
  useEffect(() => {
    if (!address) {
      setHistory(null);
      return;
    }

    fetch(`${API_BASE_URL}/activity/list?wallet=${address}&range=${historyMode}`)
      .then((r) => r.json())
      .then((j: ActivityListResponse) => {
        if (j?.ok) setHistory(j);
      })
      .catch(() => {});
  }, [address, historyMode]);

  const todayRows: ActivityRow[] = useMemo(() => {
    const acts = preview?.activities ?? [];
    return acts.map((a) => {
      const b = badgeForIntensity(a.intensityScore);
      return {
        type: a.type,
        intensity: b.label as any,
        duration: `${Math.round(a.durationSec / 60)}m`,
        distance: `${(a.distanceM / 1000).toFixed(1)} km`,
        when: mounted ? new Date(a.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
        earned: a.fitEarned,
      };
    });
  }, [mounted, preview]);

  const historyRows: ActivityRow[] = useMemo(() => {
    const acts = history?.activities ?? [];

    return acts.map((a) => {
      const b = badgeForIntensity(a.intensityScore);
      return {
        type: a.type,
        intensity: b.label as any,
        duration: `${Math.round(a.durationSec / 60)}m`,
        distance: `${(a.distanceM / 1000).toFixed(1)} km`,
        when: formatTimeAgo(a.startTime),
        earned: a.fitEarned,
      };
    });
  }, [history]);

  return (
    <div style={styles.page}>
      <SimpleToastsView toasts={toasts} />

      <div style={styles.header}>
        <div style={styles.title}>Activity</div>
        <LogActivityButton
          apiBaseUrl={API_BASE_URL}
          walletAddress={address}
          disabled={!isConnected}
          pushToast={pushToast}
          onPreviewUpdated={(p) => setPreview(p)}
          variant="compact"
        />
      </div>

      <div style={styles.infoPill}>
        <div style={styles.infoIcon}>🗓</div>
        <div style={{ opacity: 0.85, fontSize: 13 }}>
          Activities sync automatically from your connected providers
          {address ? ` (wallet: ${address.slice(0, 6)}…${address.slice(-4)})` : ""}
          {source ? ` · signed in: ${source}` : ""}
        </div>
      </div>

      <div style={styles.section}>Today</div>
      {todayRows.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {todayRows.map((r, idx) => (
            <ActivityCard key={idx} row={r} />
          ))}
        </div>
      ) : (
        <div style={{ opacity: 0.75 }}>No activities yet. Tap Log.</div>
      )}

      <div style={styles.historyHeader}>
        <div style={styles.section}>History</div>
        <div style={styles.segmentWrap}>
          <button
            onClick={() => setHistoryMode("week")}
            style={historyMode === "week" ? styles.segmentActive : styles.segment}
          >
            Week
          </button>
          <button
            onClick={() => setHistoryMode("month")}
            style={historyMode === "month" ? styles.segmentActive : styles.segment}
          >
            Month
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {historyRows.length ? (
          historyRows.map((r, idx) => <ActivityCard key={idx} row={r} />)
        ) : (
          <div style={{ opacity: 0.75 }}>No activity history yet.</div>
        )}
      </div>
    </div>
  );
}

function ActivityCard({ row }: { row: ActivityRow }) {
  const intensityStyle =
    row.intensity === "HIGH"
      ? styles.badgeHigh
      : row.intensity === "MID"
      ? styles.badgeMed
      : styles.badgeLow;

  const icon =
    row.type === "RUN"
      ? "🔥"
      : row.type === "WALK"
      ? "👣"
      : row.type === "CYCLE"
      ? "🚲"
      : "🏋";

  return (
    <div style={styles.card}>
      <div style={styles.cardIcon}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>{row.type}</div>
          <div style={intensityStyle}>{row.intensity}</div>
        </div>
        <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>
          {row.duration} · {row.distance} · {row.when}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: theme.colors.accent, fontWeight: 900 }}>
          +{formatFit(row.earned)} {FIT_SYMBOL_UI}
        </div>
        <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
          ≈ {formatUsd(fitToUsd(row.earned))}
        </div>
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
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
  },
  infoPill: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    marginBottom: 14,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.colors.accentSoft,
  },
  section: {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 10,
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 10,
  },
  segmentWrap: {
    display: "flex",
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 999,
    padding: 4,
    gap: 6,
  },
  segment: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid transparent",
    background: "transparent",
    color: "rgba(255,255,255,0.75)",
    fontWeight: 900,
    cursor: "pointer",
  },
  segmentActive: {
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.accentSoft}`,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: `0 10px 20px ${theme.colors.accentGlow}`,
  },
  card: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(0,0,0,0.20)",
    fontSize: 18,
  },
  badgeHigh: {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255, 60, 60, 0.20)",
    border: "1px solid rgba(255, 60, 60, 0.35)",
    color: "#FF8080",
  },
  badgeMed: {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(255, 173, 51, 0.18)",
    border: "1px solid rgba(255, 173, 51, 0.35)",
    color: "#FFB84D",
  },
  badgeLow: {
    fontSize: 11,
    fontWeight: 900,
    padding: "4px 8px",
    borderRadius: 999,
    background: theme.colors.accentSoft,
    border: `1px solid ${theme.colors.accentSoft}`,
    color: theme.colors.accent,
  },
};
