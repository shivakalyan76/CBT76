import { Router } from "express";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db";
import { config, isProd } from "../config";
import { SESSION_COOKIE, hashToken, requireAuth, getSessionCookieOptions } from "../middleware/auth";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: !isProd ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const body = z.object({ loginId: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

// Hash of a random string, computed once, to equalize timing when the user doesn't exist.
let dummyHash: Promise<string> | null = null;
const getDummy = () => (dummyHash ??= argon2.hash(randomBytes(16).toString("hex")));

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { loginId, password } = body.parse(req.body);
    const user = await prisma.user.findFirst({
      where: { OR: [{ loginId }, { email: loginId.toLowerCase() }] },
    });
    const ok = await argon2.verify(user?.passwordHash ?? (await getDummy()), password).catch(() => false);
    if (!user || !user.isActive || !ok) {
      await prisma.auditLog.create({ data: { userId: user?.id, action: "LOGIN_FAILED", metadata: { loginId, ip: req.ip } } });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);

    await prisma.$transaction(async (tx) => {
      if (user.role === "STUDENT") {
        // One active session per student: revoke older ones and flag any live attempt.
        const revoked = await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (revoked.count > 0) {
          const live = await tx.attempt.findMany({ where: { studentId: user.id, status: "IN_PROGRESS" }, select: { id: true } });
          if (live.length) {
            await tx.examEvent.createMany({
              data: live.map((a) => ({ attemptId: a.id, eventType: "MULTI_LOGIN", metadata: { ip: req.ip } })),
            });
          }
        }
      }
      await tx.session.create({
        data: { tokenHash: hashToken(token), userId: user.id, expiresAt, ip: req.ip, userAgent: req.headers["user-agent"]?.slice(0, 250) },
      });
      await tx.auditLog.create({ data: { userId: user.id, action: "LOGIN", metadata: { ip: req.ip } } });
    });

    res.cookie(SESSION_COOKIE, token, getSessionCookieOptions(expiresAt));
    res.json({ user: { id: user.id, name: user.name, loginId: user.loginId, role: user.role } });
  } catch (e) { next(e); }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.session.update({ where: { id: req.sessionId! }, data: { revokedAt: new Date() } });
    res.clearCookie(SESSION_COOKIE, getSessionCookieOptions());
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
