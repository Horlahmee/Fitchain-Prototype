"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { fetchProvidersStatus, formatTimeAgo } from "../lib/providerStatus";
import {
  clearWallet,
  createWallet,
  importWallet,
  useActiveWallet,
} from "../lib/mockAuth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";
const WALLET_BACKUP_KEY = "fitchain:walletBackedUp";

type ProviderRow = {
  name: string;
  key: "STRAVA" | "GOOGLE_FIT" | "APPLE_HEALTH";
  connected: boolean;
  lastSyncText: string;
};

export default function SettingsPage() {
  const { address: activeAddress, source, wallet, refreshWallet } = useActiveWallet();

  const [darkMode, setDarkMode] = useState(true);
  const [providerRows, setProviderRows] = useState<ProviderRow[]>([
    { name: "Strava", key: "STRAVA", connected: false, lastSyncText: "—" },
    { name: "Google Fit", key: "GOOGLE_FIT", connected: false, lastSyncText: "—" },
    { name: "Apple Health", key: "APPLE_HEALTH", connected: false, lastSyncText: "Coming soon" },
  ]);

  const [importText, setImportText] = useState("");
  const [showSeed, setShowSeed] = useState(false);
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revealConfirmChecked, setRevealConfirmChecked] = useState(false);
  const [revealPhraseText, setRevealPhraseText] = useState("");
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupChecked, setBackupChecked] = useState(false);
  const [backupPhraseText, setBackupPhraseText] = useState("");
  const [walletBackedUp, setWalletBackedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // wallet backup status
  React.useEffect(() => {
    try {
      setWalletBackedUp(window.localStorage.getItem(WALLET_BACKUP_KEY) === "1");
    } catch {}
  }, []);

  // provider status
  React.useEffect(() => {
    if (!activeAddress) {
      setProviderRows((rows) =>
        rows.map((r) =>
          r.key === "APPLE_HEALTH" ? r : { ...r, connected: false, lastSyncText: "—" }
        )
      );
      return;
    }

    fetchProvidersStatus(API_BASE_URL, activeAddress)
      .then((j) => {
        setProviderRows((rows) =>
          rows.map((r) => {
            if (r.key === "APPLE_HEALTH") return r;
            const p = j.providers?.find((x) => x.provider === r.key);
            return {
              ...r,
              connected: Boolean(p?.connected),
              lastSyncText: p?.connected
                ? `Last sync: ${formatTimeAgo(p?.lastActivityAt ?? null)}`
                : "Not connected",
            };
          })
        );
      })
      .catch(() => {
        // keep it graceful
      });
  }, [activeAddress]);

  const walletHint = useMemo(() => {
    if (!activeAddress) return "Create a wallet to get started. Then back up your seed phrase.";
    return source === "wagmi"
      ? "Signed in with wallet."
      : "Signed in with wallet.";
  }, [activeAddress, source]);

  const hasWallet = Boolean(wallet?.address);

  function onCreateWallet() {
    setError(null);
    setSuccessMsg(null);
    try {
      createWallet();
      refreshWallet();
      setSuccessMsg("Wallet created ✅");
      setShowSeed(true);
    } catch (e: any) {
      setError(e?.message || "Failed to create wallet");
    }
  }

  function onImportWallet() {
    setError(null);
    setSuccessMsg(null);
    try {
      importWallet(importText);
      refreshWallet();
      // confirm backup even after import (new users often forget)
      try { window.localStorage.setItem(WALLET_BACKUP_KEY, "0"); } catch {}
      setWalletBackedUp(false);
      setSuccessMsg("Wallet imported ✅");
      setImportText("");
      setBackupChecked(false);
      setBackupPhraseText("");
      setBackupModalOpen(true);
    } catch (e: any) {
      setError("Invalid seed phrase");
    }
  }

  function onClearWallet() {
    clearWallet();
    refreshWallet();
    try { window.localStorage.removeItem(WALLET_BACKUP_KEY); } catch {}
    setWalletBackedUp(false);
    setSuccessMsg("Wallet removed");
    setShowSeed(false);
  }

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/profile" aria-label="Back" style={styles.backBtn as any}>
          ←
        </Link>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Settings</div>
      </div>

      <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>{walletHint}</div>

      <div style={{ height: 14 }} />

      <div style={styles.sectionLabel}>APPEARANCE</div>
      <div style={styles.rowCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.iconPill}>☾</div>
          <div style={{ fontWeight: 900 }}>Dark Mode</div>
        </div>
        <button onClick={() => setDarkMode((s) => !s)} aria-label="Toggle" style={styles.toggle as any}>
          <span
            style={{
              position: "absolute",
              top: 3,
              left: darkMode ? 28 : 4,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: "white",
              transition: "left 180ms ease",
            }}
          />
        </button>
      </div>

      <div style={{ height: 18 }} />
      <div style={styles.sectionLabel}>CONNECTED PROVIDERS</div>
      <div style={styles.listCard}>
        {providerRows.map((p, i) => (
          <div
            key={p.name}
            style={{
              ...styles.listRow,
              borderTop: i ? `1px solid ${theme.colors.border}` : "none",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  ...styles.providerIcon,
                  background:
                    p.key === "APPLE_HEALTH"
                      ? "rgba(255,255,255,0.08)"
                      : p.connected
                      ? theme.colors.accentSoft
                      : "rgba(255,255,255,0.08)",
                }}
              >
                {p.name.slice(0, 1)}
              </div>
              <div>
                <div style={{ fontWeight: 900 }}>{p.name}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>{p.lastSyncText}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {p.key === "STRAVA" && activeAddress && (
                p.connected ? (
                  <button
                    style={styles.miniBtn as any}
                    onClick={async () => {
                      try {
                        await fetch(`${API_BASE_URL}/providers/disconnect`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ wallet: activeAddress, provider: "STRAVA" }),
                        });

                        // refresh provider rows
                        fetchProvidersStatus(API_BASE_URL, activeAddress)
                          .then((j) => {
                            setProviderRows((rows) =>
                              rows.map((r) => {
                                if (r.key === "APPLE_HEALTH") return r;
                                const px = j.providers?.find((x) => x.provider === r.key);
                                return {
                                  ...r,
                                  connected: Boolean(px?.connected),
                                  lastSyncText: px?.connected
                                    ? `Last sync: ${formatTimeAgo(px?.lastActivityAt ?? null)}`
                                    : "Not connected",
                                };
                              })
                            );
                          })
                          .catch(() => {});
                      } catch {}
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <a
                    href={`${API_BASE_URL}/auth/strava?wallet=${activeAddress}`}
                    style={styles.miniBtnPrimary as any}
                  >
                    Connect
                  </a>
                )
              )}

              <div style={{ color: p.connected ? theme.colors.accent : "rgba(255,255,255,0.35)", fontWeight: 900 }}>
                {p.connected ? "✓" : "↗"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 18 }} />
      <div style={styles.sectionLabel}>SECURITY</div>

      <div style={styles.warning}>
        <div style={{ fontWeight: 900, color: "#FFB84D" }}>⚠ Never share your seed phrase.</div>
        <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>Anyone with it has full access to your wallet.</div>
      </div>

      <div style={{ height: 10 }} />
      {hasWallet && !walletBackedUp && (
        <div style={styles.backupWarn}>
          <div style={{ fontWeight: 900, color: "#FFB84D" }}>⚠ Backup not done</div>
          <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>Export your seed phrase and store it safely.</div>
        </div>
      )}
      <div style={styles.sectionLabel}>WALLET</div>
      <div style={styles.cardSoft}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Wallet</div>
            {hasWallet && (
              <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                {walletBackedUp ? "Backup: done ✅" : "Backup: not done"}
              </div>
            )}
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
              {hasWallet ? `Address: ${wallet!.address}` : "Create or import a seed phrase. This wallet can be used in any EVM compatible non-custodial wallet."}
            </div>
          </div>
          <div style={{ color: hasWallet ? theme.colors.accent : "rgba(255,255,255,0.35)", fontWeight: 900 }}>
            {hasWallet ? "✓" : "—"}
          </div>
        </div>

        {!hasWallet ? (
          <>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={styles.primaryBtn as any} onClick={onCreateWallet}>
                Create a wallet
              </button>
              <button
                style={styles.secondaryBtn as any}
                onClick={() => {
                  setError(null);
    setSuccessMsg(null);
                  setShowSeed(false);
                }}
              >
                Import a wallet
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="paste 12-word seed phrase"
                style={styles.textarea as any}
              />
              <button style={{ ...styles.primaryBtn, marginTop: 10 } as any} onClick={onImportWallet}>
                Import Seed Phrase
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              style={styles.secondaryBtn as any}
              onClick={() => {
                setError(null);
    setSuccessMsg(null);
                if (showSeed) {
                  setShowSeed(false);
                  return;
                }
                setRevealConfirmChecked(false);
                setRevealPhraseText("");
                setShowSeed(false);
                setRevealModalOpen(true);
              }}
            >
              {showSeed ? "Hide" : "Export"}
            </button>
            <button style={styles.dangerBtn as any} onClick={onClearWallet}>
              Remove
            </button>
          </div>
        )}

        {error && <div style={{ marginTop: 10, color: "#FF6060", fontWeight: 900 }}>{error}</div>}
        {successMsg && <div style={{ marginTop: 10, color: theme.colors.accent, fontWeight: 900 }}>{successMsg}</div>}
        {walletBackedUp && hasWallet && (
          <div style={{ marginTop: 10 }}>
            <Link href="/wallet" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>
              Go to Wallet →
            </Link>
          </div>
        )}

      {backupModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setBackupModalOpen(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Backup reminder</div>
              <button style={styles.iconBtn as any} onClick={() => setBackupModalOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13, lineHeight: 1.5 }}>
              Please confirm you have saved your seed phrase securely. It's the only way to recover your wallet.
              If you lose it, you lose access.
            </div>

            <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 18, opacity: 0.85, fontSize: 13, lineHeight: 1.55 }}>
              <li>Write it down and store it offline.</li>
              <li>Never screenshot or share it.</li>
              <li>Only reveal it when you’re in a private place.</li>
            </ul>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, opacity: 0.9 }}>
              <input type="checkbox" checked={backupChecked} onChange={(e) => setBackupChecked(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>I’m ready to reveal my seed phrase in private.</span>
            </label>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Type BACKED UP to continue</div>
              <input value={backupPhraseText} onChange={(e) => setBackupPhraseText(e.target.value)} placeholder="BACKED UP" style={styles.revealInput as any} />
            </div>

            <button
              style={{
                ...styles.primaryBtn,
                marginTop: 12,
                opacity: backupChecked && backupPhraseText.trim().toUpperCase() === "BACKED UP" ? 1 : 0.6,
              } as any}
              disabled={!backupChecked || backupPhraseText.trim().toUpperCase() !== "BACKED UP"}
              onClick={() => {
                setBackupModalOpen(false);
                setRevealConfirmChecked(false);
                setRevealPhraseText("");
                setShowSeed(false);
                setRevealModalOpen(true);
              }}
            >
              Export seed phrase
            </button>

            <button style={{ ...styles.secondaryBtn, marginTop: 10 } as any} onClick={() => setBackupModalOpen(false)}>
              I’ll do it later
            </button>
          </div>
        </div>
      )}


      {revealModalOpen && (
        <div style={styles.modalOverlay} onClick={() => { setRevealModalOpen(false); setShowSeed(false); }}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Reveal seed phrase</div>
              <button
                style={styles.iconBtn as any}
                onClick={() => { setRevealModalOpen(false); setShowSeed(false); }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13, lineHeight: 1.45 }}>
              This seed phrase controls your wallet. Anyone who sees it can take your funds.
              Only reveal it in private.
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={revealConfirmChecked}
                onChange={(e) => setRevealConfirmChecked(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: 13, lineHeight: 1.4 }}>I understand the risk and I’m in a private place.</span>
            </label>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                Type REVEAL to continue
              </div>
              <input
                value={revealPhraseText}
                onChange={(e) => setRevealPhraseText(e.target.value)}
                placeholder="REVEAL"
                style={styles.revealInput as any}
              />
            </div>




            <div style={styles.modalSeedBox}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Seed phrase (keep it private)</div>
              <div
                style={{
                  opacity: 0.9,
                  fontSize: 13,
                  lineHeight: 1.45,
                  filter: showSeed ? "none" : "blur(10px)",
                  userSelect: showSeed ? "text" : "none",
                }}
              >
                {wallet?.mnemonic || ""}
              </div>
              <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                {showSeed ? "Auto-hides in 30 seconds." : "Will remain hidden until you authorize."}
              </div>
            </div>

            {showSeed && (
              <div style={{ marginTop: 12, textAlign: "left" }}>
                <div style={{ fontWeight: 900, fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  Type BACKED UP to confirm you saved it
                </div>
                <input
                  value={backupPhraseText}
                  onChange={(e) => setBackupPhraseText(e.target.value)}
                  placeholder="BACKED UP"
                  style={styles.revealInput as any}
                />

                <button
                  style={{
                    ...styles.primaryBtn,
                    marginTop: 12,
                    opacity: backupPhraseText.trim().toUpperCase() === "BACKED UP" ? 1 : 0.6,
                  } as any}
                  disabled={backupPhraseText.trim().toUpperCase() !== "BACKED UP"}
                  onClick={() => {
                    try { window.localStorage.setItem(WALLET_BACKUP_KEY, "1"); } catch {}
                    setWalletBackedUp(true);
                    setRevealModalOpen(false);
                    setShowSeed(false);
                    setSuccessMsg("Backup confirmed ✅");
                  }}
                >
                  I’ve backed it up
                </button>
              </div>
            )}

            <button
              style={{
                ...styles.primaryBtn,
                marginTop: 12,
                opacity: revealConfirmChecked && revealPhraseText.trim().toUpperCase() === "REVEAL" ? 1 : 0.6,
              } as any}
              disabled={!revealConfirmChecked || revealPhraseText.trim().toUpperCase() !== "REVEAL"}
              onClick={() => {
                setShowSeed(true);
                window.setTimeout(() => setShowSeed(false), 30_000);
              }}
            >
              Authorize & Reveal
            </button>
          </div>
        </div>
      )}

      </div>

      <div style={{ height: 10 }} />
      <div style={styles.listCard}>
        {[
          { label: "Recovery Options", icon: "🛡" },
          { label: "Help & Support", icon: "?" },
        ].map((x, i) => (
          <div key={x.label} style={{ ...styles.listRow, borderTop: i ? `1px solid ${theme.colors.border}` : "none" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={styles.squareIcon}>{x.icon}</div>
              <div style={{ fontWeight: 900 }}>{x.label}</div>
            </div>
            <div style={{ opacity: 0.5 }}>↗</div>
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />
      <button style={styles.signOut as any}>Sign Out</button>

      <div style={{ marginTop: 12, textAlign: "center", opacity: 0.5, fontSize: 12 }}>FitChain v1.0.0</div>
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
  backBtn: {
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
  sectionLabel: { opacity: 0.55, fontSize: 12, letterSpacing: 1 },
  rowCard: {
    marginTop: 10,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  iconPill: {
    width: 34,
    height: 34,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.colors.accentSoft,
  },
  toggle: {
    width: 54,
    height: 32,
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.accent,
    position: "relative",
  },
  listCard: {
    marginTop: 10,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  listRow: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniBtn: {
    padding: "8px 10px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
  },
  miniBtnPrimary: {
    padding: "8px 10px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.accentSoft}` as any,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
    boxShadow: `0 10px 20px ${theme.colors.accentGlow}` as any,
  },

  providerIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
  },
  warning: {
    marginTop: 10,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255, 173, 51, 0.12)",
    padding: 14,
  },
  squareIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    background: "rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  signOut: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255, 60, 60, 0.12)",
    color: "#FF6060",
    fontWeight: 900,
  },

  // local UI bits
  cardSoft: {
    marginTop: 10,
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  primaryBtn: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryBtn: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerBtn: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255, 60, 60, 0.12)",
    color: "#FF6060",
    fontWeight: 900,
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    marginTop: 10,
    minHeight: 84,
    resize: "vertical",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(0,0,0,0.20)",
    color: "white",
    padding: 12,
    outline: "none",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modalCard: {
    width: "min(520px, 100%)",
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(18,18,18,0.96)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.65)",
    padding: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
  },
  modalSeedBox: {
    marginTop: 14,
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.22)",
    padding: 12,
  },
  revealInput: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}` as any,
    background: "rgba(0,0,0,0.25)",
    color: "white",
    padding: "0 12px",
    outline: "none",
    fontWeight: 900,
    letterSpacing: 1,
  },

  seedBox: {
    marginTop: 12,
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(0,0,0,0.22)",
    padding: 12,
  },
};