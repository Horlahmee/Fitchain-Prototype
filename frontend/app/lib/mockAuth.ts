import { useEffect, useMemo, useState } from "react";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";
import { useAccount } from "wagmi";

const LS_KEY = "fitchain:walletMnemonic";

export type WalletSource = "wagmi" | "wallet" | null;

export type LocalWallet = {
  mnemonic: string;
  address: `0x${string}`;
};

export function loadLocalWallet(): LocalWallet | null {
  if (typeof window === "undefined") return null;
  const m = window.localStorage.getItem(LS_KEY);
  if (!m) return null;
  try {
    const acct = mnemonicToAccount(m.trim());
    return { mnemonic: m.trim(), address: acct.address };
  } catch {
    return null;
  }
}

export function saveWalletMnemonic(mnemonic: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, mnemonic.trim());
}

export function clearWallet() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
}

export function createWallet(): LocalWallet {
  const mnemonic = generateMnemonic(english);
  const acct = mnemonicToAccount(mnemonic);
  saveWalletMnemonic(mnemonic);
  return { mnemonic, address: acct.address };
}

export function importWallet(mnemonic: string): LocalWallet {
  const acct = mnemonicToAccount(mnemonic.trim());
  saveWalletMnemonic(mnemonic.trim());
  return { mnemonic: mnemonic.trim(), address: acct.address };
}

// Prefer wagmi wallet when connected; otherwise fall back to the local wallet (seed phrase).
export function useActiveWallet() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const [local, setLocal] = useState<LocalWallet | null>(null);

  useEffect(() => {
    setLocal(loadLocalWallet());
  }, []);

  const active = useMemo<{ address?: `0x${string}`; source: WalletSource }>(() => {
    if (isConnected && wagmiAddress) return { address: wagmiAddress, source: "wagmi" };
    if (local?.address) return { address: local.address, source: "wallet" };
    return { address: undefined, source: null };
  }, [local?.address, isConnected, wagmiAddress]);

  return {
    ...active,
    wallet: local,
    refreshWallet: () => setLocal(loadLocalWallet()),
  };
}
