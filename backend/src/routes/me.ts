import express from "express";
import { prisma } from "../db.js";
import { authRequired } from "../middleware/authRequired.js";
import { z } from "zod";
import { ethers } from "ethers";

const router = express.Router();

// GET /auth/me (JWT)
router.get("/auth/me", authRequired, async (req, res) => {
  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      wallet: true,
      email: true,
      googleSub: true,
      createdAt: true,
    },
  });

  if (!user) return res.status(404).json({ error: "user not found" });
  return res.json({ ok: true, user });
});

// POST /me/wallet (JWT) { wallet }
// Permanently binds a wallet to a user account.
router.post("/me/wallet", authRequired, async (req, res) => {
  const body = z.object({ wallet: z.string().min(10) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid payload" });

  const walletRaw = body.data.wallet.trim();
  if (!ethers.isAddress(walletRaw)) return res.status(400).json({ error: "invalid wallet address" });
  const wallet = ethers.getAddress(walletRaw);

  const userId = req.auth!.userId;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "user not found" });

  // if already set, do not allow changes
  if (user.wallet && ethers.isAddress(user.wallet)) {
    const existing = ethers.getAddress(user.wallet);
    if (existing !== wallet) {
      return res.status(409).json({ error: "wallet already set and cannot be changed" });
    }
    return res.json({ ok: true, user });
  }

  // This code path is here for future flexibility; currently schema requires wallet.
  // If schema changes later to allow null wallet, this will work.
  const updated = await prisma.user.update({ where: { id: userId }, data: { wallet } });
  return res.json({ ok: true, user: updated });
});

export default router;
