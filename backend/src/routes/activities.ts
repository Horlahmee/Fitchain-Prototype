import { Router } from "express";
import { prisma } from "../db.js";
import {
  MIN_ACTIVITY_SECONDS,
  computeFitEarned,
  computeIntensity,
  type ActivityType,
} from "../rewardsEngine.js";

const router = Router();

function isActivityType(t: string): t is ActivityType {
  return t === "RUN" || t === "WALK";
}

/**
 * GET /activity/list
 * Query: wallet=0x..&range=week|month
 * Returns recent activities for Activity page history.
 */
router.get("/activity/list", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase();
    const range = String(req.query.range || "week");

    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });

    const user = await prisma.user.findUnique({ where: { wallet } });
    if (!user) return res.json({ ok: true, range, activities: [] });

    const days = range === "month" ? 30 : 7;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const acts = await prisma.activity.findMany({
      where: {
        userId: user.id,
        startTime: { gte: from },
        type: { in: ["RUN", "WALK"] },
        durationSec: { gte: MIN_ACTIVITY_SECONDS },
      },
      orderBy: { startTime: "desc" },
      take: range === "month" ? 200 : 80,
    });

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
          distanceM: a.distanceM ?? 0,
          avgSpeedMps: a.avgSpeedMps ?? 0,
          intensityScore: intensity,
          genuineScore: genuine,
          fitEarned: Number(fit.toFixed(6)),
        };
      });

    return res.json({ ok: true, range, activities: breakdown });
  } catch (err) {
    console.error("GET /activity/list error:", err);
    return res.status(500).json({ error: "activity list failed" });
  }
});

export default router;
