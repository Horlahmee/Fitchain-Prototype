"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits } from "viem";

const CONTRACT_ADDRESS =
  "0xe924F1b1c1a976Cd0D9D23066A83fC648cD38092" as const;

const BASESCAN_ADDRESS_URL = `https://sepolia.basescan.org/address/${CONTRACT_ADDRESS}`;

const ABI = [
  {
    type: "function",
    name: "logActivity",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "getUser",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "lastDay", type: "uint32" },
      { name: "streak", type: "uint16" },
      { name: "totalEarnedWhole", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

type ModalStage = "idle" | "wallet" | "submitted" | "confirmed" | "error";

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function secondsUntilNextUtcMidnight() {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
  return Math.floor((next.getTime() - now.getTime()) / 1000);
}

function shortHash(h: string) {
  if (!h) return "";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function Spinner() {
  return (
    <span
      aria-label="Loading"
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid #ddd",
        borderTopColor: "#111",
        display: "inline-block",
        animation: "spin 1s linear infinite",
      }}
    />
  );
}

type ConfettiPiece = {
  id: number;
  left: number;
  delay: number;
  size: number;
  rotate: number;
  duration: number;
  emoji: string;
};

function makeConfettiPieces(count = 20): ConfettiPiece[] {
  const emojis = ["🎉", "✨", "🟩", "🟦", "🟨"];
  return Array.from({ length: count }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.15;
    const size = 10 + Math.random() * 10;
    const rotate = Math.random() * 360;
    const duration = 0.9 + Math.random() * 0.5;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    return { id: i, left, delay, size, rotate, duration, emoji };
  });
}

function ConfettiBurst({
  show,
  pieces,
}: {
  show: boolean;
  pieces: ConfettiPiece[];
}) {
  if (!show) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            top: -10,
            left: `${p.left}%`,
            fontSize: p.size,
            transform: `rotate(${p.rotate}deg)`,
            animation: `fall ${p.duration}s ease-out ${p.delay}s forwards`,
            pointerEvents: "none",
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}

function StepRow({
  done,
  active,
  label,
}: {
  done: boolean;
  active: boolean;
  label: string;
}) {
  const dot = done ? "✅" : active ? "⏳" : "•";
  const color = done ? "#0a7a2f" : active ? "#111" : "#777";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", color }}>
      <span style={{ width: 18, textAlign: "center" }}>{dot}</span>
      <span style={{ fontSize: 13, fontWeight: active || done ? 900 : 600 }}>
        {label}
      </span>
    </div>
  );
}

type Toast = {
  id: number;
  title: string;
  message: string;
  href?: string;
};

