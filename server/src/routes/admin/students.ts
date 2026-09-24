import { Router } from "express";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { HttpError, h, pageParams } from "../../utils/http";
import { parseCsv } from "../../utils/csv";

const r = Router();
const genPassword = () => randomBytes(9).toString("base64url"); // 12 chars
const studentInput = z.object({
  name: z.string().trim().min(1).max(120),
  loginId: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, . _ - only"),
  email: z.string().trim().toLowerCase().email().nullish().or(z.literal("").transform(() => null)),
  password: z.string().min(8).max(200).optional(),
});

r.get("/", h(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const where = {
    role: "STUDENT" as const,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { loginId: { contains: search, mode: "insensitive" as const } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy: { name: "asc" }, select: { id: true, name: true, loginId: true, email: true, isActive: true, createdAt: true } }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
}));

r.post("/", h(async (req, res) => {
  const { password, ...data } = studentInput.parse(req.body);
  const plain = password ?? genPassword();
  const user = await prisma.user.create({
    data: { ...data, passwordHash: await argon2.hash(plain), role: "STUDENT" },
    select: { id: true, name: true, loginId: true, email: true },
  });
  // Generated password is shown once and never stored in plain text.
  res.status(201).json({ ...user, generatedPassword: password ? undefined : plain });
}));

import { invalidateSessionCache } from "../../middleware/auth";

// PATCH: reset password and/or (de)activate. Either change signs the student out everywhere.
const patchBody = z.object({ password: z.string().min(8).max(200).optional(), isActive: z.boolean().optional() });
r.patch("/:id", h(async (req, res) => {
  const { password, isActive } = patchBody.parse(req.body);
  const target = await prisma.user.findFirst({ where: { id: req.params.id, role: "STUDENT" } });
  if (!target) throw new HttpError(404, "Student not found");
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { ...(isActive !== undefined && { isActive }), ...(password && { passwordHash: await argon2.hash(password) }) } }),
    prisma.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  invalidateSessionCache(undefined, target.id);
  res.json({ ok: true });
}));

// CSV: name,loginId,email,password  (password optional -> generated)
r.post("/import", h(async (req, res) => {
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const rows = parseCsv(csv, 1000);
  const errors: { row: number; message: string }[] = [];
  const seen = new Set<string>();
  const seenEmail = new Set<string>();
  const valid: { name: string; loginId: string; email: string | null; plain: string; generated: boolean }[] = [];

  rows.forEach((raw, i) => {
    const row = i + 2;
    const p = studentInput.safeParse({ name: raw.name, loginId: raw.loginId, email: raw.email || null, password: raw.password || undefined });
    if (!p.success) return errors.push({ row, message: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    const key = p.data.loginId.toLowerCase();
    if (seen.has(key)) return errors.push({ row, message: `Duplicate loginId "${p.data.loginId}" in file` });
    seen.add(key);
    if (p.data.email) {
      if (seenEmail.has(p.data.email)) return errors.push({ row, message: `Duplicate email "${p.data.email}" in file` });
      seenEmail.add(p.data.email);
    }
    valid.push({ name: p.data.name, loginId: p.data.loginId, email: p.data.email ?? null, plain: p.data.password ?? genPassword(), generated: !p.data.password });
  });

  const existing = await prisma.user.findMany({
    where: { OR: [{ loginId: { in: valid.map((v) => v.loginId) } }, { email: { in: valid.filter((v) => v.email).map((v) => v.email!) } }] },
    select: { loginId: true, email: true },
  });
  const takenIds = new Set(existing.map((e) => e.loginId));
  const takenEmails = new Set(existing.map((e) => e.email).filter(Boolean));
  rows.forEach((raw, i) => {
    if (takenIds.has(raw.loginId) || (raw.email && takenEmails.has(raw.email.toLowerCase()))) {
      errors.push({ row: i + 2, message: `loginId or email already exists` });
    }
  });
  if (errors.length) throw new HttpError(400, `Import rejected: ${errors.length} problem(s). Nothing was imported.`, errors);

  // argon2 runs on the libuv pool; hash in small batches to avoid starving other requests
  const data: { name: string; loginId: string; email: string | null; passwordHash: string; role: "STUDENT" }[] = [];
  for (let i = 0; i < valid.length; i += 8) {
    const chunk = valid.slice(i, i + 8);
    const hashes = await Promise.all(chunk.map((v) => argon2.hash(v.plain)));
    chunk.forEach((v, j) => data.push({ name: v.name, loginId: v.loginId, email: v.email, passwordHash: hashes[j], role: "STUDENT" }));
  }
  await prisma.user.createMany({ data });
  res.status(201).json({
    imported: valid.length,
    generatedCredentials: valid.filter((v) => v.generated).map((v) => ({ loginId: v.loginId, name: v.name, password: v.plain })),
  });
}));

export default r;
