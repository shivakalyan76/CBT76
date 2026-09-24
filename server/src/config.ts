import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).optional(),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  DB_POOL_MAX: z.coerce.number().default(35),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === "production";

export const allowedOrigins = config.CLIENT_URL.split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);
