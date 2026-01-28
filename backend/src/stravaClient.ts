import axios from "axios";
import { prisma } from "./db.js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function getValidStravaAccessToken(wallet: string): Promise<{ userId: string; accessToken: string }> {
  const w = wallet.toLowerCase();

  const user = await prisma.user.findUnique({ where: { wallet: w } });
  if (!user) throw new Error("User not found");

  const conn = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: "STRAVA" } },
  });

  if (!conn) throw new Error("Strava not connected");

  const now = Date.now();
  const expiresAt = conn.expiresAt ? conn.expiresAt.getTime() : 0;

  // if token still valid (give 60s buffer), return it
  if (conn.accessToken && expiresAt > now + 60_000) {
    return { userId: user.id, accessToken: conn.accessToken };
  }

  // refresh
  const clientId = mustEnv("STRAVA_CLIENT_ID");
  const clientSecret = mustEnv("STRAVA_CLIENT_SECRET");

  const refreshResp = await axios.post("https://www.strava.com/oauth/token", {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: conn.refreshToken,
  });

  const accessToken = refreshResp.data.access_token as string;
  const refreshToken = refreshResp.data.refresh_token as string;
  const expiresAtUnix = refreshResp.data.expires_at as number;

  await prisma.providerConnection.update({
    where: { id: conn.id },
    data: {
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAtUnix * 1000),
    },
  });

  return { userId: user.id, accessToken };
}
