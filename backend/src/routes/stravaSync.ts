import { Router } from "express";
import axios from "axios";
import crypto from "crypto";
import { prisma } from "../db.js";
import { getValidStravaAccessToken } from "../stravaClient.js";

const router = Router();

// Pull recent Strava activities and store Run/Walk only
router.post("/strava/sync", async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || "").toLowerCase();
    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "wallet required" });
    }

    const { userId, accessToken } = await getValidStravaAccessToken(wallet);

    // Fetch last 30 activities (we can paginate later)
    const listResp = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: 30, page: 1 },
    });

    const items = Array.isArray(listResp.data) ? listResp.data : [];
    let saved = 0;
    let skipped = 0;

    for (const a of items) {
      const type = String(a.type || "").toUpperCase(); // e.g., "Run", "Walk"
      if (type !== "RUN" && type !== "WALK") {
        skipped++;
        continue;
      }

      const providerActivityId = String(a.id);
      const startDate = new Date(String(a.start_date)); // ISO UTC from Strava
      const durationSec = Number(a.elapsed_time || 0);
      const distanceM = a.distance != null ? Math.round(Number(a.distance)) : null;
      const avgSpeedMps =
        distanceM && durationSec > 0 ? Number((distanceM / durationSec).toFixed(3)) : null;

      // integrity hash of raw payload (for audit / later anti-cheat)
      const rawHash = crypto.createHash("sha256").update(JSON.stringify(a)).digest("hex");

      try {
        await prisma.activity.create({
          data: {
            userId,
            provider: "STRAVA",
            providerActivityId,
            type: type as any,
            startTime: startDate,
            durationSec,
            distanceM,
            avgSpeedMps,
            rawHash,
            intensityScore: 0,
            genuineScore: 0,
          },
        });
        saved++;
      } catch (e: any) {
        // Unique constraint hit means we already saved it
        if (String(e?.code) === "P2002") {
          skipped++;
        } else {
          throw e;
        }
      }
    }

    return res.json({ ok: true, saved, skipped, fetched: items.length });
  } catch (err) {
    console.error("POST /strava/sync error:", err);
    return res.status(500).json({ error: "sync failed" });
  }
});

export default router;
