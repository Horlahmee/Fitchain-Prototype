"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";
import { formatTimeAgo } from "../lib/providerStatus";

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
  rarity: CatalogItem["rarity"];
  title: string;
  subtitle: string;
  source: string;
  createdAt: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function rarityStyle(r: CatalogItem["rarity"]) {
  // Match the screenshot palette:
  // - Legendary: gold/orange
  // - Epic: purple
  // - Rare: blue
  // - Common: grey
  if (r === "LEGENDARY")
    return { bg: "rgba(255, 173, 51, 0.20)", border: "rgba(255, 173, 51, 0.38)", color: "#FFB84D" };
  if (r === "EPIC")
    return { bg: "rgba(165, 80, 255, 0.20)", border: "rgba(165, 80, 255, 0.38)", color: "#C9A3FF" };
  if (r === "RARE")
    return { bg: "rgba(45, 107, 255, 0.20)", border: "rgba(45, 107, 255, 0.42)", color: "#2D6BFF" };
  return { bg: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.70)" };
}

function thumbFor(id: string) {
  const thumbs = [
    // soft 3D-ish greys
    "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.35) 100%), radial-gradient(600px 220px at 30% 20%, rgba(255,255,255,0.22) 0%, rgba(0,0,0,0) 55%)",
    "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.38) 100%), radial-gradient(600px 220px at 70% 25%, rgba(120,140,255,0.28) 0%, rgba(0,0,0,0) 55%)",
    // chart-like
    "linear-gradient(135deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%), radial-gradient(700px 250px at 30% 25%, rgba(0,255,170,0.10) 0%, rgba(0,0,0,0) 60%), radial-gradient(700px 250px at 70% 40%, rgba(45,107,255,0.18) 0%, rgba(0,0,0,0) 60%)",
    // coin-ish
    "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0.40) 100%), radial-gradient(220px 220px at 65% 40%, rgba(255, 204, 0, 0.26) 0%, rgba(0,0,0,0) 60%)",
    // neon abstract
    "linear-gradient(135deg, rgba(165,80,255,0.42) 0%, rgba(0, 255, 210, 0.28) 45%, rgba(45,107,255,0.22) 100%)",
    // warm blocks
    "linear-gradient(135deg, rgba(255, 140, 0, 0.55) 0%, rgba(255, 80, 80, 0.35) 45%, rgba(45,107,255,0.22) 100%)",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return thumbs[h % thumbs.length];
}

export default function MarketplacePage() {
  const { address: activeAddress } = useActiveWallet();

  const [tab, setTab] = useState<"buy" | "owned" | "sell">("buy");
  const [toast, setToast] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [active, setActive] = useState<CatalogItem | null>(null);
  const [activeOwned, setActiveOwned] = useState<OwnedBadge | null>(null);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [owned, setOwned] = useState<OwnedBadge[]>([]);
  const ownedIds = useMemo(() => new Set(owned.map((x) => x.id)), [owned]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  const refreshCatalog = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/marketplace/catalog`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.items)) setCatalog(j.items);
    } catch {
      // ignore
    }
  }, []);

  const refreshOwned = useCallback(async () => {
    if (!activeAddress) {
      setOwned([]);
      return;
    }
    try {
      const r = await fetch(`${API_BASE_URL}/badges/list?wallet=${activeAddress}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.items)) setOwned(j.items);
    } catch {
      // ignore
    }
  }, [activeAddress]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    refreshOwned();
  }, [refreshOwned]);

  const headerPill = useMemo(() => {
    if (tab === "buy") return "Browse and collect exclusive NFT badges with $FIT";
    if (tab === "owned") return "Your owned badges";
    return "List your NFT badges for sale (coming soon)";
  }, [tab]);

  async function buyNow(item: CatalogItem) {
    if (!activeAddress) {
      showToast("Create a wallet in Settings first");
      return;
    }
    if (ownedIds.has(item.id)) {
      showToast("Already owned");
      return;
    }

    setBuying(true);
    try {
      const r = await fetch(`${API_BASE_URL}/marketplace/buy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress, badgeId: item.id }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        showToast(j?.error || "Purchase failed");
        return;
      }

      showToast("Purchased ✅");
      setActive(null);

      // Refresh marketplace owned list + nudge wallet page to update txs immediately.
      await refreshOwned();
      window.dispatchEvent(new CustomEvent("fitchain:walletUpdated"));
    } catch {
      showToast("Purchase failed");
    } finally {
      setBuying(false);
    }
  }

  return (
    <div style={styles.page}>
      {toast && <div style={styles.toast}>{toast}</div>}

      <div style={styles.header}>
        <div style={styles.title}>Marketplace</div>

        <div style={styles.dropdownWrap}>
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value as any)}
            style={styles.dropdown as any}
            aria-label="Marketplace section"
          >
            <option value="buy">↙ Buy</option>
            <option value="sell">↗ Sell</option>
            <option value="owned">🎒 Owned</option>
          </select>
          <div style={styles.dropdownChevron}>⌄</div>
        </div>
      </div>

      <div style={styles.infoPill}>
        <div style={styles.infoIcon}>👜</div>
        <div style={{ opacity: 0.85, fontSize: 13 }}>{headerPill}</div>
      </div>

      {tab === "buy" && (
        <>
          <div style={styles.grid}>
            {catalog.map((b) => {
              const r = rarityStyle(b.rarity);
              // owned marker hidden to match screenshot

              return (
                <button key={b.id} onClick={() => setActive(b)} style={styles.tile} aria-label={b.title}>
                  <div style={{ ...styles.thumb, background: thumbFor(b.id) }}>
                    <span style={{ ...styles.rarityPill, background: r.bg, borderColor: r.border, color: r.color }}>
                      {b.rarity}
                    </span>
                    {/* owned marker hidden to match screenshot */}
                  </div>

                  <div style={styles.tileBody}>
                    <div style={styles.tileTitle}>{b.title}</div>
                    <div style={styles.tilePrice}>{fmt(b.priceFit)} $FIT</div>
                  </div>
                </button>
              );
            })}
          </div>

          {active && (
            <div style={styles.sheetOverlay} onClick={() => setActive(null)}>
              <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
                <div style={styles.sheetTop}>
                  <div style={{ ...styles.sheetThumb, background: thumbFor(active.id) }} />
                  <button onClick={() => setActive(null)} style={styles.closeBtn} aria-label="Close">
                    ✕
                  </button>
                </div>

                <div style={{ marginTop: 10, textAlign: "center" }}>
                  <div style={styles.modalRarityRow}>
                    <span style={styles.modalRarityPill}>{active.rarity}</span>
                  </div>

                  <div style={styles.modalTitle}>{active.title}</div>
                  <div style={styles.modalSubtitle}>{active.subtitle}</div>

                  <div style={styles.modalPrice}>{fmt(active.priceFit)} $FIT</div>
                  <div style={styles.modalUsd}>≈ ${fmt(active.estUsd)} USD</div>

                  <button
                    style={ownedIds.has(active.id) ? styles.buyNowDisabled : styles.buyNow}
                    disabled={buying || ownedIds.has(active.id)}
                    onClick={() => buyNow(active)}
                  >
                    {ownedIds.has(active.id) ? "✅ Owned" : buying ? "Processing…" : "Buy"}
                  </button>

                  <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
                    Tip: purchases debit your in-app wallet and instantly appear in Wallet → Transactions.
                  </div>

                  {!activeAddress && (
                    <div style={{ marginTop: 10 }}>
                      <Link href="/settings" style={styles.linkCta as any}>
                        Create wallet →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "owned" && (
        <>
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
          ) : owned.length === 0 ? (
            <div style={styles.emptyCard}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>No badges owned yet</div>
              <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
                Head to Buy to purchase your first badge.
              </div>
              <button style={styles.primaryCta as any} onClick={() => setTab("buy")}>Go to Buy</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {owned.map((b) => {
                  const r = rarityStyle(b.rarity);
                  return (
                    <button key={b.id} style={styles.ownedRowBtn as any} onClick={() => setActiveOwned(b)}>
                      <div style={styles.ownedIcon}>🏅</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 900 }}>{b.title}</div>
                          <span style={{ ...styles.rarityPillInline, background: r.bg, borderColor: r.border, color: r.color }}>
                            {b.rarity}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>{b.subtitle}</div>
                        <div style={{ marginTop: 6, opacity: 0.65, fontSize: 12 }}>
                          Acquired {formatTimeAgo(b.createdAt)} · source: {b.source}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeOwned && (
                <div style={styles.sheetOverlay} onClick={() => setActiveOwned(null)}>
                  <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.sheetTop}>
                      <div style={{ ...styles.sheetThumb, background: thumbFor(activeOwned.id) }} />
                      <button onClick={() => setActiveOwned(null)} style={styles.closeBtn} aria-label="Close">
                        ✕
                      </button>
                    </div>

                    <div style={{ marginTop: 10, textAlign: "center" }}>
                      <div style={styles.modalRarityRow}>
                        <span style={styles.modalRarityPill}>{activeOwned.rarity}</span>
                      </div>

                      <div style={styles.modalTitle}>{activeOwned.title}</div>
                      <div style={styles.modalSubtitle}>{activeOwned.subtitle}</div>

                      <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
                        Acquired {formatTimeAgo(activeOwned.createdAt)} · source: {activeOwned.source}
                      </div>

                      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <button
                          style={styles.actionBtn as any}
                          onClick={() => {
                            const text = `I just unlocked the “${activeOwned.title}” badge on FitChain.`;
                            navigator.clipboard
                              ?.writeText(text)
                              .then(() => showToast("Copied share text ✅"))
                              .catch(() => showToast("Copy failed"));
                          }}
                        >
                          📋 Share
                        </button>
                        <button
                          style={styles.actionBtnDisabled as any}
                          onClick={() => showToast("Selling is coming soon")}
                          disabled
                        >
                          🏷 List for sale
                        </button>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <Link href="/badges" style={styles.linkCta as any} onClick={() => setActiveOwned(null)}>
                          View in Badges →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "sell" && (
        <div style={styles.emptyCard}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Selling is coming soon</div>
          <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
            Next: list an owned badge, set a price, and earn $FIT when it sells.
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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

  page: {
    minHeight: "100vh",
    padding: 18,
    color: theme.colors.text,
    background:
      "radial-gradient(1200px 800px at 50% -20%, rgba(204,255,0,0.20) 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, #05070B 0%, #000000 75%)",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 24, fontWeight: 900 },

  dropdownWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
  },
  dropdown: {
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    padding: "10px 44px 10px 16px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    outline: "none",
  },
  dropdownChevron: {
    position: "absolute",
    right: 14,
    pointerEvents: "none",
    opacity: 0.75,
    fontWeight: 900,
  },
  infoPill: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    marginBottom: 18,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.25)",
    border: `1px solid ${theme.colors.accentSoft}`,
    color: theme.colors.accent,
    fontWeight: 900,
  },
  grid: {
    marginTop: 6,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  tile: {
    borderRadius: 22,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    minHeight: 220,
    textDecoration: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left" as any,
    boxShadow: "0 18px 44px rgba(0,0,0,0.55)",
  },
  thumb: {
    position: "relative",
    height: 128,
    background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.30) 100%)",
  },
  tileBody: {
    padding: 12,
    background: "rgba(0,0,0,0.16)",
  },
  tileTitle: {
    fontWeight: 900,
    fontSize: 14,
    lineHeight: 1.15,
  },
  tilePrice: {
    marginTop: 6,
    fontWeight: 900,
    color: theme.colors.accent,
    letterSpacing: 0.2,
  },
  ownedPill: {
    position: "absolute",
    top: 10,
    right: 10,
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
  rarityRow: {
    marginTop: 10,
    display: "flex",
    justifyContent: "flex-start",
  },
  rarityPill: {
    position: "absolute",
    left: 10,
    bottom: 10,
    fontSize: 6,
    fontWeight: 900,
    padding: "3px 6px",
    letterSpacing: 0.6,
    textTransform: "uppercase" as any,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.40)",
    whiteSpace: "nowrap" as any,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  rarityPillInline: {
    fontSize: 9,
    fontWeight: 900,
    padding: "3px 8px",
    letterSpacing: 0.7,
    textTransform: "uppercase" as any,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    whiteSpace: "nowrap" as any,
    boxShadow: "0 8px 18px rgba(0,0,0,0.35)",
  },

  sheetOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  sheet: {
    width: "min(560px, 100%)",
    borderRadius: 28,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(18,18,18,0.95)",
    padding: 14,
    boxShadow: "0 18px 60px rgba(0,0,0,0.65)",
  },
  sheetTop: {
    position: "relative" as any,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 8,
  },
  sheetThumb: {
    width: 150,
    height: 150,
    borderRadius: 30,
    background: "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.30) 100%)",
    border: `3px solid ${theme.colors.accentSoft}` as any,
    boxShadow: "0 22px 60px rgba(0,0,0,0.60)",
  },
  closeBtn: {
    position: "absolute" as any,
    right: 6,
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },

  modalRarityRow: {
    display: "flex",
    justifyContent: "center",
  },
  modalRarityPill: {
    fontSize: 10,
    fontWeight: 900,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
  },
  modalTitle: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: 900,
  },
  modalSubtitle: {
    marginTop: 6,
    opacity: 0.75,
    fontSize: 13,
  },
  modalPrice: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: 900,
    color: theme.colors.accent,
  },
  modalUsd: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: 12,
  },

  buyNow: {
    marginTop: 18,
    width: "100%",
    padding: "18px 14px",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.22)",
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: `0 18px 44px ${theme.colors.accentGlow}`,
    fontSize: 16,
  },
  buyNowDisabled: {
    marginTop: 18,
    width: "100%",
    padding: "18px 14px",
    borderRadius: 18,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 900,
    cursor: "not-allowed",
    fontSize: 16,
  },
  linkCta: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
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
    cursor: "pointer",
  },

  ownedRow: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  ownedRowBtn: {
    width: "100%",
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
    cursor: "pointer",
    textAlign: "left" as any,
  },
  actionBtn: {
    flex: 1,
    padding: "14px 12px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
  },
  actionBtnDisabled: {
    flex: 1,
    padding: "14px 12px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.70)",
    fontWeight: 900,
    cursor: "not-allowed",
  },
  ownedIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.20)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
};
