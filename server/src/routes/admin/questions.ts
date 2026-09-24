import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { HttpError, assertEditable, h } from "../../utils/http";
import { parseCsv } from "../../utils/csv";

const r = Router();

const questionInput = z.object({
  questionText: z.string().trim().min(1).max(5000),
  marks: z.coerce.number().min(0).max(1000).nullish(),
  negativeMarks: z.coerce.number().min(0).max(1000).nullish(),
  explanation: z.string().max(5000).nullish(),
  options: z.array(z.object({ optionText: z.string().trim().min(1).max(1000), isCorrect: z.boolean() })).min(2).max(8),
}).refine((q) => q.options.filter((o) => o.isCorrect).length === 1, { message: "Exactly one option must be correct", path: ["options"] });

const optionsCreate = (opts: { optionText: string; isCorrect: boolean }[]) =>
  ({ create: opts.map((o, i) => ({ ...o, position: i })) });

r.get("/exams/:examId/questions", h(async (req, res) => {
  const items = await prisma.question.findMany({
    where: { examId: req.params.examId }, orderBy: { position: "asc" },
    include: { options: { orderBy: { position: "asc" } } }, // admin only: includes isCorrect
  });
  res.json(items);
}));

r.post("/exams/:examId/questions", h(async (req, res) => {
  const { examId } = req.params;
  await assertEditable(examId);
  const { options, ...q } = questionInput.parse(req.body);
  const last = await prisma.question.aggregate({ where: { examId }, _max: { position: true } });
  const created = await prisma.question.create({
    data: { ...q, examId, position: (last._max.position ?? -1) + 1, options: optionsCreate(options) },
    include: { options: { orderBy: { position: "asc" } } },
  });
  res.status(201).json(created);
}));

r.put("/questions/:id", h(async (req, res) => {
  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing?.examId) throw new HttpError(404, "Question not found");
  await assertEditable(existing.examId);
  const { options, ...q } = questionInput.parse(req.body);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.option.deleteMany({ where: { questionId: existing.id } });
    return tx.question.update({
      where: { id: existing.id }, data: { ...q, options: optionsCreate(options) },
      include: { options: { orderBy: { position: "asc" } } },
    });
  });
  res.json(updated);
}));

r.delete("/questions/:id", h(async (req, res) => {
  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing?.examId) throw new HttpError(404, "Question not found");
  await assertEditable(existing.examId);
  await prisma.question.delete({ where: { id: existing.id } });
  res.json({ ok: true });
}));

// ---- CSV import (all-or-nothing) ----
// Columns: question, optionA..optionH, correctAnswer (letter), marks, negativeMarks
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
r.post("/exams/:examId/questions/import", h(async (req, res) => {
  const { examId } = req.params;
  await assertEditable(examId);
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const rows = parseCsv(csv);

  const errors: { row: number; message: string }[] = [];
  const parsed: z.infer<typeof questionInput>[] = [];
  const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

  rows.forEach((raw, i) => {
    const row = i + 2; // header is line 1
    const fail = (message: string) => errors.push({ row, message });
    const text = raw.question;
    if (!text) return fail("Missing question text");
    const opts = LETTERS.map((L) => ({ L, t: raw[`option${L}`] })).filter((o) => o.t);
    if (opts.length < 2) return fail("At least optionA and optionB are required");
    // options must be contiguous from A (no gaps like A, B, D)
    if (opts.some((o, idx) => o.L !== LETTERS[idx])) return fail("Options must be filled in order (A, B, C, ...) with no gaps");
    const correct = (raw.correctAnswer ?? "").toUpperCase();
    if (!opts.some((o) => o.L === correct)) return fail(`correctAnswer "${raw.correctAnswer ?? ""}" does not match a filled option`);
    const marks = num(raw.marks), neg = num(raw.negativeMarks);
    if ((marks !== null && !(marks >= 0)) || (neg !== null && !(neg >= 0))) return fail("marks / negativeMarks must be numbers ≥ 0");
    parsed.push({
      questionText: text, marks, negativeMarks: neg, explanation: raw.explanation || null,
      options: opts.map((o) => ({ optionText: o.t, isCorrect: o.L === correct })),
    });
  });

  if (errors.length) throw new HttpError(400, `Import rejected: ${errors.length} invalid row(s). Nothing was imported.`, errors);

  const last = await prisma.question.aggregate({ where: { examId }, _max: { position: true } });
  let pos = (last._max.position ?? -1) + 1;
  await prisma.$transaction(
    async (tx) => {
      for (const { options, ...q } of parsed) {
        await tx.question.create({ data: { ...q, examId, position: pos++, options: optionsCreate(options) } });
      }
    },
    { timeout: 60_000 },
  );
  res.status(201).json({ imported: parsed.length });
}));

export default r;
