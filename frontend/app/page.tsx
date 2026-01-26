"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { baseSepolia } from "wagmi/chains";

// =============================
// CONFIG
// =============================
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000";

// Claim contract you deployed (FitRewardsClaim)
const CLAIM_CONTRACT_ADDRESS =
  "0x24714F0e7a9cCf566E6cfb30B9153303f5667A64";

// FIT token contract (FitRewards "old" token)
const FIT_TOKEN_ADDRESS =
  "0xe924F1b1c1a976Cd0D9D23066A83fC648cD38092";


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

function nowId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// =============================
// Page
// =============================
export default function Page() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
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

  const claimableFit = claimPreview?.claimableFit ?? 0;
  const remainingCap = claimPreview?.remainingCap ?? 0;

  // Keep track of “balance before tx” to compute minted amount on demo logActivity
  const balanceBeforeTxRef = useRef<bigint | null>(null);

  // =============================
  // Network switch banner logic
  // (always reappears if you switch away again)
  // =============================
  const shouldShowNetworkBanner = isConnected && !isOnBaseSepolia;

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
    if (!address) {
      pushToast("error", "Connect a wallet first.");
      return;
    }
    setClaimLoading(true);
    try {
      const url = `${API_BASE_URL}/claim/preview?wallet=${address}`;
      const res = await fetch(url);
      const data = (await res.json()) as ClaimPreviewResponse | { error: string };

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
  }, [address, pushToast]);

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
    if (!address) {
      pushToast("error", "Connect a wallet first.");
      return;
    }
    if (!isOnBaseSepolia) {
      pushToast("error", "Please switch to Base Sepolia first.");
      return;
    }

    setModalOpen(true);
    setModalStage("WALLET");
    setModalTitle("Claim FIT");
    setModalBody("Preparing claim…");

    try {
      // 1) prepare (creates claim record + assigns activities)
      const prepRes = await fetch(`${API_BASE_URL}/claim/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address }),
      });
      const prep = (await prepRes.json()) as PrepareResponse;

      if (!("ok" in prep) || prep.ok !== true) {
        const msg = "error" in prep ? prep.error : "Prepare failed";
        throw new Error(msg);
      }

      if (prep.status !== "PENDING" || !prep.claimId) {
        // nothing to claim / cap reached / not connected
        setModalStage("ERROR");
        setModalBody(prep.status);
        pushToast("info", prep.status);
        return;
      }

      setModalBody("Signing claim payload…");

      // 2) sign (backend returns signature)
      const signRes = await fetch(`${API_BASE_URL}/claim/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, claimId: prep.claimId }),
      });
      const signed = (await signRes.json()) as SignResponse;

      if (!("ok" in signed) || signed.ok !== true) {
        const msg = "error" in signed ? signed.error : "Sign failed";
        throw new Error(msg);
      }

      const amountWei = BigInt(signed.amountWei);
      const deadline = BigInt(String(signed.deadline));

      // Keep claimId around so we can confirm it in the DB after tx confirms
      setPendingClaimId(prep.claimId);

      setModalBody("Approve the claim transaction in your wallet…");

      // 3) claim onchain
      const hash = await claimOnchain({
        amountWei,
        claimIdHash: signed.claimIdHash,
        deadline,
        signature: signed.signature,
      });

      setActiveTxKind("CLAIM");
      setActiveTxHash(hash);
      setMiniCardOpen(true);
      setMiniCardTitle("Claim Tx submitted");
      setMiniCardBody(`Claiming ~${formatFit(prep.amountFit)} FIT…`);
      setMiniCardHash(hash);

      setModalStage("SUBMITTED");
      setModalBody("Claim submitted. Waiting for confirmation…");
      pushToast("info", "Claim submitted. Waiting for confirmation…");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Claim failed";
      setModalStage("ERROR");
      setModalBody(msg);
      pushToast("error", msg);
    }
  }, [address, isOnBaseSepolia, pushToast, claimOnchain]);

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
      <div style={styles.header}>
        <div>
          <div style={styles.brand}>FitChain</div>
          <div style={styles.sub}>
            Proof-of-Sweat → Onchain Rewards (Base Sepolia prototype)
          </div>
        </div>
        <div style={styles.rightTop}>
          {isConnected ? (
            <div style={styles.pill}>
              <span style={{ marginRight: 8 }}>Connected:</span>
              <b>{shortAddr(address)}</b>
              <button style={styles.linkBtn} onClick={() => disconnect()}>
                Disconnect
              </button>
            </div>
          ) : (
            <div style={styles.pill}>
              {connectors
                .filter((c) => c.id !== "injected" || c.name)
                .map((c) => (
                  <button
                    key={c.id}
                    style={styles.primaryBtn}
                    disabled={isConnecting}
                    onClick={() => connect({ connector: c })}
                  >
                    Connect {c.name ?? "Wallet"}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Network banner */}
      {shouldShowNetworkBanner && (
        <div style={styles.banner}>
          <div>
            You’re on the wrong network. Switch to <b>Base Sepolia</b> to use
            FitChain.
          </div>
          <button
            style={styles.bannerBtn}
            onClick={switchToBaseSepolia}
            disabled={isSwitching}
          >
            Switch to Base Sepolia
          </button>
        </div>
      )}

      {/* Main grid */}
      <div style={styles.grid}>
        {/* Left: Dashboard */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Dashboard</div>

          <div style={styles.kpiRow}>
            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>FIT Balance</div>
              <div style={styles.kpiValue}>
                {isFetchingFitBalance ? "…" : fitBalanceDisplay}{" "}
                <span style={styles.kpiUnit}>FIT</span>
              </div>
            </div>

            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>Streak</div>
              <div style={styles.kpiValue}>{isFetchingUserStats ? "…" : streak}</div>
            </div>

            <div style={styles.kpi}>
              <div style={styles.kpiLabel}>Total Earned</div>
              <div style={styles.kpiValue}>
                {isFetchingUserStats ? "…" : formatFit(totalEarnedWhole)}{" "}
                <span style={styles.kpiUnit}>FIT</span>
              </div>
            </div>
          </div>

          <div style={styles.metaRow}>
            <div style={styles.meta}>
              <span style={styles.metaKey}>Chain</span>
              <span style={styles.metaVal}>
                {isConnected ? (isOnBaseSepolia ? "Base Sepolia ✅" : `ChainId ${chainId}`) : "—"}
              </span>
            </div>
            <div style={styles.meta}>
              <span style={styles.metaKey}>Gas (native)</span>
              <span style={styles.metaVal}>
                {isFetchingNativeBalance ? "…" : walletNativeBalance?.value ? (Number(walletNativeBalance.value) / 1e18).toFixed(4) : "0"}{" "}
                {walletNativeBalance?.symbol ?? ""}
              </span>
            </div>
            <div style={styles.meta}>
              <span style={styles.metaKey}>Last Activity Day</span>
              <span style={styles.metaVal}>{isFetchingUserStats ? "…" : lastActivityDay}</span>
            </div>
          </div>

          <div style={styles.divider} />

          {/* Workout Demo */}
          <div style={styles.sectionTitle}>Workout Demo</div>
          <div style={styles.row}>
            <button
              style={styles.primaryBtn}
              onClick={startWorkout}
              disabled={!isConnected || !isOnBaseSepolia || workoutRunning}
              title={!isOnBaseSepolia ? "Switch to Base Sepolia" : ""}
            >
              Start Workout ({DEMO_WORKOUT_SECONDS}s)
            </button>

            <div style={styles.timerBox}>
              <div style={styles.timerLabel}>Countdown</div>
              <div style={styles.timerValue}>
                {workoutRunning ? secondsLeft : "—"}
              </div>
            </div>

            <button
              style={styles.secondaryBtn}
              onClick={confirmActivity}
              disabled={!isConnected || !isOnBaseSepolia || workoutRunning || secondsLeft > 0}
              title={
                workoutRunning
                  ? "Wait for workout to finish"
                  : secondsLeft > 0
                  ? "Start workout first"
                  : ""
              }
            >
              Confirm Activity → Mint
            </button>
          </div>

          <div style={styles.hint}>
            Tip: If you already logged today, the contract may revert with
            “Already logged today” (we kept the daily limit for realism).
          </div>
        </div>

        {/* Right: Claim Module (Module 3) */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Module 3 — Claim FIT (API Proof)</div>

          <div style={styles.row}>
            <button
              style={styles.primaryBtn}
              onClick={() => refreshClaimPreview()}
              disabled={!isConnected || claimLoading}
            >
              {claimLoading ? "Refreshing…" : "Refresh Claim Preview"}
            </button>

            <button
              style={styles.secondaryBtn}
              onClick={claimFit}
              disabled={
                !isConnected ||
                !isOnBaseSepolia ||
                claimLoading ||
                !claimPreview ||
                claimableFit <= 0 ||
                remainingCap <= 0
              }
              title={!isOnBaseSepolia ? "Switch to Base Sepolia" : ""}
            >
              Claim FIT
            </button>
          </div>

          {!isConnected && (
            <div style={styles.hint}>
              Connect your wallet to preview claimable FIT from activities.
            </div>
          )}

          {claimPreview && (
            <div style={{ marginTop: 14 }}>
              <div style={styles.kpiRow}>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Day</div>
                  <div style={styles.kpiValue}>{claimPreview.dayKey}</div>
                </div>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Daily Cap</div>
                  <div style={styles.kpiValue}>
                    {formatFit(claimPreview.dailyCap)} <span style={styles.kpiUnit}>FIT</span>
                  </div>
                </div>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Remaining Cap</div>
                  <div style={styles.kpiValue}>
                    {formatFit(claimPreview.remainingCap)}{" "}
                    <span style={styles.kpiUnit}>FIT</span>
                  </div>
                </div>
              </div>

              <div style={styles.kpiRow}>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Already Claimed</div>
                  <div style={styles.kpiValue}>
                    {formatFit(claimPreview.alreadyClaimed)}{" "}
                    <span style={styles.kpiUnit}>FIT</span>
                  </div>
                </div>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Total (uncapped)</div>
                  <div style={styles.kpiValue}>
                    {formatFit(claimPreview.totalUncapped)}{" "}
                    <span style={styles.kpiUnit}>FIT</span>
                  </div>
                </div>
                <div style={styles.kpi}>
                  <div style={styles.kpiLabel}>Claimable Now</div>
                  <div style={styles.kpiValue}>
                    {formatFit(claimPreview.claimableFit)}{" "}
                    <span style={styles.kpiUnit}>FIT</span>
                  </div>
                </div>
              </div>

              <div style={styles.divider} />

              {claimPreview.remainingCap <= 0 ? (
                <div style={styles.hint}>
                  Daily cap reached ✅ Activities are hidden (as requested).
                </div>
              ) : (
                <>
                  <div style={styles.sectionTitle}>Activities (today)</div>
                  {claimPreview.activities.length === 0 ? (
                    <div style={styles.hint}>
                      No activities found yet. If Strava is empty, use the mock
                      tool to test the full pipeline.
                    </div>
                  ) : (
                    <div style={styles.activityList}>
                      {claimPreview.activities.map((a) => (
                        <div key={a.id} style={styles.activityItem}>
                          <div style={styles.activityTop}>
                            <b>{a.type}</b>{" "}
                            <span style={styles.dim}>
                              · {a.provider} · {new Date(a.startTime).toLocaleString()}
                            </span>
                          </div>
                          <div style={styles.activityRow}>
                            <span>Duration: {Math.round(a.durationSec / 60)} min</span>
                            <span>Distance: {(a.distanceM / 1000).toFixed(2)} km</span>
                            <span>Intensity: {a.intensityScore}</span>
                            <span>Genuine: {a.genuineScore}</span>
                          </div>
                          <div style={styles.activityEarn}>
                            +{formatFit(a.fitEarned)} FIT
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {SHOW_DEV_TOOLS && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.sectionTitle}>Dev Tools</div>
                  <button
                    style={styles.secondaryBtn}
                    disabled={!isConnected}
                    onClick={async () => {
                      if (!address) return;
                      try {
                        const r = await fetch(`${API_BASE_URL}/dev/mock-activity`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ wallet: address }),
                        });
                        const j = (await r.json()) as { ok?: boolean; error?: string };
                        if (j.ok) {
                          pushToast("success", "Mock activity inserted ✅");
                          refreshClaimPreview();
                        } else {
                          pushToast("error", j.error ?? "Mock failed");
                        }
                      } catch (e) {
                        pushToast("error", e instanceof Error ? e.message : "Mock failed");
                      }
                    }}
                  >
                    Insert Mock Activity
                  </button>
                  <div style={styles.hint}>
                    This is only for testing while Strava is empty.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
                <button style={styles.secondaryBtn} onClick={closeModalNow}>
                  Close
                </button>
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
    background: "linear-gradient(180deg, #0b1020 0%, #070a12 70%)",
    color: "white",
    padding: 24,
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
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(120, 90, 255, 0.35)",
    color: "white",
    cursor: "pointer",
    fontWeight: 800,
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
  toastInfo: { borderColor: "rgba(120, 140, 255, 0.35)" },

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
    color: "rgba(190, 200, 255, 0.95)",
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
    width: 34,
    height: 34,
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
