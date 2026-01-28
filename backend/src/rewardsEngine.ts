export type ActivityType = "RUN" | "WALK";

export const DAILY_CAP_FIT = Number(process.env.DAILY_CAP_FIT ?? 50); // prototype cap
export const MIN_ACTIVITY_SECONDS = 60; // ignore micro activities

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Intensity score 0–100 based on avg speed (m/s)
export function computeIntensity(type: ActivityType, avgSpeedMps: number | null): number {
  if (!avgSpeedMps || avgSpeedMps <= 0) return 10;

  if (type === "WALK") {
    // 0.8 m/s -> 20, 1.5 -> 70, 2.2 -> 90
    const score = ((avgSpeedMps - 0.8) / (2.2 - 0.8)) * 70 + 20;
    return clamp(Math.round(score), 10, 95);
  }

  // RUN: 2.0 -> 30, 3.3 -> 70, 5.0 -> 95
  const score = ((avgSpeedMps - 2.0) / (5.0 - 2.0)) * 65 + 30;
  return clamp(Math.round(score), 10, 98);
}

export function computeFitEarned(durationSec: number, intensityScore: number, genuineScore: number): number {
  const minutes = durationSec / 60;

  // intensity multiplier range: 0.6x .. 2.0x
  const intensityMultiplier = 0.6 + (clamp(intensityScore, 0, 100) / 100) * 1.4;
  // base: 0.5 FIT/min scaled
  const base = minutes * 0.5 * intensityMultiplier;

  const genuineMultiplier = clamp(genuineScore, 0, 100) / 100;
  return Math.max(0, base * genuineMultiplier);
}

// UTC day range for "today"
export function getUtcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dayKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(
    start.getUTCDate()
  ).padStart(2, "0")}`;
  return { start, end, dayKey };
}
