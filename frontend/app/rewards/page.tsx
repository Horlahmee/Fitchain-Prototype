"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "../lib/theme";
import { useActiveWallet } from "../lib/mockAuth";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { FIT_REWARDS_CLAIM_ABI } from "../lib/fitRewardsClaimAbi";

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

type ClaimPreviewResponse = {
  ok: boolean;
  dayKey: string;
  dailyCap: number;
  alreadyClaimed: number;
  remainingCap: number;
  totalUncapped: number;
  claimableFit: number;
};

type PrepareResponse =
  | {
      ok: true;
      claimId: string | null;
      amountFit: number;
      status: "PENDING" | "NOTHING_TO_CLAIM" | "DAILY_CAP_REACHED" | "NOT_CONNECTED";
    }
  | { error: string };

type SignResponse =
  | {
      ok: true;
      amountWei: string;
      claimIdHash: `0x${string}`;
      deadline: number;
      nonce: string;
      signature: `0x${string}`;
    }
  | { error: string };

export default function RewardsPage() {
  const { address: activeAddress } = useActiveWallet();
  const [preview, setPreview] = useState<ClaimPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showGoWallet, setShowGoWallet] = useState(false);

  const CLAIM_CONTRACT = (process.env.NEXT_PUBLIC_CLAIM_CONTRACT || "") as `0x${string}`;
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState<{ claimId: string; txHash?: `0x${string}` } | null>(null);

  const { isLoading: txPending, isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: pending?.txHash,
  });

  async function refresh() {
    if (!activeAddress) {
      setPreview(null);
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE_URL}/claim/preview?wallet=${activeAddress}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setPreview(j);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  async function claimToWallet() {
    if (!activeAddress) {
      setMsg("Create or import a wallet first.");
      return;
    }
    if (!CLAIM_CONTRACT || CLAIM_CONTRACT.length < 10) {
      setMsg("Missing NEXT_PUBLIC_CLAIM_CONTRACT.");
      return;
    }

    setClaiming(true);
    setMsg(null);
    setShowGoWallet(false);

    try {
      // 1) Prepare claim in backend (locks activities -> creates RewardClaim)
      const prepRes = await fetch(`${API_BASE_URL}/claim/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress }),
      });
      const prep = (await prepRes.json()) as PrepareResponse;
      if (!prepRes.ok || !("ok" in prep) || prep.ok !== true) {
        const e = "error" in prep ? prep.error : "Prepare failed";
        throw new Error(e);
      }

      if (prep.status !== "PENDING" || !prep.claimId) {
        setMsg(prep.status);
        await refresh();
        return;
      }

      setPending({ claimId: prep.claimId });

      // 2) Ask backend for EIP-712 signature (amountWei, claimIdHash, deadline, signature)
      const signRes = await fetch(`${API_BASE_URL}/claim/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress, claimId: prep.claimId }),
      });
      const sign = (await signRes.json()) as SignResponse;
      if (!signRes.ok || !("ok" in sign) || sign.ok !== true) {
        const e = "error" in sign ? sign.error : "Sign failed";
        throw new Error(e);
      }

      // 3) Execute onchain mint
      const txHash = (await writeContractAsync({
        address: CLAIM_CONTRACT,
        abi: FIT_REWARDS_CLAIM_ABI,
        functionName: "claimWithSig",
        args: [BigInt(sign.amountWei), sign.claimIdHash, BigInt(sign.deadline), sign.signature],
      })) as `0x${string}`;

      setPending({ claimId: prep.claimId, txHash });
      setMsg("Transaction sent. Waiting for confirmation…");

      // 4) We rely on receipt hook; but best-effort confirm immediately too.
      // (Some UIs prefer confirming after receipt; we also do that below in an effect.)
    } catch (e) {
      const err = e as { message?: string };
      setMsg(err?.message || "Claim failed");
      setPending(null);
    } finally {
      setClaiming(false);
    }
  }

  // Confirm backend records once tx is confirmed
  useEffect(() => {
    if (!pending?.claimId || !pending?.txHash) return;
    if (!txConfirmed) return;

    fetch(`${API_BASE_URL}/claim/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: activeAddress, claimId: pending.claimId, txHash: pending.txHash }),
    })
      .then(() => refresh())
      .catch(() => {
        // best-effort; user still got tokens onchain
      });

    setMsg("Claim confirmed onchain ✅");
    setShowGoWallet(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txConfirmed]);

  const claimable = preview?.claimableFit ?? 0;
  const cap = preview?.remainingCap ?? 0;
  const capPct = useMemo(() => {
    const c = Number(cap || 500);
    const v = Math.max(0, Math.min(c, Number(claimable || 0)));
    return c > 0 ? Math.round((v / c) * 100) : 0;
  }, [cap, claimable]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Rewards</div>
        <Link href="/" style={styles.back as any}>
          ← Home
        </Link>
      </div>

      <div style={styles.card}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Claimable</div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 40, fontWeight: 900, color: theme.colors.accent }}>
            {formatFit(claimable)}
          </div>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>{FIT_SYMBOL_UI}</div>
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>≈ {formatUsd(fitToUsd(claimable))} USD</div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
          <div>Daily Cap</div>
          <div>
            {formatFit(Math.min(claimable, cap))} / {formatFit(cap || 500)}
          </div>
        </div>

        <div style={styles.capBar}>
          <div style={{ ...styles.capFill, width: `${capPct}%` }} />
        </div>

        <button
          style={{
            ...styles.primaryBtn,
            marginTop: 14,
            opacity: activeAddress && !claiming ? 1 : 0.7,
          }}
          onClick={claimToWallet}
          disabled={!activeAddress || claiming}
        >
          {claiming ? "Claiming…" : `Claim to Wallet`}
        </button>

        <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
          {activeAddress ? `Wallet: ${activeAddress.slice(0, 6)}…${activeAddress.slice(-4)}` : (
            <>
              Create or import a wallet to claim. <Link href="/settings" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>Create wallet →</Link>
            </>
          )}
          {loading ? " · updating…" : ""}
        </div>

        {msg && (
          <div style={{ marginTop: 10 }} >
            <div style={{ fontWeight: 900, color: msg.includes("✅") ? theme.colors.accent : "#FFB84D" }}>{msg}</div>
            {showGoWallet && (
              <div style={{ marginTop: 8 }}>
                <Link href="/wallet" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>
                  Go to Wallet →
                </Link>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.75, fontSize: 13 }}>
          Your rewards are credited to your wallet balance instantly. You can export your seed phrase anytime.
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
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 900 },
  back: {
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    color: "white",
    textDecoration: "none",
    fontWeight: 900,
  },
  card: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 16,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
  },
  capBar: {
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginTop: 8,
  },
  capFill: {
    height: "100%",
    borderRadius: 999,
    background: theme.colors.accent,
    boxShadow: `0 0 18px ${theme.colors.accentGlow}`,
  },
  primaryBtn: {
    width: "100%",
    padding: "16px 14px",
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: `0 12px 28px ${theme.colors.accentGlow}`,
  },
};
