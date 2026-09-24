import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { CookieOptions } from "express";
import type { Role } from "../generated/prisma/client";
import { prisma } from "../db";
import { config, isProd } from "../config";

export const SESSION_COOKIE = "cbt_sid";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function getSessionCookieOptions(expiresAt?: Date): CookieOptions {
  const sameSite = (config.COOKIE_SAMESITE || (isProd ? "none" : "lax")) as "lax" | "strict" | "none";
  const secure = isProd || sameSite === "none";
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

interface CachedSession {
  user: { id: string; name: string; loginId: string; role: Role };
  sessionId: string;
  expiresAt: number;
  cachedAt: number;
}

const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL_MS = 5000; // 5 second cache per token

export function invalidateSessionCache(tokenHash?: string, userId?: string) {
  if (tokenHash) {
    sessionCache.delete(tokenHash);
  } else if (userId) {
    for (const [key, val] of sessionCache.entries()) {
      if (val.user.id === userId) sessionCache.delete(key);
    }
  } else {
    sessionCache.clear();
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error: "Not authenticated" });
    
    const th = hashToken(token);
    const now = Date.now();
    const cached = sessionCache.get(th);

    if (cached && now - cached.cachedAt < CACHE_TTL_MS && now < cached.expiresAt) {
      req.user = cached.user;
      req.sessionId = cached.sessionId;
      return next();
    }

    const s = await prisma.session.findUnique({
      where: { tokenHash: th },
      include: { user: true },
    });
    if (!s || !s.user || s.revokedAt || s.expiresAt < new Date() || !s.user.isActive) {
      sessionCache.delete(th);
      return res.status(401).json({ error: "Session expired or signed in elsewhere" });
    }

    const userObj = { id: s.user.id, name: s.user.name, loginId: s.user.loginId, role: s.user.role };
    req.user = userObj;
    req.sessionId = s.id;

    sessionCache.set(th, {
      user: userObj,
      sessionId: s.id,
      expiresAt: s.expiresAt.getTime(),
      cachedAt: now,
    });

    next();
  } catch (e) { next(e); }
}

export const requireRole = (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
