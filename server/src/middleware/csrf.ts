import type { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "../config";

// Cookie auth + cross-site setups: reject state-changing requests from unauthorized origins.
export function originGuard(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.includes(origin.replace(/\/$/, ""))) {
    return res.status(403).json({ error: "Invalid origin" });
  }
  next();
}
