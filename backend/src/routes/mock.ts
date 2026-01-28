import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// DEV ONLY: create a fake activity for testing rewards
// If type/duration/distance are not provided, we generate a random RUN or WALK.
router.post("/dev/mock-activity", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();

    const maybeType = req.body?.type ? String(req.body.type).toUpperCase() : null;
    const type = (maybeType || (Math.random() < 0.5 ? "RUN" : "WALK")) as string; // RUN/WALK

    // Randomize plausible ranges if not provided
    const durationSec =
      req.body?.durationSec != null
        ? Number(req.body.durationSec)
        : type === "RUN"
        ? // 10–60 minutes
          Math.floor(600 + Math.random() * 3000)
        : // WALK 10–90 minutes
          Math.floor(600 + Math.random() * 4800);

    const distanceM =
      req.body?.distanceM != null
        ? Number(req.body.distanceM)
        : type === "RUN"
        ? // RUN: 1.5–12 km
          Math.floor(1500 + Math.random() * 10500)
        : // WALK: 0.8–8 km
          Math.floor(800 + Math.random() * 7200);

    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "wallet required" });
    if (type !== "RUN" && type !== "WALK") {
      return res.status(400).json({ error: "type must be RUN or WALK" });
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      return res.status(400).json({ error: "durationSec invalid" });
    }
    if (!Number.isFinite(distanceM) || distanceM <= 0) {
      return res.status(400).json({ error: "distanceM invalid" });
    }

    // IMPORTANT:
    // If "provider" is a Prisma enum, "MOCK" may not exist.
    // So we use "STRAVA" as provider to avoid enum failures.
    const provider = "STRAVA";
    const providerActivityId = `mock_${Date.now()}`;

    const user = await prisma.user.upsert({
      where: { wallet },
      update: {},
      create: { wallet },
    });

    const avgSpeedMps = Number((distanceM / durationSec).toFixed(3));

    // Minimal create: if your Activity model requires more fields,
    // Prisma will tell us EXACTLY what’s missing (we’ll see it now).
    const act = await prisma.activity.create({
      data: {
        userId: user.id,
        provider,
        providerActivityId,
        type: type as any,
        startTime: new Date(),
        durationSec,
        distanceM,
        avgSpeedMps,
        rawHash: `mock-${providerActivityId}`,
        intensityScore: 0,
        genuineScore: 80,
      } as any,
    });

    return res.json({
      ok: true,
      activityId: act.id,
      simulated: {
        type,
        durationSec,
        distanceM,
        avgSpeedMps,
      },
    });
  } catch (err: any) {
    // 🔥 Return the real error so we can fix fast
    console.error("POST /dev/mock-activity error:", err);

    const details =
      err?.meta ||
      err?.message ||
      err?.cause?.message ||
      (typeof err === "string" ? err : "unknown error");

    return res.status(500).json({
      error: "mock failed",
      details,
    });
  }
});

export default router;
