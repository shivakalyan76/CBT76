import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI (migrate) uses the DIRECT (non-pooled) URL; the running app uses DATABASE_URL via the pg adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // placeholder lets `prisma generate` run before .env exists (e.g. on npm install)
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder" },
});
