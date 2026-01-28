import { Router } from "express";
import { prisma } from "../db.js";
import {
  DAILY_CAP_FIT,
  MIN_ACTIVITY_SECONDS,
  computeFitEarned,
  computeIntensity,
  getUtcDayRange,
  type ActivityType,
} from "../rewardsEngine.js";

const router = Router();

function isTxHash(v: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(v);
}

function isActivityType(t: string): t is ActivityType {
  return t === "RUN" || t === "WALK";
}

// 1) Preview claimable FIT (does NOT lock anything)
router.get("/claim/preview", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase();
    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });

    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) {
      return res.json({ ok: true, claimableFit: 0, dailyCap: DAILY_CAP_FIT, activities: [] });
    }

    const { start, end, dayKey } = getUtcDayRange();

    const pending = await prisma.rewardClaim.findFirst({
      where: { userId: user.id, dayKey, status: "PENDING" },
      select: { id: true, amountFit: true },
    });

    const acts = await prisma.activity.findMany({
      where: {
        userId: user.id,
        startTime: { gte: start, lt: end },
        claimedAt: null,
        // Include unlocked activities AND activities already locked into today's pending claim
        ...(pending?.id
          ? { OR: [{ claimId: null }, { claimId: pending.id }] }
          : { claimId: null }),
        type: { in: ["RUN", "WALK"] },
        durationSec: { gte: MIN_ACTIVITY_SECONDS },
      },
      orderBy: { startTime: "asc" },
    });

    const claimedToday = await prisma.rewardClaim.findMany({
      where: { userId: user.id, dayKey, status: "CONFIRMED" },
      select: { amountFit: true },
    });

    const alreadyClaimed = claimedToday.reduce((sum, r) => sum + Number(r.amountFit), 0);
    const remainingCap = Math.max(0, DAILY_CAP_FIT - alreadyClaimed);
    
    // UX: if user already hit daily cap, don't show pending activities today
if (remainingCap <= 0) {
  return res.json({
    ok: true,
    dayKey,
    dailyCap: DAILY_CAP_FIT,
    alreadyClaimed: Number(alreadyClaimed.toFixed(6)),
    remainingCap: 0,
    totalUncapped: 0,
    claimableFit: 0,
    activities: [],
  });
}


    const breakdown = acts
      .filter((a) => isActivityType(a.type))
      .map((a) => {
        const genuine = a.genuineScore ?? 80;
        const intensity =
          a.intensityScore && a.intensityScore > 0
            ? a.intensityScore
            : computeIntensity(a.type, a.avgSpeedMps);

        const fit = computeFitEarned(a.durationSec, intensity, genuine);

        return {
          id: a.id,
          provider: a.provider,
          providerActivityId: a.providerActivityId,
          type: a.type,
          startTime: a.startTime,
          durationSec: a.durationSec,
          distanceM: a.distanceM,
          avgSpeedMps: a.avgSpeedMps,
          intensityScore: intensity,
          genuineScore: genuine,
          fitEarned: Number(fit.toFixed(6)),
        };
      });

    const totalUncapped = breakdown.reduce((sum, x) => sum + x.fitEarned, 0);
    const claimable = Math.min(remainingCap, totalUncapped);

    return res.json({
      ok: true,
      dayKey,
      dailyCap: DAILY_CAP_FIT,
      alreadyClaimed: Number(alreadyClaimed.toFixed(6)),
      remainingCap: Number(remainingCap.toFixed(6)),
      totalUncapped: Number(totalUncapped.toFixed(6)),
      claimableFit: Number(claimable.toFixed(6)),
      pendingClaim: pending
        ? { id: pending.id, amountFit: Number(pending.amountFit) }
        : null,
      activities: breakdown,
    });
  } catch (err) {
    console.error("GET /claim/preview error:", err);
    return res.status(500).json({ error: "preview failed" });
  }
});

