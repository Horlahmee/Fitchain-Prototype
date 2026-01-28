"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";

const FIT_USD_RATE = Number(process.env.NEXT_PUBLIC_FIT_USD_RATE || "0.02");

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatUsd(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

type OwnedBadge = {
  id: string;
  rarity: string;
  title: string;
  subtitle: string;
  source: string;
  createdAt: string;
};

export default function ProfilePage() {
  const { address: activeAddress, source } = useActiveWallet();
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [ownedBadges, setOwnedBadges] = useState<OwnedBadge[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const walletUsd = useMemo(() => walletBalance * FIT_USD_RATE, [walletBalance]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    if (!activeAddress) {
      setWalletBalance(0);
      return;
    }
    fetch(`${API_BASE_URL}/wallet/balance?wallet=${activeAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setWalletBalance(Number(j.balanceFit || 0));
      })
      .catch(() => {});
  }, [activeAddress]);

  useEffect(() => {
    if (!activeAddress) {
      setOwnedBadges([]);
      return;
    }

    fetch(`${API_BASE_URL}/badges/list?wallet=${activeAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setOwnedBadges(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setOwnedBadges([]));
  }, [activeAddress]);

  return (
    <div style={styles.page}>
      {toast && <div style={styles.toast}>{toast}</div>}
      <div style={styles.header}>
        <div style={styles.title}>Profile</div>
        <Link
          href="/settings"
          aria-label="Settings"
          style={styles.gear as any}
        >
          ⚙
        </Link>
      </div>

      <div style={styles.profileCard}>
        <div style={styles.avatar} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>FitWarrior</div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>🏆 Rank #127</div>
          <div style={{ opacity: 0.55, marginTop: 6, fontSize: 12 }}>{activeAddress ? "Wallet active" : ""}</div>
        </div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.statCard}>
          <div style={styles.statRing} />
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>12</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>Day Streak</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.fitIcon}>$FIT</div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>4,523.45</div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>Total Earned</div>
        </div>
      </div>

      <div style={styles.sectionRow}>
        <div style={styles.sectionIcon}>👛</div>
        <div style={styles.sectionTitle}>Wallet</div>
      </div>

      <Link href="/wallet" style={{ textDecoration: "none", color: "inherit" } as any}><div style={{ ...styles.walletCard, cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={styles.walletDot} />
              <div style={{ opacity: 0.85, fontSize: 13 }}>
                {activeAddress ? `${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}` : "Not signed in"}
              </div>
            </div>
            {!activeAddress && (
              <Link href="/settings" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>
                Create a wallet →
              </Link>
            )}
          </div>
          <button
            style={styles.copyBtn}
            aria-label="Copy"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!activeAddress) return;
              navigator.clipboard?.writeText(activeAddress).then(() => showToast("Copied ✅")).catch(() => showToast("Copy failed"));
            }}
          >
            ⧉
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 32, fontWeight: 900, color: theme.colors.accent }}>
          {fmt(walletBalance)} <span style={{ fontSize: 14, opacity: 0.9 }}>$FIT</span>
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>≈ {formatUsd(walletUsd)} USD</div>
      </div></Link>

      <div style={styles.badgesHeader}>
        <div style={styles.sectionTitle}>Badges ({ownedBadges.length})</div>
        <Link href="/badges" style={{ opacity: 0.9, color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>
          View All →
        </Link>
      </div>

      {ownedBadges.length === 0 ? (
        <div style={{ opacity: 0.75, marginTop: 10, fontSize: 13, lineHeight: 1.45 }}>
          No badges owned yet. Buy one in Marketplace to see it here.
        </div>
      ) : (
        <div style={styles.badgesGrid}>
          {ownedBadges.slice(0, 2).map((b) => (
            <div key={b.id} style={styles.badgeTile}>
              <div style={styles.badgeThumb} />
              <div style={{ padding: 12 }}>
                <div
                  style={{
                    ...styles.badgePill,
                    color:
                      String(b.rarity).toUpperCase() === "RARE" || String(b.rarity).toUpperCase() === "EPIC" || String(b.rarity).toUpperCase() === "LEGENDARY"
                        ? theme.colors.accent
                        : "rgba(255,255,255,0.65)",
                  }}
                >
                  {String(b.rarity).toUpperCase()}
                </div>
                <div style={{ marginTop: 8, fontWeight: 900 }}>{b.title}</div>
                <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>Source: {b.source}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 14 }} />
      <div style={styles.sectionTitle}>Claim History</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[{ fit: 245.5, when: "1d ago" }, { fit: 198.0, when: "2d ago" }, { fit: 220.75, when: "3d ago" }].map((r, i) => (
          <div key={i} style={styles.claimRow}>
            <div>
              <div style={{ fontWeight: 900 }}>+{fmt(r.fit)} $FIT</div>
              <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{r.when}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.7 }}>
              <div style={{ fontSize: 12 }}>0x…a3b1</div>
              <div style={{ opacity: 0.85 }}>↗</div>
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
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 900 },
  gear: {
    width: 40,
    height: 40,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    textDecoration: "none",
  },
  toast: {
    position: "fixed",
    left: 18,
    right: 18,
    top: 18,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.80)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    color: "white",
    fontWeight: 900,
    zIndex: 9999,
  },

  profileCard: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    border: `3px solid ${theme.colors.accentSoft}`,
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 },
  statCard: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statRing: {
    width: 52,
    height: 52,
    borderRadius: 999,
    border: `6px solid ${theme.colors.accentSoft}`,
    position: "relative",
  },
  fitIcon: {
    width: 52,
    height: 52,
    borderRadius: 999,
    background: theme.colors.accentSoft,
    border: `1px solid ${theme.colors.accentSoft}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    color: theme.colors.accent,
  },
  sectionRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 8 },
  sectionIcon: { width: 18, height: 18, color: theme.colors.accent },
  sectionTitle: { fontWeight: 900, fontSize: 16 },
  walletCard: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  walletDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: theme.colors.accent,
    boxShadow: `0 0 18px ${theme.colors.accentGlow}`,
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
  },
  badgesHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  badgesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 },
  badgeTile: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  badgeThumb: { height: 92, background: "rgba(255,255,255,0.10)" },
  badgePill: {
    fontSize: 11,
    fontWeight: 900,
    opacity: 0.85,
  },
  claimRow: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
};