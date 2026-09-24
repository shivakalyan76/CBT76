import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { isProd } from "../config";
import { HttpError } from "../utils/http";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  const code = (err as { code?: string })?.code;
  if (code === "P2002") return res.status(409).json({ error: "A record with these unique values already exists" });
  if (code === "P2025") return res.status(404).json({ error: "Record not found" });
  console.error(err);
  res.status(500).json({ error: "Internal server error", ...(isProd ? {} : { detail: String(err) }) });
}
