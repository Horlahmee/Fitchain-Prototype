import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

const CATALOG = [
  {
    id: "b1",
    rarity: "LEGENDARY",
    title: "100 Day Warrior",
    subtitle: "Complete a 100-day streak",
    priceFit: 5000,
    estUsd: 117,
  },
  {
    id: "b2",
    rarity: "EPIC",
    title: "Marathon Master",
    subtitle: "Run 42.2km total",
    priceFit: 2500,
    estUsd: 58.5,
  },
  {
    id: "b3",
    rarity: "RARE",
    title: "Early Adopter",
    subtitle: "Joined in the first month",
    priceFit: 1000,
    estUsd: 23.4,
  },
  {
    id: "b4",
    rarity: "COMMON",
    title: "Weekend Warrior",
    subtitle: "3 workouts in a weekend",
    priceFit: 250,
    estUsd: 5.85,
  },
  {
    id: "b5",
    rarity: "RARE",
    title: "Night Owl",
    subtitle: "Workout after 10pm",
    priceFit: 800,
    estUsd: 18.7,
  },
  {
    id: "b6",
    rarity: "EPIC",
    title: "Community Champion",
    subtitle: "Top 10 leaderboard",
    priceFit: 3500,
    estUsd: 81.9,
  },
] as const;

function mustWallet(req: any, res: any) {
  const wallet = String(req.body?.wallet || req.query.wallet || "").toLowerCase();
  if (!wallet || !wallet.startsWith("0x")) {
    res.status(400).json({ error: "wallet required" });
    return null;
  }
  return wallet;
}

async function getOrCreateUser(wallet: string) {
  return prisma.user.upsert({
    where: { wallet },
    update: {},
    create: { wallet },
    select: { id: true, wallet: true },
  });
}

async function getOrCreateWallet(userId: string) {
  return prisma.inAppWallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balanceFit: "0" },
  });
}

async function ensureCatalogSeeded() {
  const count = await prisma.badge.count();
  if (count >= CATALOG.length) return;
  await prisma.$transaction(
    CATALOG.map((b) =>
      prisma.badge.upsert({
        where: { id: b.id },
        update: {
          rarity: b.rarity,
          title: b.title,
          subtitle: b.subtitle,
          priceFit: String(b.priceFit),
        },
        create: {
          id: b.id,
          rarity: b.rarity,
          title: b.title,
          subtitle: b.subtitle,
          priceFit: String(b.priceFit),
        },
      })
    )
  );
}

router.get("/marketplace/catalog", async (_req, res) => {
  await ensureCatalogSeeded();
  return res.json({ ok: true, items: CATALOG });
});

// Buy a badge using the offchain wallet balance
router.post("/marketplace/buy", async (req, res) => {
  try {
    await ensureCatalogSeeded();

    const walletAddr = mustWallet(req, res);
    if (!walletAddr) return;

    const badgeId = String(req.body?.badgeId || "");
    if (!badgeId) return res.status(400).json({ error: "badgeId required" });

    const catalogItem = CATALOG.find((b) => b.id === badgeId);
    if (!catalogItem) return res.status(404).json({ error: "unknown badge" });

    const user = await getOrCreateUser(walletAddr);
    const w = await getOrCreateWallet(user.id);

    const balance = Number(w.balanceFit);
    const price = Number(catalogItem.priceFit);

    if (balance < price) {
      return res.status(400).json({
        error: "insufficient balance",
        balanceFit: balance,
        priceFit: price,
      });
    }

    // Already owned?
    const owned = await prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId: user.id, badgeId } },
      select: { id: true },
    });
    if (owned) {
      return res.status(400).json({ error: "already owned" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.marketplacePurchase.create({
        data: {
          userId: user.id,
          badgeId,
          amountFit: String(price),
        },
        select: { id: true, createdAt: true },
      });

      await tx.userBadge.create({
        data: {
          userId: user.id,
          badgeId,
          source: "MARKETPLACE",
        },
      });

      await tx.inAppWallet.update({
        where: { id: w.id },
        data: { balanceFit: { decrement: String(price) } },
      });

      await tx.inAppWalletTx.create({
        data: {
          walletId: w.id,
          type: "DEBIT",
          amountFit: String(price),
          memo: `Marketplace purchase: ${catalogItem.title}`,
          ref: purchase.id,
        },
      });

      return purchase;
    });

    const updated = await prisma.inAppWallet.findUnique({
      where: { id: w.id },
      select: { balanceFit: true },
    });

    return res.json({
      ok: true,
      purchaseId: result.id,
      badgeId,
      newBalanceFit: Number(updated?.balanceFit || 0),
    });
  } catch (err) {
    console.error("POST /marketplace/buy error:", err);
    return res.status(500).json({ error: "buy failed" });
  }
});

export default router;
