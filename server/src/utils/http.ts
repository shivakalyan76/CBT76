import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
export const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

export function pageParams(q: Request["query"]) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Exam must exist and must not have attempts (content is frozen once anyone has started). */
export async function assertEditable(examId: string) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, _count: { select: { attempts: true } } } });
  if (!exam) throw new HttpError(404, "Exam not found");
  if (exam._count.attempts > 0) throw new HttpError(409, "Students have already started this exam; its questions can no longer change");
  return exam;
}
