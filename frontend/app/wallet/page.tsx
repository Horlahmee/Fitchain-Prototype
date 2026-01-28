"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";
import { formatTimeAgo } from "../lib/providerStatus";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";
const FIT_SYMBOL_UI = "$FIT";
const FIT_USD_RATE = Number(process.env.NEXT_PUBLIC_FIT_USD_RATE || "0");

function fmt(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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

type WalletTx = {
  id: string;
  type: "CREDIT" | "DEBIT";
  amountFit: number;
  memo?: string | null;
  ref?: string | null;
  createdAt: string;
};

type WalletTxsResp = {
  ok: boolean;
  wallet: string;
  balanceFit: number;
  txs: WalletTx[];
};

function txCategory(memo: string | null | undefined): "REWARDS" | "MARKET" | "WALLET" {
  const label = String(memo || "").toLowerCase();
  if (label.includes("reward") || label.includes("claim")) return "REWARDS";
  if (label.includes("market") || label.includes("badge") || label.includes("purchase")) return "MARKET";
  return "WALLET";
}

function txDisplay(memo: string | null | undefined) {
  const raw = String(memo || "").trim();
  if (!raw) return { title: "Wallet activity", icon: "↔" };

  // Marketplace purchase: <title>
  if (/^marketplace purchase:/i.test(raw)) {
    const t = raw.replace(/^marketplace purchase:/i, "").trim();
    return { title: t ? `Bought badge: ${t}` : "Bought badge", icon: "🛍" };
  }

  if (/reward/i.test(raw)) return { title: raw, icon: "🏅" };

  return { title: raw, icon: "↔" };
}

export default function WalletPage() {
  const { address: activeAddress, source } = useActiveWallet();
  const [data, setData] = useState<WalletTxsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "REWARDS" | "MARKET" | "WALLET">("ALL");
  const [learnOpen, setLearnOpen] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }

  const refresh = useCallback(async () => {
    if (!activeAddress) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/wallet/txs?wallet=${activeAddress}`, { cache: "no-store" });
      const j = await r.json();
      setData(j);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeAddress]);

  // Initial load + wallet changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh (when page is visible). Keeps wallet tx list in sync after marketplace buys.
  useEffect(() => {
    if (!activeAddress) return;

    function onVis() {
      if (document.visibilityState === "visible") refresh();
    }

    // Custom event fired by Marketplace after a purchase
    function onWalletUpdated() {
      refresh();
    }

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("fitchain:walletUpdated", onWalletUpdated as any);

    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10_000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("fitchain:walletUpdated", onWalletUpdated as any);
      window.clearInterval(t);
    };
  }, [activeAddress, refresh]);

  const bal = data?.balanceFit ?? 0;

  const subtitle = useMemo(() => {
    if (!activeAddress) return "Create or import a wallet to get started.";
    if (source === "wallet") return "Your wallet balance is stored offchain (bridge mode).";
    return "Wallet connected.";
  }, [activeAddress, source]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Wallet</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={styles.pillBtn as any}
            disabled={!activeAddress || loading}
            onClick={() => refresh()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link href="/settings" style={styles.pill as any}>
            Manage
          </Link>
        </div>
      </div>

      <div style={{ opacity: 0.75, fontSize: 13, marginBottom: 14 }}>{subtitle}</div>

      {toast && <div style={styles.toast}>{toast}</div>}

      <div style={styles.addrRow}>
        <div style={{ opacity: 0.85, fontSize: 13 }}>
          {activeAddress ? `${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}` : "—"}
        </div>
        <button
          style={styles.copyBtn as any}
          disabled={!activeAddress}
          aria-label="Copy address"
          onClick={() => {
            if (!activeAddress) return;
            navigator.clipboard
              ?.writeText(activeAddress)
              .then(() => showToast("Copied ✅"))
              .catch(() => showToast("Copy failed"));
          }}
        >
          ⧉
        </button>
      </div>

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Wallet Balance</div>
          <div style={{ opacity: 0.65, fontSize: 12 }}>
            {loading ? "updating…" : source ? `signed in: ${source}` : ""}
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 40, fontWeight: 900, color: theme.colors.accent }}>
          {fmt(bal)} <span style={{ fontSize: 14, opacity: 0.9 }}>{FIT_SYMBOL_UI}</span>
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>≈ {formatUsd(fitToUsd(bal))} USD</div>

        <button style={styles.withdrawBtn as any} disabled>
          Withdraw to external wallet (coming soon)
        </button>
      </div>

      <div style={styles.bridgeCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Bridge mode</div>
          <button style={styles.linkBtn as any} onClick={() => setLearnOpen(true)}>
            Learn more
          </button>
        </div>
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13, lineHeight: 1.45 }}>
          Your rewards are credited instantly to your wallet balance. Withdraw to any EVM wallet later
          using your seed phrase.
        </div>
      </div>

      <div style={styles.securityCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>Security tips</div>
          <Link href="/settings" style={styles.inlineLink as any}>
            Export seed →
          </Link>
        </div>
        <ul
          style={{
            marginTop: 10,
            marginBottom: 0,
            paddingLeft: 18,
            opacity: 0.85,
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <li>Never share your seed phrase with anyone.</li>
          <li>Only export it when you’re in a private place.</li>
          <li>If someone sees it, they can take your funds.</li>
        </ul>
      </div>

      <div style={{ height: 14 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Transactions</div>
        <div style={styles.filterWrap}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            style={styles.filterSelect as any}
            aria-label="Filter transactions"
          >
            <option value="ALL">All</option>
            <option value="REWARDS">Rewards</option>
            <option value="MARKET">Market</option>
            <option value="WALLET">Wallet</option>
          </select>
          <div style={styles.filterChevron}>▾</div>
        </div>
      </div>

      {!activeAddress ? (
        <div style={styles.emptyCard}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>No wallet yet</div>
          <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
            Create a wallet to start earning and claiming rewards.
          </div>
          <Link href="/settings" style={styles.primaryCta as any}>
            Create a wallet
          </Link>
        </div>
      ) : !data?.txs?.length ? (
        <div style={styles.emptyCard}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>No transactions yet</div>
          <div style={{ opacity: 0.75, fontSize: 13, lineHeight: 1.5 }}>
            Claim rewards to see your first wallet activity.
          </div>
          <Link href="/rewards" style={styles.primaryCta as any}>
            Go to Rewards
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(() => {
            const all = data.txs;
            const visible = all.filter((t) => {
              const category = txCategory(t.memo);
              return filter === "ALL" ? true : category === filter;
            });
            return visible;
          })().map((t) => {
            const category = txCategory(t.memo);
            const d = txDisplay(t.memo);

            return (
              <div key={t.id} style={styles.txRow}>
                <div style={styles.txIcon}>{d.icon}</div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={
                        category === "REWARDS"
                          ? styles.pillRewards
                          : category === "MARKET"
                          ? styles.pillMarket
                          : styles.pillWallet
                      }
                    >
                      {category}
                    </span>
                    <div style={{ fontWeight: 900 }}>
                      {t.type === "CREDIT" ? "+" : "-"}
                      {fmt(t.amountFit)} {FIT_SYMBOL_UI}
                    </div>
                  </div>

                  <div style={{ opacity: 0.72, fontSize: 12, marginTop: 4 }}>
                    {d.title} · {formatTimeAgo(t.createdAt)}
                  </div>
                </div>

                <div style={{ opacity: 0.5, fontSize: 12 }}>{t.ref ? `#${t.ref.slice(0, 6)}…` : ""}</div>
              </div>
            );
          })}
        </div>
      )}

      {learnOpen && (
        <div style={styles.modalOverlay} onClick={() => setLearnOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>How withdrawals work</div>
              <button style={styles.iconBtn as any} onClick={() => setLearnOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13, lineHeight: 1.55 }}>
              <p style={{ marginTop: 0 }}>
                FitChain credits rewards instantly to your wallet balance so new users don’t need an
                external wallet on day one.
              </p>
              <p>
                When you’re ready, you can withdraw to any EVM wallet by exporting your seed phrase
                and importing it into a non-custodial wallet app.
              </p>
              <p style={{ marginBottom: 0 }}>
                Important: never share your seed phrase. If someone sees it, they can take your funds.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <Link href="/settings" style={styles.primaryCta as any} onClick={() => setLearnOpen(false)}>
                Export seed
              </Link>
              <button style={styles.secondaryCta as any} onClick={() => setLearnOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
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
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: 900 },
  pill: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    textDecoration: "none",
  },
  pillBtn: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    opacity: 0.95,
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
    fontSize: 14,
    zIndex: 9999,
  },

  addrRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },
  copyBtn: {
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.20)",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    opacity: 0.9,
  },

  card: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 16,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  withdrawBtn: {
    marginTop: 14,
    width: "100%",
    padding: "14px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.65)",
    fontWeight: 900,
    fontSize: 14,
    cursor: "not-allowed",
  },

  bridgeCard: {
    marginTop: 12,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
  },

  securityCard: {
    marginTop: 12,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255, 173, 51, 0.10)",
    padding: 14,
  },
  inlineLink: {
    color: theme.colors.accent,
    fontWeight: 900,
    textDecoration: "none",
    opacity: 0.9,
    fontSize: 13,
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
  secondaryCta: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: 12,
    padding: "14px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.08)",
    color: "white",
    fontWeight: 900,
    textDecoration: "none",
    cursor: "pointer",
  },

  filterWrap: {
    position: "relative",
  },
  filterChevron: {
    position: "absolute",
    right: 12,
    top: 0,
    height: 38,
    display: "flex",
    alignItems: "center",
    color: "rgba(255,255,255,0.70)",
    pointerEvents: "none",
    fontWeight: 900,
  },
  filterSelect: {
    height: 38,
    padding: "0 36px 0 12px",
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
  },

  pillRewards: {
    fontSize: 10,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    letterSpacing: 0.8,
    textTransform: "uppercase" as any,
    background: "rgba(198, 255, 0, 0.18)",
    border: "1px solid rgba(198, 255, 0, 0.32)",
    color: theme.colors.accent,
    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
  },
  pillMarket: {
    fontSize: 10,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    letterSpacing: 0.8,
    textTransform: "uppercase" as any,
    background: "rgba(165, 80, 255, 0.18)",
    border: "1px solid rgba(165, 80, 255, 0.32)",
    color: "#C9A3FF",
    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
  },
  pillWallet: {
    fontSize: 10,
    fontWeight: 900,
    padding: "5px 10px",
    borderRadius: 999,
    letterSpacing: 0.8,
    textTransform: "uppercase" as any,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "rgba(255,255,255,0.72)",
    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
  },

  txRow: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.20)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flex: "0 0 auto",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modalCard: {
    width: "min(560px, 100%)",
    borderRadius: 24,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(18,18,18,0.95)",
    padding: 14,
    boxShadow: "0 18px 60px rgba(0,0,0,0.65)",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: theme.colors.accent,
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 13,
  },
};
