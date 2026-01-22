"use client";

import { useEffect, useMemo, useState } from "react";
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

// Minimal ABI: only what we use
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

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<string>("");

  // 30s demo workout flow
  const [workoutActive, setWorkoutActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // tx confirmation + auto-refresh
  const [pendingHash, setPendingHash] = useState<`0x${string}` | null>(null);
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: pendingHash ?? undefined,
    });

  const { data: userData, refetch: refetchUser } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: "getUser",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      // optional: keep UI fresh even without tx
      // refetchInterval: 5000,
    },
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
    query: {
      enabled: Boolean(address),
      // optional: keep UI fresh even without tx
      // refetchInterval: 5000,
    },
  });

  const balanceHuman = useMemo(() => {
    if (balanceWei == null || decimals == null) return "—";
    return formatUnits(balanceWei, decimals);
  }, [balanceWei, decimals]);

  function startWorkout() {
    if (!address) return;
    if (chain?.id !== 84532) return;
    if (workoutActive) return;
    if (isConfirming) return;

    setStatus("");
    setWorkoutActive(true);
    setSecondsLeft(30);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleLogActivity() {
    try {
      setStatus("Preparing transaction...");

      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: "logActivity",
      });

      setStatus(`⏳ Pending: ${txHash}`);
      setPendingHash(txHash);
    } catch (e: unknown) {
      let msg = "Transaction failed";

      if (typeof e === "object" && e !== null) {
        const maybeShort = (e as { shortMessage?: unknown }).shortMessage;
        const maybeMsg = (e as { message?: unknown }).message;

        if (typeof maybeShort === "string") msg = maybeShort;
        else if (typeof maybeMsg === "string") msg = maybeMsg;
      }

      setStatus(`❌ ${msg}`);
    }
  }

  // When tx confirms, refetch and update UI
  useEffect(() => {
    if (!isConfirmed) return;

    (async () => {
      setStatus("✅ Confirmed");
      await refetchUser();
      await refetchBalance();
      setPendingHash(null);
    })();
  }, [isConfirmed, refetchUser, refetchBalance]);

  // If user disconnects or changes account/network, reset workout UI
  useEffect(() => {
    setWorkoutActive(false);
    setSecondsLeft(0);
    setStatus("");
    setPendingHash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chain?.id]);

  const onBaseSepolia = chain?.id === 84532;

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        FitChain Prototype (Base Sepolia)
      </h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        Connect wallet → Start Workout (30s) → Confirm Activity → Mint FIT.
      </p>

      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 16,
        }}
      >
        {!isConnected ? (
          <>
            <p style={{ fontWeight: 600 }}>Connect your wallet</p>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => connect({ connector: c })}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
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
                <p style={{ fontWeight: 600 }}>Connected</p>
                <p style={{ fontSize: 12, color: "#444", wordBreak: "break-all" }}>
                  {address}
                </p>
                <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  Network: {chain?.name ?? "—"}
                  {!onBaseSepolia ? (
                    <span style={{ color: "#b00020" }}> (Switch to Base Sepolia)</span>
                  ) : null}
                </p>
              </div>

              <button
                onClick={() => disconnect()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
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
                marginTop: 18,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(3, 1fr)",
              }}
            >
              <Stat label="FIT balance" value={balanceHuman} />
              <Stat label="Streak" value={userData ? String(userData[1]) : "—"} />
              <Stat
                label="Last activity day (UTC index)"
                value={userData ? String(userData[0]) : "—"}
              />
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              {/* Step 1: Start workout */}
              {!workoutActive && secondsLeft === 0 && (
                <button
                  onClick={startWorkout}
                  disabled={!address || !onBaseSepolia || isConfirming}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: !address || !onBaseSepolia || isConfirming ? 0.5 : 1,
                  }}
                >
                  Start Workout (30s)
                </button>
              )}

              {/* Step 2: Countdown */}
              {workoutActive && secondsLeft > 0 && (
                <div style={{ fontWeight: 600 }}>
                  Workout in progress... ⏱ {secondsLeft}s
                </div>
              )}

              {/* Step 3: Confirm + mint */}
              {secondsLeft === 0 && workoutActive && (
                <button
                  onClick={async () => {
                    await handleLogActivity();
                    // keep workoutActive true until confirmation if you want,
                    // but for demo UX we can reset right away
                    setWorkoutActive(false);
                  }}
                  disabled={!address || !onBaseSepolia || isConfirming}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "1px solid green",
                    background: "green",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: !address || !onBaseSepolia || isConfirming ? 0.5 : 1,
                  }}
                >
                  {isConfirming ? "Confirming..." : "Confirm Activity ✅"}
                </button>
              )}

              <span style={{ fontSize: 12, color: "#555", wordBreak: "break-all" }}>
                {status}
              </span>
            </div>

            <p style={{ marginTop: 12, fontSize: 12, color: "#777" }}>
              If you already logged today, you’ll see “Already logged today” — that’s expected.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
