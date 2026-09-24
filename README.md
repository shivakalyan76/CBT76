# CBT Exam System

## Local setup
1. Postgres running locally (or a Neon database).
2. `cd server && cp .env.example .env` and fill `DATABASE_URL` / `DIRECT_URL` (same value locally).
3. `npm install` (also runs `prisma generate`) → `npx prisma migrate dev` → `npm run seed` → `npm run dev` (API on :4000).
4. `cd client && npm install && npm run dev` (UI on :5173, proxies `/api` to :4000).
5. Sign in as `admin` / `ChangeMe-Admin-123` (seed values from `.env`). Change these before any real use.

## Checks
- `cd server && npx tsc --noEmit`, `cd client && npx tsc --noEmit`
- With API + client dev server running: `cd client && npm run test:flow` (login → exam → CSV import → students → assign → publish, plus error cases).

## Deploy (summary)
- Neon: pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`.
- Render (server): build `npm install && npm run build`, start `npx prisma migrate deploy && npm start`. Set `CLIENT_URL` to the exact Vercel URL.
- Vercel (client): root `client`, edit `vercel.json` to point `/api` at your Render URL.
