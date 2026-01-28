import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// Check if a wallet has a provider connected (no secrets returned)
router.get("/connections", async (req, res) => {
  const wallet = String(req.query.wallet || "").toLowerCase();
  const provider = String(req.query.provider || "STRAVA").toUpperCase();

  if (!wallet || !wallet.startsWith("0x")) {
    return res.status(400).json({ error: "wallet query param required" });
  }

  if (provider !== "STRAVA" && provider !== "GOOGLE_FIT") {
    return res.status(400).json({ error: "provider must be STRAVA or GOOGLE_FIT" });
  }

  const user = await prisma.user.findUnique({
    where: { wallet },
    select: { id: true },
  });

  if (!user) return res.json({ connected: false });

  const conn = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId: user.id, provider: provider as any } },
    select: { provider: true, expiresAt: true, createdAt: true, updatedAt: true },
  });

  return res.json({
    connected: !!conn,
    provider: conn?.provider ?? null,
    expiresAt: conn?.expiresAt ?? null,
    createdAt: conn?.createdAt ?? null,
    updatedAt: conn?.updatedAt ?? null,
  });
});

// Status for all supported providers (no secrets)
router.get("/providers/status", async (req, res) => {
  const wallet = String(req.query.wallet || "").toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) {
    return res.status(400).json({ error: "wallet query param required" });
  }

  const user = await prisma.user.findUnique({
    where: { wallet },
    select: { id: true },
  });

  if (!user) {
    return res.json({
      ok: true,
      wallet,
      providers: [
        { provider: "STRAVA", connected: false, lastActivityAt: null },
        { provider: "GOOGLE_FIT", connected: false, lastActivityAt: null },
      ],
    });
  }

  const userId = user.id;

  const conns = await prisma.providerConnection.findMany({
    where: { userId },
    select: { provider: true, updatedAt: true, createdAt: true },
  });

  const connectedSet = new Set(conns.map((c) => c.provider));

  async function lastActivityAt(provider: "STRAVA" | "GOOGLE_FIT") {
    const a = await prisma.activity.findFirst({
      where: { userId, provider: provider as any },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return a?.createdAt ?? null;
  }

  const stravaConnected = connectedSet.has("STRAVA" as any);
  const googleConnected = connectedSet.has("GOOGLE_FIT" as any);

  const [stravaLast, googleLast] = await Promise.all([
    stravaConnected ? lastActivityAt("STRAVA") : Promise.resolve(null),
    googleConnected ? lastActivityAt("GOOGLE_FIT") : Promise.resolve(null),
  ]);

  return res.json({
    ok: true,
    wallet,
    providers: [
      {
        provider: "STRAVA",
        connected: stravaConnected,
        lastActivityAt: stravaLast,
      },
      {
        provider: "GOOGLE_FIT",
        connected: googleConnected,
        lastActivityAt: googleLast,
      },
    ],
  });
});

export default router;
