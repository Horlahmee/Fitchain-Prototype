import { Router } from "express";
import axios from "axios";
import { getValidStravaAccessToken } from "../stravaClient.js";

const router = Router();

router.get("/strava/debug", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "").toLowerCase();
    if (!wallet || !wallet.startsWith("0x")) {
      return res.status(400).json({ error: "wallet required" });
    }

    const { accessToken } = await getValidStravaAccessToken(wallet);

    // 1) Who am I?
    const athlete = await axios.get("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 2) What activities do I see?
    const activities = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: 5, page: 1 },
    });

    return res.json({
      ok: true,
      athlete: {
        id: athlete.data?.id,
        username: athlete.data?.username,
        firstname: athlete.data?.firstname,
        lastname: athlete.data?.lastname,
      },
      activitiesCount: Array.isArray(activities.data) ? activities.data.length : null,
      firstActivityPreview:
        Array.isArray(activities.data) && activities.data[0]
          ? {
              id: activities.data[0].id,
              type: activities.data[0].type,
              start_date: activities.data[0].start_date,
              distance: activities.data[0].distance,
              elapsed_time: activities.data[0].elapsed_time,
              name: activities.data[0].name,
            }
          : null,
    });
  } catch (err: any) {
    console.error("GET /strava/debug error:", err?.response?.data || err);
    return res.status(500).json({
      ok: false,
      error: "debug failed",
      details: err?.response?.data || String(err),
    });
  }
});

export default router;
