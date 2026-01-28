"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { theme } from "./lib/theme";
import { LogActivityButton } from "./components/LogActivityButton";
import { fetchProvidersStatus, formatTimeAgo } from "./lib/providerStatus";
import { useActiveWallet } from "./lib/mockAuth";

// =============================
// CONFIG
// =============================
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";

// Claim contract you deployed (FitRewardsClaim) — also the FIT token contract (ERC20)
const CLAIM_CONTRACT_ADDRESS =
  (process.env.NEXT_PUBLIC_CLAIM_CONTRACT?.trim() as `0x${string}` | undefined) ??
  ("0x24714F0e7a9cCf566E6cfb30B9153303f5667A64" as const);

// In this prototype, FitRewardsClaim is the ERC20, so balanceOf should be read from the same address.
const FIT_TOKEN_ADDRESS = CLAIM_CONTRACT_ADDRESS;

// Display symbol (keep contract symbol as FIT; UI can show $FIT safely)
const FIT_SYMBOL_UI = "$FIT";

// Prototype conversion rate: 1 FIT -> USD
const FIT_USD_RATE = Number(process.env.NEXT_PUBLIC_FIT_USD_RATE || "0");



// If you want to hide Mock tools in production, flip this to false
const SHOW_DEV_TOOLS = true;

// For demo workout timer (you said 30 seconds)
const DEMO_WORKOUT_SECONDS = 30;

// =============================
// Types
// =============================
type ModalStage = "IDLE" | "WALLET" | "SUBMITTED" | "CONFIRMED" | "ERROR";

type ToastKind = "success" | "error" | "info";
type Toast = { id: string; kind: ToastKind; message: string };

type ClaimActivity = {
  id: string;
  provider: string;
  providerActivityId: string;
  type: "RUN" | "WALK";
  startTime: string;
  durationSec: number;
  distanceM: number;
  avgSpeedMps: number;
  intensityScore: number;
  genuineScore: number;
  fitEarned: number;
};

type ClaimPreviewResponse = {
  ok: boolean;
  dayKey: string;
  dailyCap: number;
  alreadyClaimed: number;
  remainingCap: number;
  totalUncapped: number;
  claimableFit: number;
  activities: ClaimActivity[];
};

