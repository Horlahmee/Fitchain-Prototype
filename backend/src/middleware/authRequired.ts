import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../auth.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return res.status(401).json({ error: "missing bearer token" });

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.userId };
    return next();
  } catch (e: any) {
    return res.status(401).json({ error: "invalid token" });
  }
}
