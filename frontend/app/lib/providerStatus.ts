export type ProviderKey = "STRAVA" | "GOOGLE_FIT";

export type ProviderStatus = {
  provider: ProviderKey;
  connected: boolean;
  lastActivityAt: string | null;
};

export type ProvidersStatusResponse = {
  ok: boolean;
  wallet: string;
  providers: ProviderStatus[];
};

export async function fetchProvidersStatus(apiBaseUrl: string, wallet: string) {
  const url = `${apiBaseUrl}/providers/status?wallet=${encodeURIComponent(wallet)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`providers/status failed (${r.status})`);
  return (await r.json()) as ProvidersStatusResponse;
}

export function formatTimeAgo(iso: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const deltaS = Math.floor((Date.now() - t) / 1000);
  if (deltaS < 30) return "just now";
  if (deltaS < 90) return "1m ago";
  const deltaM = Math.floor(deltaS / 60);
  if (deltaM < 60) return `${deltaM}m ago`;
  const deltaH = Math.floor(deltaM / 60);
  if (deltaH < 24) return `${deltaH}h ago`;
  const deltaD = Math.floor(deltaH / 24);
  return `${deltaD}d ago`;
}