function animateNumber(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (val: number) => void
) {
  const start = performance.now();
  const diff = to - from;

  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    onUpdate(from + diff * eased);
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function clampDecimals(s: string, maxDp = 6) {
  if (!s.includes(".")) return s;
  const [a, b] = s.split(".");
  return `${a}.${(b ?? "").slice(0, maxDp)}`;
}

export default function Home() {
  const { address, isConnected, chain, chainId, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<string>("");

  // 30s demo workout flow
  const [workoutActive, setWorkoutActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Switch network button state
  const [isSwitching, setIsSwitching] = useState(false);

  // tx confirmation + auto-refresh
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);
  const { isSuccess: isConfirmed, isError: isTxError } =
    useWaitForTransactionReceipt({
      hash: pendingHash ?? undefined,
    });

  // modal overlay
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStage, setModalStage] = useState<ModalStage>("idle");
  const [modalMessage, setModalMessage] = useState<string>("");

  // keep modal open for 60s after success (or until user closes)
  const modalAutoCloseTimerRef = useRef<number | null>(null);

  // minted amount display
  const [preTxBalanceWei, setPreTxBalanceWei] = useState<bigint | null>(null);
  const [mintedHuman, setMintedHuman] = useState<string | null>(null);

  // latest tx mini card (dismissible)
  const [latestTx, setLatestTx] = useState<{
    hash: `0x${string}`;
    minted?: string | null;
    when: number;
  } | null>(null);
  const [latestTxDismissed, setLatestTxDismissed] = useState(false);

  // confetti
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<ConfettiPiece[]>([]);

  // cooldown ticker
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Animated balance display
  const [balanceDisplay, setBalanceDisplay] = useState<string>("—");
  const lastBalanceNumRef = useRef<number | null>(null);

  const onBaseSepolia = chainId === 84532;

  function clearModalAutoCloseTimer() {
    if (modalAutoCloseTimerRef.current) {
      window.clearTimeout(modalAutoCloseTimerRef.current);
      modalAutoCloseTimerRef.current = null;
    }
  }

  function closeModalNow() {
    clearModalAutoCloseTimer();
    setModalOpen(false);
    setModalStage("idle");
    setModalMessage("");
  }

  async function switchToBaseSepolia() {
    try {
      setIsSwitching(true);
      setStatus("");

      const provider = (await connector?.getProvider()) as
        | {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
          }
        | undefined;

      if (!provider?.request) {
        setStatus(
          "❌ Could not access wallet provider. Disconnect & reconnect wallet."
        );
        return;
      }

      const targetChainId = "0x14A34"; // 84532 in hex

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetChainId }],
        });
      } catch (err: unknown) {
        const maybe = err as { code?: number | string } | undefined;
        if (maybe?.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetChainId,
                chainName: "Base Sepolia",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://sepolia.base.org"],
                blockExplorerUrls: ["https://sepolia.basescan.org"],
              },
            ],
          });

          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainId }],
          });
        } else {
          setStatus("❌ Network switch rejected or failed.");
        }
      }
    } finally {
      setIsSwitching(false);
    }
  }

  const { data: userData, refetch: refetchUser } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "getUser",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: decimals } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "decimals",
    query: { enabled: true },
  });

  const { data: balanceWei, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const balanceHuman = useMemo(() => {
    if (balanceWei == null || decimals == null) return null;
    return formatUnits(balanceWei, decimals);
  }, [balanceWei, decimals]);

  useEffect(() => {
    if (!balanceHuman) {
      setBalanceDisplay("—");
      lastBalanceNumRef.current = null;
      return;
    }

    const next = Number(balanceHuman);
    if (!Number.isFinite(next)) {
      setBalanceDisplay(clampDecimals(balanceHuman));
      lastBalanceNumRef.current = null;
      return;
    }

    const prev = lastBalanceNumRef.current;
    if (prev == null) {
      setBalanceDisplay(clampDecimals(balanceHuman));
      lastBalanceNumRef.current = next;
      return;
    }

    if (Math.abs(next - prev) < 1e-12) {
      setBalanceDisplay(clampDecimals(balanceHuman));
      lastBalanceNumRef.current = next;
      return;
    }

    animateNumber(prev, next, 900, (val) => {
      setBalanceDisplay(clampDecimals(String(val)));
    });

    lastBalanceNumRef.current = next;
  }, [balanceHuman]);

  const hasLoggedToday = useMemo(() => {
    if (!userData) return false;
    const lastDay = Number(userData[0]);
    const today = Math.floor(Date.now() / 1000 / 86400);
    return lastDay === today;
  }, [userData]);

  useEffect(() => {
    let t: number | undefined;

    if (hasLoggedToday) {
      setCooldownSeconds(secondsUntilNextUtcMidnight());
      t = window.setInterval(() => {
        setCooldownSeconds(secondsUntilNextUtcMidnight());
      }, 1000);
    } else {
      setCooldownSeconds(0);
    }

    return () => {
      if (t) window.clearInterval(t);
    };
  }, [hasLoggedToday]);

  function startWorkout() {
    if (!address) return;

    if (!onBaseSepolia) {
      setStatus("❌ Wrong network. Switch to Base Sepolia to start.");
      return;
    }

    if (workoutActive) return;
    if (hasLoggedToday) {
      setStatus("✅ Already logged today. Come back after reset.");
      return;
    }

    setStatus("");
    setMintedHuman(null);
    setWorkoutActive(true);
    setSecondsLeft(30);

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function pushToast(t: Omit<Toast, "id">) {
    const id = Date.now();
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }

  async function handleLogActivity() {
    if (!onBaseSepolia) {
      setStatus("❌ Wrong network. Switch to Base Sepolia.");
      return;
    }

    try {
      setStatus("Preparing transaction...");

      if (typeof balanceWei === "bigint") setPreTxBalanceWei(balanceWei);
      else setPreTxBalanceWei(null);

      setModalOpen(true);
      setModalStage("wallet");
      setMintedHuman(null);
      setModalMessage("Confirm the transaction in your wallet.");

      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "logActivity",
      });

      setStatus(`⏳ Pending: ${txHash}`);
      setPendingHash(txHash);

      setModalStage("submitted");
      setModalMessage("Transaction submitted. Waiting for confirmation…");
    } catch (e: unknown) {
      let msg = "Transaction failed";
      const maybe = e as { shortMessage?: unknown; message?: unknown };
      if (typeof maybe?.shortMessage === "string") msg = maybe.shortMessage;
      else if (typeof maybe?.message === "string") msg = maybe.message;

      setStatus(`❌ ${msg}`);
      setModalOpen(true);
      setModalStage("error");
      setModalMessage(msg);
    }
  }

  useEffect(() => {
    if (!pendingHash) return;

    if (isConfirmed) {
      (async () => {
        setStatus("✅ Confirmed");

        const newUser = await refetchUser();
        const newBal = await refetchBalance();

        const newBalanceWei = newBal.data;

        let minted: string | null = null;
        if (
          typeof preTxBalanceWei === "bigint" &&
          typeof newBalanceWei === "bigint" &&
          decimals != null
        ) {
          const delta = newBalanceWei - preTxBalanceWei;
          if (delta > BigInt(0)) minted = formatUnits(delta, decimals);
        }

        setMintedHuman(minted);

        // Latest Tx card should re-appear for every new successful tx
        setLatestTx({
          hash: pendingHash,
          minted,
          when: Date.now(),
        });
        setLatestTxDismissed(false);

        setModalStage("confirmed");
        const streak =
          newUser.data && Array.isArray(newUser.data)
            ? String(newUser.data[1])
            : null;

        setModalMessage(
          `Confirmed!${streak ? ` Streak: ${streak}.` : ""} Dashboard updated.`
        );

        setConfettiPieces(makeConfettiPieces(20));
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 1300);

        const txUrl = `https://sepolia.basescan.org/tx/${pendingHash}`;

        pushToast({
          title: "✅ Activity Confirmed",
          message: minted ? `Minted +${minted} FIT` : "Minted FIT",
          href: txUrl,
        });

        // Keep modal open for 60 seconds (or until user closes)
        clearModalAutoCloseTimer();
        modalAutoCloseTimerRef.current = window.setTimeout(() => {
          closeModalNow();
        }, 60000);

        setPendingHash(null);
      })();
    } else if (isTxError) {
      setModalOpen(true);
      setModalStage("error");
      setModalMessage("Transaction reverted or failed.");
      setPendingHash(null);
    }
  }, [
    isConfirmed,
    isTxError,
    pendingHash,
    refetchUser,
    refetchBalance,
    decimals,
    preTxBalanceWei,
  ]);

  useEffect(() => {
    // reset on wallet change
    clearModalAutoCloseTimer();
    setWorkoutActive(false);
    setSecondsLeft(0);
    setStatus("");
    setPendingHash(null);
    setModalOpen(false);
    setModalStage("idle");
    setModalMessage("");
    setMintedHuman(null);
    setPreTxBalanceWei(null);
    setShowConfetti(false);
    setLatestTx(null);
    setLatestTxDismissed(false);
    setToasts([]);
    setBalanceDisplay("—");
    lastBalanceNumRef.current = null;
  }, [address]);

  const txUrl = pendingHash
    ? `https://sepolia.basescan.org/tx/${pendingHash}`
    : null;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(220px) rotate(220deg); opacity: 0; }
        }
      `}</style>

      {/* Toasts (bottom-right) */}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 60,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              width: "min(360px, calc(100vw - 32px))",
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: 14,
              padding: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13 }}>{t.title}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#444" }}>
              {t.message}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
              {t.href && (
                <a
                  href={t.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: "#111",
                    textDecoration: "none",
                    border: "1px solid #ddd",
                    padding: "6px 10px",
                    borderRadius: 10,
                  }}
                >
                  View on BaseScan ↗
                </a>
              )}
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{
                  fontSize: 12,
                  border: "1px solid #ddd",
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal overlay */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => {
            // allow closing only when not in wallet/submitted
            if (modalStage === "wallet" || modalStage === "submitted") return;
            closeModalNow();
          }}
        >
          <div
            style={{
              width: "min(620px, 100%)",
              background: "#fff",
              borderRadius: 18,
              border: "1px solid #ddd",
              padding: 16,
              boxShadow: "0 18px 60px rgba(0,0,0,0.30)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ConfettiBurst
              show={showConfetti && modalStage === "confirmed"}
              pieces={confettiPieces}
            />

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {modalStage === "wallet" && "Confirm in Wallet"}
                {modalStage === "submitted" && "Transaction Submitted"}
                {modalStage === "confirmed" && "Success ✅"}
                {modalStage === "error" && "Failed ❌"}
                {modalStage === "idle" && "Transaction"}
              </div>

              <button
                onClick={() => {
                  if (modalStage === "wallet" || modalStage === "submitted") return;
                  closeModalNow();
                }}
                disabled={modalStage === "wallet" || modalStage === "submitted"}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor:
                    modalStage === "wallet" || modalStage === "submitted"
                      ? "not-allowed"
                      : "pointer",
                  opacity: modalStage === "wallet" || modalStage === "submitted" ? 0.5 : 1,
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <StepRow
                done={modalStage !== "wallet"}
                active={modalStage === "wallet"}
                label="Step 1 — Confirm in wallet"
              />
              <StepRow
                done={modalStage === "confirmed"}
                active={modalStage === "submitted"}
                label="Step 2 — Transaction submitted"
              />
              <StepRow
                done={modalStage === "confirmed"}
                active={modalStage === "confirmed"}
                label="Step 3 — Mint confirmed on Base"
              />
            </div>

            <p style={{ marginTop: 12, color: "#444", fontSize: 13 }}>{modalMessage}</p>

            {modalStage === "submitted" && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#666",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <Spinner /> Waiting for confirmation…
              </div>
            )}

            {mintedHuman && modalStage === "confirmed" && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #e7f6ea",
                  background: "#f3fff6",
                  fontSize: 13,
                  fontWeight: 900,
                  color: "#0a7a2f",
                }}
              >
                +{mintedHuman} FIT minted 🎉
              </div>
            )}

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a
                href={BASESCAN_ADDRESS_URL}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  textDecoration: "none",
                  color: "#111",
                }}
              >
                View Contract on BaseScan ↗
              </a>

              {txUrl && (
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    textDecoration: "none",
                    color: "#111",
                  }}
                >
                  View Tx ({shortHash(pendingHash ?? "")}) ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>FitChain Prototype (Base Sepolia)</h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            Connect wallet → Start Workout (30s) → Confirm Activity → Mint FIT.
          </p>
          <div
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #ddd",
              fontSize: 12,
              fontWeight: 800,
              color: "#333",
              background: "#fafafa",
              width: "fit-content",
            }}
          >
            Demo Mode: <span style={{ fontWeight: 900 }}>30s</span>
          </div>
        </div>

        <a
          href={BASESCAN_ADDRESS_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            alignSelf: "center",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            color: "#111",
            fontSize: 12,
            height: "fit-content",
          }}
        >
          Contract on BaseScan ↗
        </a>
      </div>

      <div style={{ marginTop: 20, border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
        {!isConnected ? (
          <>
            <p style={{ fontWeight: 900 }}>Connect your wallet</p>
            <p style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
              Step 1: Connect → Step 2: Run 30s demo → Step 3: Mint FIT on Base Sepolia.
            </p>

            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => connect({ connector: c })}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                  }}
                >
                  Connect {c.name}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p style={{ fontWeight: 900 }}>Connected</p>
                <p style={{ fontSize: 12, color: "#444", wordBreak: "break-all" }}>{address}</p>

                <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  Network: {chain?.name ?? "—"}{" "}
                  <span style={{ color: "#999" }}>(chainId: {chainId ?? "—"})</span>
                </p>

                {isConnected && chainId != null && chainId !== 84532 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #ffcccc",
                      background: "#fff5f5",
                      color: "#8a0000",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <span>
                      Wrong network. Switch to <b>Base Sepolia</b> to use FitChain.
                    </span>

                    <button
                      onClick={switchToBaseSepolia}
                      disabled={isSwitching}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #8a0000",
                        background: "#8a0000",
                        color: "#fff",
                        cursor: "pointer",
                        opacity: isSwitching ? 0.6 : 1,
                      }}
                    >
                      {isSwitching ? "Switching..." : "Switch to Base Sepolia"}
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => disconnect()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  height: "fit-content",
                }}
              >
                Disconnect
              </button>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(3, 1fr)",
              }}
            >
              <Stat label="FIT balance" value={balanceDisplay} />
              <Stat label="Streak" value={userData ? String(userData[1]) : "—"} />
              <Stat
                label="Last activity day (UTC index)"
                value={userData ? String(userData[0]) : "—"}
              />
            </div>

            {/* Latest Tx card: stays until user closes */}
            {latestTx && !latestTxDismissed && (
              <div
                style={{
                  marginTop: 12,
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  padding: 12,
                  background: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 12, color: "#333" }}>
                  <div style={{ fontWeight: 900 }}>
                    ✅ Latest Tx{" "}
                    {latestTx.minted ? `— Minted +${latestTx.minted} FIT` : ""}
                  </div>
                  <div style={{ marginTop: 4, color: "#666" }}>
                    {shortHash(latestTx.hash)} •{" "}
                    {new Date(latestTx.when).toLocaleTimeString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <a
                    href={`https://sepolia.basescan.org/tx/${latestTx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12,
                      color: "#111",
                      textDecoration: "none",
                      border: "1px solid #ddd",
                      padding: "8px 10px",
                      borderRadius: 10,
                    }}
                  >
                    View on BaseScan ↗
                  </a>

                  <button
                    onClick={() => setLatestTxDismissed(true)}
                    style={{
                      fontSize: 12,
                      border: "1px solid #ddd",
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                    aria-label="Close latest transaction card"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #eee",
                background: "#fafafa",
                fontSize: 12,
                color: "#444",
              }}
            >
              {hasLoggedToday ? (
                <>
                  <b>Cooldown:</b> Next reward available in{" "}
                  <b>{formatDuration(cooldownSeconds)}</b> (resets at UTC midnight)
                </>
              ) : (
                <>
                  <b>Cooldown:</b> Available now ✅
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {!workoutActive && secondsLeft === 0 && (
                <button
                  onClick={startWorkout}
                  disabled={!address || !onBaseSepolia || hasLoggedToday}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: !address || !onBaseSepolia || hasLoggedToday ? 0.5 : 1,
                  }}
                >
                  Start Workout (30s)
                </button>
              )}

              {workoutActive && secondsLeft > 0 && (
                <div style={{ fontWeight: 900 }}>
                  Workout in progress… ⏱ {secondsLeft}s
                </div>
              )}

              {secondsLeft === 0 && workoutActive && (
                <button
                  onClick={async () => {
                    await handleLogActivity();
                    setWorkoutActive(false);
                  }}
                  disabled={!address || !onBaseSepolia}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid green",
                    background: "green",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: !address || !onBaseSepolia ? 0.5 : 1,
                  }}
                >
                  Confirm Activity ✅
                </button>
              )}

              <span style={{ fontSize: 12, color: "#555", wordBreak: "break-all" }}>
                {status}
              </span>
            </div>

            <p style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
              Note: If you already logged today, the contract blocks a second mint — expected.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
