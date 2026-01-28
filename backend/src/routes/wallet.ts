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

async function getOrCreateUser(wallet: string) {
  const user = await prisma.user.upsert({
    where: { wallet },
    update: {},
    create: { wallet },
    select: { id: true, wallet: true },
  });
  return user;
}

async function getOrCreateInAppWallet(userId: string) {
  return prisma.inAppWallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balanceFit: "0" },
  });
}

// GET /wallet/balance?wallet=0x...
router.get("/wallet/balance", async (req, res) => {
  try {
    const wallet = mustWallet(req, res);
    if (!wallet) return;

    const user = await getOrCreateUser(wallet);
    const w = await getOrCreateInAppWallet(user.id);

    return res.json({
      ok: true,
      wallet: user.wallet,
      balanceFit: Number(w.balanceFit),
      updatedAt: w.updatedAt,
    });
  } catch (err) {
    console.error("GET /wallet/balance error:", err);
    return res.status(500).json({ error: "balance failed" });
  }
});

// GET /wallet/txs?wallet=0x...
router.get("/wallet/txs", async (req, res) => {
  try {
    const wallet = mustWallet(req, res);
    if (!wallet) return;

    const user = await getOrCreateUser(wallet);
    const w = await getOrCreateInAppWallet(user.id);

    const txs = await prisma.inAppWalletTx.findMany({
      where: { walletId: w.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, amountFit: true, memo: true, ref: true, createdAt: true },
    });

    return res.json({
      ok: true,
      wallet: user.wallet,
      balanceFit: Number(w.balanceFit),
      txs: txs.map((t: any) => ({
        ...t,
        amountFit: Number(t.amountFit),
      })),
    });
  } catch (err) {
    console.error("GET /wallet/txs error:", err);
    return res.status(500).json({ error: "txs failed" });
  }
});

export default router;
