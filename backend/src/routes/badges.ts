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

router.get("/badges/list", async (req, res) => {
  try {
    const wallet = mustWallet(req, res);
    if (!wallet) return;

    const user = await prisma.user.findUnique({ where: { wallet }, select: { id: true } });
    if (!user) return res.json({ ok: true, items: [] });

    const items = await prisma.userBadge.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { badge: true },
      take: 50,
    });

    return res.json({
      ok: true,
      items: items.map((x) => ({
        id: x.badge.id,
        rarity: x.badge.rarity,
        title: x.badge.title,
        subtitle: x.badge.subtitle,
        source: x.source,
        createdAt: x.createdAt,
      })),
    });
  } catch (err) {
    console.error("GET /badges/list error:", err);
    return res.status(500).json({ error: "badges failed" });
  }
});

export default router;
