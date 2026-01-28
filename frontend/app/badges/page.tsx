"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";

type CatalogItem = {
  id: string;
  rarity: "LEGENDARY" | "EPIC" | "RARE" | "COMMON";
  title: string;
  subtitle: string;
  priceFit: number;
  estUsd: number;
};

type OwnedBadge = {
  id: string;
  rarity: CatalogItem["rarity"] | string;
  title: string;
  subtitle: string;
  source: string;
  createdAt: string;
};

export default function BadgesPage() {
  const { address: activeAddress } = useActiveWallet();

  const [tab, setTab] = useState<"all" | "owned">("all");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [owned, setOwned] = useState<OwnedBadge[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/marketplace/catalog`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCatalog(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    if (!activeAddress) {
      setOwned([]);
      return;
    }

    fetch(`${API_BASE_URL}/badges/list?wallet=${activeAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setOwned(Array.isArray(j?.items) ? j.items : []))
      .catch(() => setOwned([]));
  }, [activeAddress]);

  const ownedIds = useMemo(() => new Set(owned.map((x) => x.id)), [owned]);

  const visible = useMemo(() => {
    const all = catalog;
    if (tab === "owned") return all.filter((x) => ownedIds.has(x.id));
    return all;
  }, [catalog, ownedIds, tab]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Badges</div>
        <Link href="/profile" style={styles.pill as any}>
          Back
        </Link>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button onClick={() => setTab("all")} style={tab === "all" ? styles.segActive : styles.seg}>
          All
        </button>
        <button onClick={() => setTab("owned")} style={tab === "owned" ? styles.segActive : styles.seg}>
          Owned
        </button>
      </div>

      {!activeAddress ? (
        <div style={styles.emptyCard}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>No wallet yet</div>
          <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
            Create a wallet to start collecting badges.
          </div>
          <Link href="/settings" style={styles.primaryCta as any}>
            Create a wallet
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ opacity: 0.75 }}>No badges yet.</div>
      ) : (
        <div style={styles.grid}>
          {visible.map((b) => {
            const isOwned = ownedIds.has(b.id);
            return (
              <div key={b.id} style={styles.tile}>
                <div style={styles.thumb} />
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ opacity: 0.7, fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{b.rarity}</div>
                    {isOwned && <span style={styles.ownedPill}>OWNED</span>}
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 900 }}>{b.title}</div>
                  <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>{b.subtitle}</div>
                  <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
                    {isOwned ? "Owned" : `Buy in Marketplace · ${b.priceFit} $FIT`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeAddress && (
        <div style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
          Owned: {owned.length} · Catalog: {catalog.length}
        </div>
      )}

      <div style={{ height: 18 }} />
      <Link href="/marketplace" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>
        Go to Marketplace →
      </Link>
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
  pill: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
  },

  seg: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  segActive: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.accentSoft}`,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: `0 10px 20px ${theme.colors.accentGlow}`,
  },

  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  tile: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  thumb: { height: 110, background: "rgba(255,255,255,0.10)" },
  ownedPill: {
    fontSize: 9,
    fontWeight: 900,
    padding: "4px 10px",
    borderRadius: 999,
    letterSpacing: 0.8,
    textTransform: "uppercase" as any,
    background: "rgba(0, 255, 170, 0.10)",
    border: "1px solid rgba(0, 255, 170, 0.22)",
    color: "rgba(0, 255, 170, 0.85)",
    height: 22,
    display: "inline-flex",
    alignItems: "center",
  },

  emptyCard: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
  },
  primaryCta: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: 12,
    padding: "14px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: `0 12px 28px ${theme.colors.accentGlow}` as any,
  },
};
