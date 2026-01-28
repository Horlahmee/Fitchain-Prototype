import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

function mustWallet(req: any, res: any) {
  const wallet = String(req.query.wallet || req.body?.wallet || "").toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) {
    res.status(400).json({ error: "wallet required" });
    return null;
  }
  return wallet;
}

router.post("/providers/disconnect", async (req, res) => {
  try {
    const wallet = mustWallet(req, res);
    if (!wallet) return;

    const provider = String(req.body?.provider || "").toUpperCase();
    if (provider !== "STRAVA" && provider !== "GOOGLE_FIT") {
      return res.status(400).json({ error: "provider must be STRAVA or GOOGLE_FIT" });
    }

    const user = await prisma.user.findUnique({ where: { wallet }, select: { id: true } });
    if (!user) return res.json({ ok: true });

    await prisma.providerConnection.deleteMany({
      where: { userId: user.id, provider: provider as any },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /providers/disconnect error:", err);
    return res.status(500).json({ error: "disconnect failed" });
  }
});

export default router;