type PrepareResponse =
  | {
      ok: true;
      claimId: string | null;
      amountFit: number;
      status:
        | "PENDING"
        | "NOTHING_TO_CLAIM"
        | "DAILY_CAP_REACHED"
        | "NOT_CONNECTED";
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

// =============================
// Minimal ABI (with multiple possible claimWithSig shapes)
// We include multiple variants so we can “try” whichever matches your contract.
// =============================
const FIT_REWARDS_CLAIM_ABI = [
  // reads
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getUser",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "lastActivityDay", type: "uint256" },
      { name: "streak", type: "uint256" },
      { name: "totalEarned", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "todayDayIndex",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },

  // demo mint (your confirm activity flow)
  {
    type: "function",
    name: "logActivity",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },

  // claimWithSig (matches contracts/FitRewardsClaim.sol)
  // claimWithSig(amountWei, claimIdHash, deadline, signature)
  {
    type: "function",
    name: "claimWithSig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountWei", type: "uint256" },
      { name: "claimIdHash", type: "bytes32" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// =============================
// Helpers
// =============================
function shortAddr(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatFit(n: number) {
  if (!Number.isFinite(n)) return "0";
  // keep it nice for demo
  return n >= 100 ? n.toFixed(2) : n.toFixed(3);
}

function formatWeiToFit(wei?: bigint) {
  if (!wei) return "0";
  const asNum = Number(wei) / 1e18;
  if (!Number.isFinite(asNum)) return "0";
  return asNum >= 100 ? asNum.toFixed(2) : asNum.toFixed(3);
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

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// =============================
// Page
// =============================
export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address: activeAddress, source: walletSource } = useActiveWallet();
  const isSignedIn = Boolean(activeAddress);

  const { address, isConnected, connector, chainId } = useAccount();
  const isOnBaseSepolia = chainId === baseSepolia.id;

  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const {
    data: walletNativeBalance,
    refetch: refetchWalletNativeBalance,
    isFetching: isFetchingNativeBalance,
  } = useBalance({
    address,
  });

  const {
    data: userStats,
    refetch: refetchUserStats,
    isFetching: isFetchingUserStats,
  } = useReadContract({
    address: CLAIM_CONTRACT_ADDRESS,
    abi: FIT_REWARDS_CLAIM_ABI,
    functionName: "getUser",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const {
    data: fitBalanceWei,
    refetch: refetchFitBalance,
    isFetching: isFetchingFitBalance,
  } = useReadContract({
    address: FIT_TOKEN_ADDRESS,
    abi: FIT_REWARDS_CLAIM_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContractAsync } = useWriteContract();

  // Track what the active tx is for (so we can do post-confirm hooks)
  const [activeTxKind, setActiveTxKind] = useState<"ACTIVITY" | "CLAIM" | null>(null);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);

  // TX receipt tracking
  const [activeTxHash, setActiveTxHash] = useState<`0x${string}` | null>(null);
  const { isLoading: isWaiting, isSuccess: txConfirmed, isError: txFailed } =
    useWaitForTransactionReceipt({
      hash: activeTxHash ?? undefined,
    });

  // UI state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = nowId();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  // Workout demo
  const [workoutRunning, setWorkoutRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(DEMO_WORKOUT_SECONDS);
  const workoutTimerRef = useRef<number | null>(null);

  // Tx modal + mini card (stay until close)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState<ModalStage>("IDLE");
  const [modalTitle, setModalTitle] = useState("Transaction");
  const [modalBody, setModalBody] = useState<string>("");

  const [miniCardOpen, setMiniCardOpen] = useState(false);
  const [miniCardTitle, setMiniCardTitle] = useState("Latest Tx");
  const [miniCardBody, setMiniCardBody] = useState<string>("");
  const [miniCardHash, setMiniCardHash] = useState<`0x${string}` | null>(null);

  const closeModalNow = useCallback(() => {
    setModalOpen(false);
    setModalStage("IDLE");
    setModalTitle("Transaction");
    setModalBody("");
  }, []);

  const closeMiniCard = useCallback(() => {
    setMiniCardOpen(false);
    setMiniCardTitle("Latest Tx");
    setMiniCardBody("");
    setMiniCardHash(null);
  }, []);

  // Confetti (generated only on success, not during render)
  const [confetti, setConfetti] = useState<
    {
      id: string;
      leftPct: number;
      delayS: number;
      sizePx: number;
      rotateDeg: number;
      durationS: number;
      emoji: string;
    }[]
  >([]);
  const triggerConfetti = useCallback(() => {
    const emojis = ["🎉", "✨", "🟦", "🟩", "🟨"];
    const pieces = Array.from({ length: 18 }, () => {
      const leftPct = Math.random() * 100;
      const delayS = Math.random() * 0.15;
      const sizePx = 8 + Math.random() * 10;
      const rotateDeg = Math.random() * 360;
      const durationS = 0.9 + Math.random() * 0.6;
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      return {
        id: nowId(),
        leftPct,
        delayS,
        sizePx,
        rotateDeg,
        durationS,
        emoji,
      };
    });
    setConfetti(pieces);

    // auto clear after ~2s
    setTimeout(() => setConfetti([]), 2200);
  }, []);

  // Claim module UI
  const [claimPreview, setClaimPreview] = useState<ClaimPreviewResponse | null>(
    null
  );
  const [claimLoading, setClaimLoading] = useState(false);
  const [homePreviewLoading, setHomePreviewLoading] = useState(false);

  const claimableFit = claimPreview?.claimableFit ?? 0;
  const remainingCap = claimPreview?.remainingCap ?? 0;

  const canClaim =
    Boolean(isSignedIn) &&
    !homePreviewLoading &&
    !claimLoading &&
    claimableFit > 0;

  // Keep track of “balance before tx” to compute minted amount on demo logActivity
  const balanceBeforeTxRef = useRef<bigint | null>(null);

  // Auto-load claim preview so Home reflects claimable rewards + today's activities.
  useEffect(() => {
    if (!activeAddress) {
      setClaimPreview(null);
      setHomePreviewLoading(false);
      return;
    }

    setHomePreviewLoading(true);
    fetch(`${API_BASE_URL}/claim/preview?wallet=${activeAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setClaimPreview(j);
      })
      .catch(() => {
        // keep silent; home can still render
      })
      .finally(() => setHomePreviewLoading(false));
  }, [activeAddress]);

  // =============================
  // Network switch banner logic
  // (always reappears if you switch away again)
  // =============================
  const shouldShowNetworkBanner = false;

  // Provider status (real backend-driven)
  const [lastSyncText, setLastSyncText] = useState("—");
  const [stravaConnected, setStravaConnected] = useState(false);

  useEffect(() => {
    if (!activeAddress) {
      setLastSyncText("—");
      setStravaConnected(false);
      return;
    }

    fetchProvidersStatus(API_BASE_URL, activeAddress)
      .then((j) => {
        const strava = j.providers?.find((p) => p.provider === "STRAVA");
        setStravaConnected(Boolean(strava?.connected));
        setLastSyncText(formatTimeAgo(strava?.lastActivityAt ?? null));
      })
      .catch(() => {
        // keep UI resilient
        setLastSyncText("—");
        setStravaConnected(false);
      });
  }, [activeAddress]);

  const streakCount = userStats?.[1] ? Number(userStats[1]) : 0;

  const weekDots = useMemo(() => {
    const labels = ["M","T","W","T","F","S","S"];
    const s = Math.max(0, Math.min(7, Number(streakCount || 0)));
    // mark the first s dots for now (simple prototype)
    return labels.map((label, i) => ({ label, active: i < s }));
  }, [streakCount]);

  const capPct = useMemo(() => {
    const cap = Number(remainingCap || 500);
    const val = Math.max(0, Math.min(cap, Number(claimableFit || 0)));
    return cap > 0 ? Math.round((val / cap) * 100) : 0;
  }, [claimableFit, remainingCap]);

  function badgeForIntensity(score: number) {
    if (score >= 70) return { label: "HIGH", style: styles.badgeHigh };
    if (score >= 40) return { label: "MED", style: styles.badgeMed };
    return { label: "LOW", style: styles.badgeLow };
  }

  const switchToBaseSepolia = useCallback(async () => {
    try {
      // Prefer wagmi switchChain if available
      if (switchChainAsync) {
        await switchChainAsync({ chainId: baseSepolia.id });
        pushToast("success", "Switched to Base Sepolia ✅");
        return;
      }

      // fallback: injected provider request (rare)
      const prov = await connector?.getProvider?.();
      if (prov && typeof (prov as unknown as { request?: unknown }).request === "function") {
        await (prov as unknown as { request: (args: unknown) => Promise<unknown> }).request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + baseSepolia.id.toString(16) }],
        });
        pushToast("success", "Switched to Base Sepolia ✅");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Network switch failed";
      pushToast("error", msg);
    }
  }, [connector, pushToast, switchChainAsync]);

  // =============================
  // Workout timer
  // =============================
  useEffect(() => {
    if (!workoutRunning) return;

    workoutTimerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => {
      if (workoutTimerRef.current) window.clearInterval(workoutTimerRef.current);
      workoutTimerRef.current = null;
    };
  }, [workoutRunning]);

  useEffect(() => {
    if (!workoutRunning) return;
    if (secondsLeft > 0) return;

    // finished
    setWorkoutRunning(false);
    pushToast("success", "Workout complete ✅ Click Confirm Activity to mint.");
  }, [secondsLeft, workoutRunning, pushToast]);

  const startWorkout = useCallback(() => {
    setSecondsLeft(DEMO_WORKOUT_SECONDS);
    setWorkoutRunning(true);
    pushToast("info", `Workout started (${DEMO_WORKOUT_SECONDS}s)`);
  }, [pushToast]);

  // =============================
  // Demo Confirm Activity (logActivity)
  // =============================
  const confirmActivity = useCallback(async () => {
    if (!address) {
      pushToast("error", "Connect a wallet first.");
      return;
    }
    if (!isOnBaseSepolia) {
      pushToast("error", "Please switch to Base Sepolia first.");
      return;
    }

    try {
      balanceBeforeTxRef.current =
        typeof fitBalanceWei === "bigint" ? fitBalanceWei : null;

      setModalOpen(true);
      setModalStage("WALLET");
      setModalTitle("Confirm Activity");
      setModalBody("Approve the transaction in your wallet…");

      const hash = await writeContractAsync({
        address: CLAIM_CONTRACT_ADDRESS,
        abi: FIT_REWARDS_CLAIM_ABI,
        functionName: "logActivity",
        args: [],
      });

      setActiveTxKind("ACTIVITY");
      setActiveTxHash(hash);
      setMiniCardOpen(true);
      setMiniCardTitle("Activity Tx submitted");
      setMiniCardBody("Waiting for confirmation…");
      setMiniCardHash(hash);

      setModalStage("SUBMITTED");
      setModalBody("Transaction submitted. Waiting for confirmation…");
      pushToast("info", "Tx submitted. Waiting for confirmation…");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setModalStage("ERROR");
      setModalBody(msg);
      pushToast("error", msg);
    }
  }, [
    address,
    fitBalanceWei,
    isOnBaseSepolia,
    pushToast,
    writeContractAsync,
  ]);

// =============================
  // Module 3: Claim preview + claim flow
  // =============================
  const refreshClaimPreview = useCallback(async () => {
    if (!activeAddress) {
      pushToast("error", "Sign in first (create/import your wallet)." );
      return;
    }
    setClaimLoading(true);
    try {
      const url = `${API_BASE_URL}/claim/preview?wallet=${activeAddress}`;
      const res = await fetch(url);
      const raw = await res.text();
      if (!raw) throw new Error("Empty response from API");
      const data = JSON.parse(raw) as any;
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (!("ok" in data) || data.ok !== true) {
        const msg = "error" in data ? data.error : "Failed to preview claim.";
        pushToast("error", msg);
        setClaimPreview(null);
        return;
      }

      setClaimPreview(data);
      pushToast("success", "Claim preview updated ✅");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      pushToast("error", msg);
      setClaimPreview(null);
    } finally {
      setClaimLoading(false);
    }
  }, [activeAddress, pushToast]);

  const claimOnchain = useCallback(
    async (payload: {
      amountWei: bigint;
      claimIdHash: `0x${string}`;
      deadline: bigint;
      signature: `0x${string}`;
    }): Promise<`0x${string}`> => {
      // Must match contracts/FitRewardsClaim.sol exactly
      return writeContractAsync({
        address: CLAIM_CONTRACT_ADDRESS,
        abi: FIT_REWARDS_CLAIM_ABI,
        functionName: "claimWithSig",
        args: [payload.amountWei, payload.claimIdHash, payload.deadline, payload.signature],
      });
    },
    [writeContractAsync]
  );

  const claimFit = useCallback(async () => {
    if (!activeAddress) {
      pushToast("error", "Sign in first (create/import your wallet)." );
      return;
    }

    setModalOpen(true);
    setModalStage("WALLET");
    setModalTitle("Claim $FIT");
    setModalBody("Preparing claim…");
    setClaimLoading(true);

    try {
      // 1) prepare (creates claim record + assigns activities)
      const prepRes = await fetch(`${API_BASE_URL}/claim/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress }),
      });
      const prep = (await prepRes.json()) as PrepareResponse;

      // If there was already a pending claim, we just continue it.
      if ("ok" in prep && prep.ok === true && prep.status === "PENDING" && prep.claimId) {
        setModalBody("Claim ready — finalizing…");
      }

      if (!("ok" in prep) || prep.ok !== true) {
        const msg = "error" in prep ? prep.error : "Prepare failed";
        throw new Error(msg);
      }

      if (prep.status !== "PENDING" || !prep.claimId) {
        const msg =
          prep.status === "NOTHING_TO_CLAIM"
            ? "No rewards to claim yet. Tap Log activity first."
            : prep.status === "DAILY_CAP_REACHED"
            ? "Daily cap reached. Come back tomorrow."
            : prep.status === "NOT_CONNECTED"
            ? "No provider connected yet. Tap Log activity to connect/sync."
            : prep.status;

        setModalStage("ERROR");
        setModalBody(msg);
        pushToast("info", msg);
        return;
      }

      // 2) confirm offchain (credit to wallet balance)
      setModalBody("Crediting your wallet…");
      const confRes = await fetch(`${API_BASE_URL}/claim/confirm-inapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress, claimId: prep.claimId }),
      });
      const conf = (await confRes.json()) as any;
      if (!confRes.ok || !conf?.ok) throw new Error(conf?.error || "Confirm failed");

      setModalStage("CONFIRMED");
      setModalBody(
        conf?.credited
          ? `Claimed ${formatFit(Number(prep.amountFit || 0))} ${FIT_SYMBOL_UI} to your wallet ✅\n\nOpen Wallet to view your balance and transactions.`
          : `Claim confirmed ✅\n\nOpen Wallet to view your balance and transactions.`
      );
      pushToast("success", `Claimed ${formatFit(Number(prep.amountFit || 0))} ${FIT_SYMBOL_UI} ✅`);

      // Nudge Wallet page to refresh immediately (same pattern Marketplace uses)
      window.dispatchEvent(new CustomEvent("fitchain:walletUpdated"));

      refreshClaimPreview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim failed";
      setModalStage("ERROR");
      setModalBody(msg);
      pushToast("error", msg);
    } finally {
      setClaimLoading(false);
    }
  }, [activeAddress, pushToast, refreshClaimPreview]);

  // =============================
  // Tx status reaction
  // =============================
  useEffect(() => {
    if (!activeTxHash) return;

    if (txFailed) {
      setModalStage("ERROR");
      setModalBody("Transaction failed or was rejected.");
      setMiniCardTitle("Tx failed");
      setMiniCardBody("The transaction failed or was rejected.");
      pushToast("error", "Tx failed or rejected.");
      return;
    }

    if (!txConfirmed) return;

    // Confirmed
    setModalStage("CONFIRMED");
    setModalBody("Transaction confirmed ✅");
    setMiniCardTitle("Tx confirmed ✅");
    setMiniCardBody("Your FIT state has been refreshed.");

    // If this was a CLAIM tx, confirm it in the backend so activities get marked claimed
    if (activeTxKind === "CLAIM" && pendingClaimId && address) {
      fetch(`${API_BASE_URL}/claim/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, claimId: pendingClaimId, txHash: activeTxHash }),
      }).catch(() => {
        // best-effort; UI will still show the onchain result
      });
    }

    triggerConfetti();
    pushToast("success", "Tx confirmed ✅");

    // refresh reads (no more manual refresh)
    setTimeout(() => {
      refetchFitBalance();
      refetchUserStats();
      refetchWalletNativeBalance();
      refreshClaimPreview();
    }, 600);

    // keep modal open for ~1 minute after confirmation
    const t = window.setTimeout(() => {
      closeModalNow();
    }, 60_000);

    return () => window.clearTimeout(t);
  }, [
    activeTxHash,
    activeTxKind,
    address,
    closeModalNow,
    pendingClaimId,
    pushToast,
    refreshClaimPreview,
    refetchFitBalance,
    refetchUserStats,
    refetchWalletNativeBalance,
    triggerConfetti,
    txConfirmed,
    txFailed,
  ]);

  // derived stats
  const lastActivityDay = userStats?.[0] ? Number(userStats[0]) : 0;
  const streak = userStats?.[1] ? Number(userStats[1]) : 0;
  const totalEarnedWhole = userStats?.[2]
    ? Number(userStats[2]) / 1e18
    : 0;

  const fitBalanceDisplay = useMemo(() => {
    return typeof fitBalanceWei === "bigint" ? formatWeiToFit(fitBalanceWei) : "0";
  }, [fitBalanceWei]);

  const basescanTxUrl = useMemo(() => {
    if (!miniCardHash) return null;
    return `https://sepolia.basescan.org/tx/${miniCardHash}`;
  }, [miniCardHash]);

  // =============================
  // UI
  // =============================
  return (
    <div style={styles.page}>
      {/* Toasts */}
      <div style={styles.toastWrap}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              ...styles.toast,
              ...(t.kind === "success"
                ? styles.toastSuccess
                : t.kind === "error"
                ? styles.toastError
                : styles.toastInfo),
            }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Confetti */}
      {confetti.length > 0 && (
        <div style={styles.confettiLayer}>
          {confetti.map((p) => (
            <div
              key={p.id}
              style={{
                ...styles.confettiPiece,
                left: `${p.leftPct}%`,
                fontSize: `${p.sizePx}px`,
                transform: `rotate(${p.rotateDeg}deg)`,
                animationDelay: `${p.delayS}s`,
                animationDuration: `${p.durationS}s`,
              }}
            >
              {p.emoji}
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={styles.homeHeader}>
        <div style={styles.homeTitle}>FITCHAIN</div>

        {/* Wallet chip */}
        {!mounted ? (
          <div style={styles.walletChip} />
        ) : isConnected ? (
          <Link href="/wallet" style={{ textDecoration: "none" } as any} aria-label="Open wallet">
            <div style={{ ...styles.walletChip, cursor: "pointer" }}>
              <div style={styles.walletDot} />
              <div style={styles.walletAddr}>{shortAddr(address)}</div>
            </div>
          </Link>
        ) : isSignedIn && activeAddress ? (
          <Link href="/wallet" style={{ textDecoration: "none" } as any} aria-label="Open wallet">
            <div style={{ ...styles.walletChip, cursor: "pointer" }}>
              <div style={styles.walletDot} />
              <div style={styles.walletAddr}>{shortAddr(activeAddress)}</div>
              <div style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>wallet</div>
            </div>
          </Link>
        ) : (
          <Link
            href="/settings"
            style={{ ...styles.walletChip, opacity: 0.85, textDecoration: "none" } as any}
            aria-label="Create a wallet"
          >
            <div style={styles.walletDot} />
            <div style={styles.walletAddr}>Create wallet</div>
          </Link>
        )}
      </div>

      {/* Network banner (only blocks Mint/claim) */}
      {shouldShowNetworkBanner && (
        <div style={styles.netBanner}>
          <div style={{ fontWeight: 900 }}>Switch to Base Sepolia to mint $FIT</div>
          <button style={styles.netBannerBtn} onClick={switchToBaseSepolia} disabled={isSwitching}>
            Switch
          </button>
        </div>
      )}

      {/* Today */}
      <div style={styles.cardSoft}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Today</div>
          <div style={styles.providerPill}>
            <span style={styles.providerDot} />
            <span style={{ opacity: 0.9 }}>Strava</span>
            <span style={{ opacity: 0.65, marginLeft: 6 }}>
              {stravaConnected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
          Last sync: {lastSyncText}
        </div>
      </div>

      {/* Streak */}
      <div style={styles.cardSoft}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.streakIcon}>🔥</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{streakCount}</div>
            <div style={{ opacity: 0.7, fontSize: 12, marginTop: 2 }}>Day Streak</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          {weekDots.map((d) => (
            <div key={d.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={d.active ? styles.dayDotActive : styles.dayDot}>
                {d.active ? "✓" : ""}
              </div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <div style={styles.rewardsCard}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Rewards</div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={styles.rewardsBig}>{formatFit(claimableFit)}</div>
          <div style={{ fontWeight: 900, opacity: 0.9 }}>$FIT</div>
        </div>
        <div style={{ marginTop: 6, opacity: 0.75 }}>≈ {formatUsd(fitToUsd(claimableFit))} USD</div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.75 }}>
          <div>Daily Cap</div>
          <div>
            {formatFit(Math.min(claimableFit, remainingCap))} / {formatFit(remainingCap || 500)}
          </div>
        </div>

        <div style={styles.capBar}>
          <div
            style={{
              ...styles.capFill,
              width: `${capPct}%`,
            }}
          />
        </div>

        <button
          style={{
            ...styles.mintBtn,
            opacity: canClaim ? 1 : 0.5,
            cursor: canClaim ? "pointer" : "not-allowed",
            userSelect: "none",
            textAlign: "center",
          }}
          disabled={!canClaim}
          aria-busy={claimLoading || homePreviewLoading}
          onClick={() => {
            if (!canClaim) return;
            claimFit();
          }}
        >
          {claimLoading ? "Claiming…" : homePreviewLoading ? "Checking…" : "Claim to Wallet"}
        </button>

        {isSignedIn && claimableFit <= 0 && !homePreviewLoading && (
          <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12, textAlign: "center" }}>
            No claimable rewards yet — log an activity to generate rewards.
          </div>
        )}

        {!isSignedIn && (
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12, textAlign: "center" }}>
            Create or import a wallet in <Link href="/settings" style={{ color: theme.colors.accent, fontWeight: 900, textDecoration: "none" }}>Settings</Link> to claim.
          </div>
        )}

        <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12, textAlign: "center" }}>
          Unclaimed rewards: 20% burned, 80% carry forward
        </div>
      </div>

      <div style={styles.homeDivider} />

      {/* Today's Activities */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Today's Activities</div>

        {claimPreview?.activities?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {claimPreview.activities.map((a) => (
              <div key={a.id} style={styles.activityRowCard}>
                <div style={styles.activityIconWrap}>{a.type === "RUN" ? "🔥" : "👣"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>{a.type}</div>
                    <div style={badgeForIntensity(a.intensityScore).style}>{badgeForIntensity(a.intensityScore).label}</div>
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.75, fontSize: 12 }}>
                    {Math.round(a.durationSec / 60)}m · {(a.distanceM / 1000).toFixed(1)} km
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: theme.colors.accent, fontWeight: 900 }}>
                    +{formatFit(a.fitEarned)} $FIT
                  </div>
                  <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
                    ≈ {formatUsd(fitToUsd(a.fitEarned))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>
            No activities yet. Tap Log activity to sync from your provider.
          </div>
        )}
      </div>

      {/* Log activity button (same action as Activity tab) */}
      <div style={{ marginTop: 14 }}>
        <LogActivityButton
          apiBaseUrl={API_BASE_URL}
          walletAddress={activeAddress}
          disabled={!isSignedIn || claimLoading}
          pushToast={pushToast}
          onPreviewUpdated={(p) => setClaimPreview(p)}
        />
      </div>
      {/* Mini card (stays until user closes) */}
      {miniCardOpen && (
        <div style={styles.miniCard}>
          <div style={styles.miniCardTop}>
            <b>{miniCardTitle}</b>
            <button style={styles.iconBtn} onClick={closeMiniCard} aria-label="Close">
              ✕
            </button>
          </div>
          <div style={styles.miniCardBody}>{miniCardBody}</div>
          {basescanTxUrl && (
            <a
              href={basescanTxUrl}
              target="_blank"
              rel="noreferrer"
              style={styles.miniCardLink}
            >
              View on BaseScan →
            </a>
          )}
        </div>
      )}

      {/* Modal (stays up to ~1 minute after confirmation, also closable) */}
      {modalOpen && (
        <div style={styles.modalOverlay} onClick={closeModalNow}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTop}>
              <b>{modalTitle}</b>
              <button style={styles.iconBtn} onClick={closeModalNow} aria-label="Close">
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.stageRow}>
                <span style={styles.stageLabel}>Status</span>
                <span style={styles.stageValue}>
                  {modalStage === "WALLET"
                    ? "Awaiting wallet…"
                    : modalStage === "SUBMITTED"
                    ? isWaiting
                      ? "Pending confirmation…"
                      : "Submitted…"
                    : modalStage === "CONFIRMED"
                    ? "Confirmed ✅"
                    : modalStage === "ERROR"
                    ? "Error"
                    : "—"}
                </span>
              </div>

              <div style={{ marginTop: 10 }}>{modalBody}</div>

              {activeTxHash && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.dim}>Tx Hash</div>
                  <div style={styles.mono}>{activeTxHash}</div>
                  <a
                    href={`https://sepolia.basescan.org/tx/${activeTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.miniCardLink}
                  >
                    View on BaseScan →
                  </a>
                </div>
              )}

              <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                {modalStage === "ERROR" ? (
                  <>
                    <button
                      style={styles.primaryBtn}
                      onClick={() => {
                        closeModalNow();
                        // re-run claim flow
                        setTimeout(() => claimFit(), 50);
                      }}
                    >
                      Try again
                    </button>
                    <button style={styles.secondaryBtn} onClick={closeModalNow}>
                      Close
                    </button>
                  </>
                ) : modalStage === "CONFIRMED" ? (
                  <>
                    <button style={styles.primaryBtn} onClick={closeModalNow}>
                      Done
                    </button>
                    <a href="/wallet" style={styles.secondaryBtn as any}>
                      View Wallet
                    </a>
                  </>
                ) : (
                  <button style={styles.secondaryBtn} onClick={closeModalNow}>
                    Close
                  </button>
                )}
              </div>

              {modalStage === "CONFIRMED" && (
                <div style={styles.hint}>
                  Modal auto closes in ~1 minute (or you can close it now).
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================
// Styles (simple, clean)
// =============================
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(1200px 800px at 50% -20%, rgba(204,255,0,0.22) 0%, rgba(0,0,0,0) 60%), linear-gradient(180deg, #05070B 0%, #000000 75%)",
    color: "white",
    padding: 18,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  brand: {
    fontSize: 26,
    fontWeight: 800,
    letterSpacing: 0.3,
  },
  sub: {
    opacity: 0.8,
    marginTop: 4,
    fontSize: 13,
  },
  rightTop: { display: "flex", alignItems: "center", gap: 10 },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 999,
    padding: "10px 12px",
  },
  linkBtn: {
    marginLeft: 10,
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    textDecoration: "underline",
    fontSize: 12,
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255, 196, 0, 0.12)",
    marginBottom: 16,
  },
  bannerBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.10)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    position: "relative",
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    marginBottom: 12,
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.10)",
    margin: "14px 0",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 800,
    opacity: 0.9,
    marginBottom: 8,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: theme.radius.btn,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.accent,
    boxShadow: `0 10px 26px ${theme.colors.accentGlow}`,
    color: theme.colors.accentText,
    cursor: "pointer",
    fontWeight: 900,
  },
  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginTop: 8,
  },
  kpi: {
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
  },
  kpiLabel: { opacity: 0.7, fontSize: 12 },
  kpiValue: { fontSize: 20, fontWeight: 900, marginTop: 6 },
  kpiUnit: { fontSize: 12, opacity: 0.8, marginLeft: 6, fontWeight: 700 },
  metaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginTop: 12,
  },
  meta: {
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.14)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },
  metaKey: { fontSize: 12, opacity: 0.7 },
  metaVal: { fontSize: 12, fontWeight: 800, opacity: 0.95 },
  timerBox: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.20)",
    minWidth: 120,
  },
  timerLabel: { fontSize: 11, opacity: 0.7 },
  timerValue: { fontSize: 18, fontWeight: 900, marginTop: 4 },
  hint: {
    marginTop: 10,
    fontSize: 12,
    opacity: 0.75,
    lineHeight: 1.45,
  },
  dim: { opacity: 0.7, fontSize: 12 },
  mono: {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    wordBreak: "break-all",
    opacity: 0.9,
  },

  activityList: { display: "flex", flexDirection: "column", gap: 10, marginTop: 10 },
  activityItem: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.16)",
    padding: 12,
  },
  activityTop: { fontSize: 13, marginBottom: 6 },
  activityRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 12,
    opacity: 0.85,
  },
  activityEarn: {
    marginTop: 8,
    fontWeight: 900,
    fontSize: 14,
  },

  toastWrap: {
    position: "fixed",
    top: 18,
    right: 18,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  toast: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.45)",
    fontSize: 13,
    maxWidth: 360,
  },
  toastSuccess: { borderColor: "rgba(0, 255, 180, 0.35)" },
  toastError: { borderColor: "rgba(255, 80, 80, 0.40)" },
  toastInfo: { borderColor: theme.colors.accentSoft },

  miniCard: {
    position: "fixed",
    bottom: 18,
    right: 18,
    width: 320,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.55)",
    padding: 12,
    zIndex: 9999,
    boxShadow: "0 12px 35px rgba(0,0,0,0.35)",
  },
  miniCardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  miniCardBody: { marginTop: 8, fontSize: 13, opacity: 0.9, lineHeight: 1.4 },
  miniCardLink: {
    display: "inline-block",
    marginTop: 10,
    fontSize: 13,
    color: theme.colors.accent,
    textDecoration: "underline",
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    padding: 18,
  },
  modalCard: {
    width: "min(560px, 92vw)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(10, 12, 20, 0.92)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
    overflow: "hidden",
  },
  modalTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
  },
  modalBody: { padding: 14, fontSize: 13, opacity: 0.92, lineHeight: 1.55 },
  stageRow: { display: "flex", justifyContent: "space-between", gap: 10 },
  stageLabel: { opacity: 0.7 },
  stageValue: { fontWeight: 900 },

  iconBtn: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    width: 36,
    height: 36,
    color: "white",
    cursor: "pointer",
    fontWeight: 900,
  },

  confettiLayer: {
    pointerEvents: "none",
    position: "fixed",
    inset: 0,
    zIndex: 9998,
    overflow: "hidden",
  },
  confettiPiece: {
    position: "absolute",
    top: -10,
    animationName: "fall",
    animationTimingFunction: "cubic-bezier(0.2, 0.6, 0.2, 1)",
    animationFillMode: "forwards",
  },

  // ===== Home (screenshot-inspired) =====
  homeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  homeTitle: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 0.8,
  },
  walletChip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    minWidth: 132,
    justifyContent: "center",
  },
  walletDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: theme.colors.accent,
    boxShadow: `0 0 18px ${theme.colors.accentGlow}`,
  },
  walletAddr: {
    fontWeight: 900,
    fontSize: 13,
    opacity: 0.95,
  },
  netBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    border: `1px solid ${theme.colors.accentSoft}`,
    background: theme.colors.accentSoft,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  netBannerBtn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.accent,
    color: theme.colors.accentText,
    fontWeight: 900,
    cursor: "pointer",
  },
  cardSoft: {
    borderRadius: 20,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 16,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
    marginBottom: 12,
  },
  providerPill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.04)",
    fontSize: 12,
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: theme.colors.success,
  },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.colors.accentSoft,
    boxShadow: `0 10px 20px ${theme.colors.accentGlow}`,
    fontSize: 18,
  },
  dayDot: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.5)",
    fontWeight: 900,
  },
  dayDotActive: {
    width: 36,
    height: 36,
    borderRadius: 999,
    border: `1px solid ${theme.colors.accentSoft}`,
    background: theme.colors.accent,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.colors.accentText,
    fontWeight: 900,
    boxShadow: `0 10px 20px ${theme.colors.accentGlow}`,
  },
  rewardsCard: {
    borderRadius: 18,
    border: `1px solid ${theme.colors.border}`,
    background: `linear-gradient(180deg, rgba(204,255,0,0.20) 0%, rgba(0,0,0,0.10) 80%)`,
    padding: 16,
    boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
    marginBottom: 12,
  },
  rewardsBig: {
    fontSize: 36,
    fontWeight: 900,
    color: "white",
    letterSpacing: 0.2,
  },
  capBar: {
    marginTop: 10,
    height: 10,
    borderRadius: 999,
    background: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  capFill: {
    height: "100%",
    borderRadius: 999,
    background: theme.colors.accent,
    boxShadow: `0 10px 24px ${theme.colors.accentGlow}`,
  },
  mintBtn: {
    marginTop: 12,
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
  activityRowCard: {
    borderRadius: 18,
    border: `1px solid ${theme.colors.border}`,
    background: "rgba(255,255,255,0.06)",
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  activityIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.06)",
    border: `1px solid ${theme.colors.border}`,
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

// inject keyframes
if (typeof document !== "undefined") {
  const id = "fitchain_fall_keyframes";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      @keyframes fall {
        0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}
