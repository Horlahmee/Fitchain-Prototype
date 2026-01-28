import { Router } from "express";
import axios from "axios";
import { prisma } from "../db.js";

const router = Router();

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Redirect to Strava OAuth
router.get("/auth/strava", async (req, res) => {
  const clientId = mustEnv("STRAVA_CLIENT_ID");
  const apiUrl = mustEnv("API_URL");

  const wallet = String(req.query.wallet || "").toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) {
    return res.status(400).send("wallet query param required");
  }

  const redirectUri = `${apiUrl}/auth/strava/callback`;
  const state = wallet; // v1: bind state to wallet (we'll harden later)

  const url =
    "https://www.strava.com/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&approval_prompt=auto` +
    `&scope=read,activity:read_all` +
    `&state=${encodeURIComponent(state)}`;

  return res.redirect(url);
});

// OAuth callback
router.get("/auth/strava/callback", async (req, res) => {
  try {
    const clientId = mustEnv("STRAVA_CLIENT_ID");
    const clientSecret = mustEnv("STRAVA_CLIENT_SECRET");
    const appUrl = mustEnv("APP_URL");

    const code = String(req.query.code || "");
    const state = String(req.query.state || "").toLowerCase(); // wallet
    const scope = String(req.query.scope || "");

    if (!code) return res.status(400).send("Missing code");
    if (!state || !state.startsWith("0x")) return res.status(400).send("Missing/invalid state");

    const user = await prisma.user.upsert({
      where: { wallet: state },
      update: {},
      create: { wallet: state },
    });

    const tokenResp = await axios.post("https://www.strava.com/oauth/token", {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });

    const accessToken = tokenResp.data.access_token as string;
    const refreshToken = tokenResp.data.refresh_token as string;
    const expiresAtUnix = tokenResp.data.expires_at as number;

    await prisma.providerConnection.upsert({
      where: {
        userId_provider: { userId: user.id, provider: "STRAVA" },
      },
      update: {
        accessToken,
        refreshToken,
        expiresAt: new Date(expiresAtUnix * 1000),
        scope,
      },
      create: {
        userId: user.id,
        provider: "STRAVA",
        accessToken,
        refreshToken,
        expiresAt: new Date(expiresAtUnix * 1000),
        scope,
      },
    });

    return res.redirect(`${appUrl}/connected?provider=strava`);
  } catch (err) {
    console.error("Strava callback error:", err);
    return res.status(500).send("OAuth error");
  }
});

export default router;