// 2) Prepare claim (locks ONLY activities that fit inside remaining cap)
router.post("/claim/prepare", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();
    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });

    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(400).json({ error: "user not found" });

    const { start, end, dayKey } = getUtcDayRange();

    const pending = await prisma.rewardClaim.findFirst({
      where: { userId: user.id, dayKey, status: "PENDING" },
      select: { id: true, amountFit: true },
    });

    if (pending) {
      return res.json({
        ok: true,
        claimId: pending.id,
        amountFit: Number(pending.amountFit),
        status: "PENDING",
      });
    }

    const acts = await prisma.activity.findMany({
      where: {
        userId: user.id,
        startTime: { gte: start, lt: end },
        claimedAt: null,
        claimId: null,
        type: { in: ["RUN", "WALK"] },
        durationSec: { gte: MIN_ACTIVITY_SECONDS },
      },
      orderBy: { startTime: "asc" },
    });

    const claimedToday = await prisma.rewardClaim.findMany({
      where: { userId: user.id, dayKey, status: "CONFIRMED" },
      select: { amountFit: true },
    });

    const alreadyClaimed = claimedToday.reduce((sum, r) => sum + Number(r.amountFit), 0);
    let remainingCap = Math.max(0, DAILY_CAP_FIT - alreadyClaimed);

    if (remainingCap <= 0) {
      return res.json({ ok: true, claimId: null, amountFit: 0, status: "DAILY_CAP_REACHED" });
    }

    // Select activities in order until we hit remaining cap
    const selectedIds: string[] = [];
    let selectedTotal = 0;

    for (const a of acts) {
      if (!isActivityType(a.type)) continue;

      const genuine = a.genuineScore ?? 80;
      const intensity =
        a.intensityScore && a.intensityScore > 0
          ? a.intensityScore
          : computeIntensity(a.type, a.avgSpeedMps);

      const fit = computeFitEarned(a.durationSec, intensity, genuine);

      if (fit <= 0) continue;

      // If adding this one would exceed cap:
    // - If we haven't selected anything yet, allow a PARTIAL claim using remainingCap
    // - Otherwise stop
    if (selectedTotal + fit > remainingCap) {
        if (selectedIds.length === 0) {
            selectedIds.push(a.id);
            selectedTotal = remainingCap; // partial claim
  }
  break;
}


      selectedIds.push(a.id);
      selectedTotal += fit;
    }

    if (selectedTotal <= 0 || selectedIds.length === 0) {
      return res.json({ ok: true, claimId: null, amountFit: 0, status: "NOTHING_TO_CLAIM" });
    }

    const claim = await prisma.rewardClaim.create({
      data: {
        userId: user.id,
        dayKey,
        amountFit: selectedTotal.toFixed(6),
        status: "PENDING",
      },
      select: { id: true, amountFit: true },
    });

    // Lock ONLY the selected activities
    await prisma.activity.updateMany({
      where: { id: { in: selectedIds } },
      data: { claimId: claim.id },
    });

    return res.json({
      ok: true,
      claimId: claim.id,
      amountFit: Number(claim.amountFit),
      status: "PENDING",
      lockedActivities: selectedIds.length,
    });
  } catch (err) {
    console.error("POST /claim/prepare error:", err);
    return res.status(500).json({ error: "prepare failed" });
  }
});

// 3) Confirm claim after onchain mint (store tx + mark ONLY claim activities claimed)
router.post("/claim/confirm", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();
    const claimId = String(req.body?.claimId || "");
    const txHash = String(req.body?.txHash || "");

    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });
    if (!claimId) return res.status(400).json({ error: "claimId required" });
    if (!isTxHash(txHash)) return res.status(400).json({ error: "valid txHash required" });

    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(400).json({ error: "user not found" });

    const claim = await prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.userId !== user.id) return res.status(404).json({ error: "claim not found" });

    if (claim.status === "CONFIRMED") {
      return res.json({ ok: true, status: "CONFIRMED" });
    }

    await prisma.rewardClaim.update({
      where: { id: claimId },
      data: { status: "CONFIRMED", txHash, confirmedAt: new Date() },
    });

    await prisma.activity.updateMany({
      where: { userId: user.id, claimId, claimedAt: null },
      data: { claimedAt: new Date(), claimTx: txHash },
    });

    return res.json({ ok: true, status: "CONFIRMED" });
  } catch (err) {
    console.error("POST /claim/confirm error:", err);
    return res.status(500).json({ error: "confirm failed" });
  }
});

// 4) Confirm claim OFFCHAIN into the in-app wallet (no external wallet needed)
router.post("/claim/confirm-inapp", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();
    const claimId = String(req.body?.claimId || "");

    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });
    if (!claimId) return res.status(400).json({ error: "claimId required" });

    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.status(400).json({ error: "user not found" });

    const claim = await prisma.rewardClaim.findUnique({ where: { id: claimId } });
    if (!claim || claim.userId !== user.id) return res.status(404).json({ error: "claim not found" });

    if (claim.status === "CONFIRMED") {
      return res.json({ ok: true, status: "CONFIRMED" });
    }

    // Ensure in-app wallet exists
    const inapp = await prisma.inAppWallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balanceFit: "0" },
    });

    const amount = claim.amountFit;

    await prisma.$transaction([
      prisma.rewardClaim.update({
        where: { id: claimId },
        data: { status: "CONFIRMED", txHash: "WALLET", confirmedAt: new Date() },
      }),
      prisma.activity.updateMany({
        where: { userId: user.id, claimId, claimedAt: null },
        data: { claimedAt: new Date(), claimTx: "WALLET" },
      }),
      prisma.inAppWallet.update({
        where: { id: inapp.id },
        data: { balanceFit: { increment: amount } },
      }),
      prisma.inAppWalletTx.create({
        data: {
          walletId: inapp.id,
          type: "CREDIT",
          amountFit: amount,
          memo: "Rewards claimed",
          ref: claimId,
        },
      }),
    ]);

    return res.json({ ok: true, status: "CONFIRMED", credited: Number(amount) });
  } catch (err) {
    console.error("POST /claim/confirm-inapp error:", err);
    return res.status(500).json({ error: "confirm-inapp failed" });
  }
});

export default router;
