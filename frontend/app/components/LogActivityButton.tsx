"use client";

import React, { useCallback, useState } from "react";
import { theme } from "../lib/theme";

type ToastKind = "success" | "error" | "info";

export function LogActivityButton(props: {
  apiBaseUrl: string;
  walletAddress?: string;
  disabled?: boolean;
  variant?: "full" | "compact";
  pushToast?: (kind: ToastKind, message: string) => void;
  onPreviewUpdated?: (preview: any) => void;
  onSourceUsed?: (source: "STRAVA" | "MOCK") => void;
}) {
  const {
    apiBaseUrl,
    walletAddress,
    disabled,
    variant = "full",
    pushToast,
    onPreviewUpdated,
    onSourceUsed,
  } = props;

  const [loading, setLoading] = useState(false);

  const logActivity = useCallback(async () => {
    if (!walletAddress) {
      pushToast?.("error", "Connect a wallet first.");
      return;
    }

    setLoading(true);
    try {
      // Prefer real provider sync when connected; fall back to mock for demo continuity.
      let used: "STRAVA" | "MOCK" = "MOCK";

      try {
        const connRes = await fetch(
          `${apiBaseUrl}/connections?wallet=${walletAddress}&provider=STRAVA`
        );
        const conn = (await connRes.json()) as any;
        if (conn?.connected) used = "STRAVA";
      } catch {
        // ignore connection check failures; we'll fall back to mock
      }

      const endpoint =
        used === "STRAVA"
          ? `${apiBaseUrl}/strava/sync`
          : `${apiBaseUrl}/dev/mock-activity`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore
      }

      if (!res.ok || !data?.ok) {
        const msg = data?.error || data?.details || "Sync failed";

        // If Strava isn't connected, fall back to mock automatically
        if (used === "STRAVA" && /not connected/i.test(String(msg))) {
          const mr = await fetch(`${apiBaseUrl}/dev/mock-activity`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: walletAddress }),
          });
          const mj = await mr.json();
          if (!mr.ok || !mj?.ok) throw new Error(mj?.error || mj?.details || msg);
          used = "MOCK";
          data = mj;
        } else {
          throw new Error(msg);
        }
      }

      onSourceUsed?.(used);

      if (used === "STRAVA") {
        pushToast?.("success", `Synced Strava ✅ (saved ${data.saved ?? 0})`);
      } else {
        const sim = data?.simulated;
        if (sim?.type) {
          pushToast?.(
            "success",
            `Logged ${sim.type} ✅ (${Math.round(sim.durationSec / 60)} min, ${(sim.distanceM / 1000).toFixed(2)} km)`
          );
        } else {
          pushToast?.("success", "Activity logged ✅");
        }
      }

      // Refresh claim preview
      try {
        const pr = await fetch(`${apiBaseUrl}/claim/preview?wallet=${walletAddress}`);
        const pj = await pr.json();
        if (pj?.ok) onPreviewUpdated?.(pj);
      } catch {
        // non-fatal
      }

      // Nudge other pages (Wallet, etc.) to refresh immediately
      window.dispatchEvent(new CustomEvent("fitchain:walletUpdated"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Log activity failed";
      pushToast?.("error", msg);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, onPreviewUpdated, onSourceUsed, pushToast, walletAddress]);

  const style =
    variant === "compact"
      ? {
          padding: "10px 14px",
          borderRadius: 999,
          border: `1px solid ${theme.colors.border}`,
          background: "rgba(255,255,255,0.06)",
          color: "white",
          cursor: disabled || loading ? "not-allowed" : "pointer",
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }
      : {
          padding: "12px 14px",
          borderRadius: theme.radius.btn,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.accent,
          boxShadow: `0 10px 30px ${theme.colors.accentGlow}`,
          color: theme.colors.accentText,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          fontWeight: 900,
          width: "100%" as const,
        };

  return (
    <button
      style={style as any}
      onClick={logActivity}
      disabled={disabled || loading}
      aria-busy={loading}
    >
      {variant === "compact" ? (
        <>
          <span style={{ opacity: 0.9 }}>＋</span>
          <span>{loading ? "Logging…" : "Log"}</span>
        </>
      ) : (
        <>{loading ? "Logging…" : "Log activity"}</>
      )}
    </button>
  );
}
