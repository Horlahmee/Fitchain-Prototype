import express from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCodeHash,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  verifyRefreshTokenHash,
} from "../auth.js";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";

const router = express.Router();

const otpStartLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function issueTokens(userId: string) {
  const refreshToken = signRefreshToken({ userId });
  const refreshHash = await hashRefreshToken(refreshToken);

  const refreshExpiresDays = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30);
  const expiresAt = new Date(Date.now() + refreshExpiresDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refreshHash,
      expiresAt,
    },
  });

  const accessToken = signAccessToken({ userId });

  return { accessToken, refreshToken };
}

// POST /auth/email/start { email }
router.post("/auth/email/start", otpStartLimiter, async (req, res) => {
  const body = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid email" });

  const email = normalizeEmail(body.data.email);
  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpCode.create({
    data: { email, codeHash, expiresAt },
  });

  // TEMP: until SES is live, log OTP for testing.
  // Later: send email via SES and remove this log.
  console.log(`[OTP] ${email} -> ${code}`);

  return res.json({ ok: true });
});

// POST /auth/email/verify { email, code, wallet }
router.post("/auth/email/verify", otpVerifyLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    code: z.string().min(4).max(10),
    wallet: z.string().min(10),
  });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid payload" });

  const email = normalizeEmail(body.data.email);
  const code = body.data.code.trim();
  const wallet = body.data.wallet.trim();

  const otp = await prisma.otpCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return res.status(400).json({ error: "otp not found" });
  if (otp.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "otp expired" });
  if (otp.attempts >= 10) return res.status(429).json({ error: "too many attempts" });

  const ok = await verifyOtpCodeHash(code, otp.codeHash);

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
  });

  if (!ok) return res.status(400).json({ error: "invalid code" });

  // Create user (wallet required) + attach email
  // If wallet already exists, link email to existing user.
  const user = await prisma.user.upsert({
    where: { wallet },
    update: { email },
    create: { wallet, email },
  });

  const tokens = await issueTokens(user.id);
  return res.json({ ok: true, user, ...tokens });
});

// POST /auth/google { idToken, wallet }
router.post("/auth/google", async (req, res) => {
  const schema = z.object({ idToken: z.string().min(10), wallet: z.string().min(10) });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid payload" });

  const { idToken, wallet } = body.data;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "missing GOOGLE_CLIENT_ID" });

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();

  const email = payload?.email ? normalizeEmail(payload.email) : null;
  const googleSub = payload?.sub;

  if (!googleSub) return res.status(400).json({ error: "invalid google token" });

  // Upsert by wallet (since wallet is created at signup)
  const user = await prisma.user.upsert({
    where: { wallet },
    update: {
      googleSub,
      ...(email ? { email } : {}),
    },
    create: {
      wallet,
      googleSub,
      ...(email ? { email } : {}),
    },
  });

  const tokens = await issueTokens(user.id);
  return res.json({ ok: true, user, ...tokens });
});

// POST /auth/refresh { refreshToken }
router.post("/auth/refresh", async (req, res) => {
  const schema = z.object({ refreshToken: z.string().min(10) });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid payload" });

  const refreshToken = body.data.refreshToken;

  // decode to get userId; verify signature with refresh secret
  // (re-using verifyAccessToken would use the wrong secret)
  // We'll verify by checking stored hash + expiry; signature verification is implicitly ensured
  // by having been signed with our secret. We'll do explicit verify here for safety.
  const jwtSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: "missing JWT_REFRESH_SECRET" });

  let decoded: any;
  try {
    decoded = (await import("jsonwebtoken")).default.verify(refreshToken, jwtSecret, { issuer: "fitchain" });
  } catch {
    return res.status(401).json({ error: "invalid refresh token" });
  }

  const userId = decoded?.userId;
  if (!userId) return res.status(401).json({ error: "invalid refresh token" });

  const records = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  let matched: { id: string } | null = null;
  for (const r of records) {
    const ok = await verifyRefreshTokenHash(refreshToken, r.tokenHash);
    if (ok) {
      matched = { id: r.id };
      break;
    }
  }

  if (!matched) return res.status(401).json({ error: "refresh token not recognized" });

  // rotate: revoke current token record, issue new
  await prisma.refreshToken.update({ where: { id: matched.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokens(userId);
  return res.json({ ok: true, ...tokens });
});

// POST /auth/logout { refreshToken }
router.post("/auth/logout", async (req, res) => {
  const schema = z.object({ refreshToken: z.string().min(10) });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid payload" });

  const refreshToken = body.data.refreshToken;

  const jwtSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: "missing JWT_REFRESH_SECRET" });

  let decoded: any;
  try {
    decoded = (await import("jsonwebtoken")).default.verify(refreshToken, jwtSecret, { issuer: "fitchain" });
  } catch {
    return res.status(200).json({ ok: true });
  }

  const userId = decoded?.userId;
  if (!userId) return res.status(200).json({ ok: true });

  const records = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  for (const r of records) {
    const ok = await verifyRefreshTokenHash(refreshToken, r.tokenHash);
    if (ok) {
      await prisma.refreshToken.update({ where: { id: r.id }, data: { revokedAt: new Date() } });
      break;
    }
  }

  return res.json({ ok: true });
});

export default router;
