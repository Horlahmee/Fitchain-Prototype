import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

export type JwtUser = {
  userId: string;
};

const JWT_ISSUER = "fitchain";

export function signAccessToken(payload: JwtUser) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET missing");

  const expiresIn = process.env.JWT_ACCESS_EXPIRES || "15m";
  const options: SignOptions = { expiresIn: expiresIn as any, issuer: JWT_ISSUER };

  return jwt.sign(payload, secret as Secret, options);
}

export function signRefreshToken(payload: JwtUser) {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET missing");

  const expiresIn = process.env.JWT_REFRESH_EXPIRES || "30d";
  const options: SignOptions = { expiresIn: expiresIn as any, issuer: JWT_ISSUER };

  return jwt.sign(payload, secret as Secret, options);
}

export function verifyAccessToken(token: string): JwtUser {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET missing");

  const decoded = jwt.verify(token, secret, { issuer: JWT_ISSUER });
  if (typeof decoded !== "object" || !decoded) throw new Error("invalid token");
  const userId = (decoded as any).userId;
  if (!userId) throw new Error("invalid token payload");
  return { userId };
}

export async function hashRefreshToken(token: string) {
  // bcrypt is intentionally slow; that’s okay for refresh tokens
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  return bcrypt.hash(token, rounds);
}

export async function verifyRefreshTokenHash(token: string, tokenHash: string) {
  return bcrypt.compare(token, tokenHash);
}

export function generateOtpCode(): string {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function hashOtpCode(code: string) {
  const rounds = Number(process.env.BCRYPT_ROUNDS_OTP || 10);
  return bcrypt.hash(code, rounds);
}

export async function verifyOtpCodeHash(code: string, codeHash: string) {
  return bcrypt.compare(code, codeHash);
}
