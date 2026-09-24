# CBT System – Architecture (Phase 1)

## 1. Architecture
Browser (React SPA on Vercel) --HTTPS/JSON--> Express API (Render) --Prisma pool--> Neon PostgreSQL.
Stateless API behind Render's proxy; sessions live in Postgres (so multi-instance scaling works). Socket.IO is deferred: nothing in v1 truly needs push. Timer, autosave and admin "live" views use plain REST with server deadlines.

## 2. Technology justification
- React+Vite+TS+Tailwind: small bundle, fast dev, typed API layer.
- Express+TS: simple, well understood, easy to host anywhere.
- Prisma+PostgreSQL: relational integrity (attempts/answers), constraints, migrations. Neon has pooled connections (pooled URL at runtime, direct URL for migrations).
- Opaque session cookie (not JWT): instantly revocable, which is required to enforce one active session per student. Stored hashed (SHA-256).
- argon2id for passwords.

## 3. ER design
User 1-N Exam(createdBy) | Exam 1-N Question 1-N Option
Exam N-M User via ExamAssignment | Exam 1-N Attempt N-1 User (unique examId+studentId)
Attempt 1-N Answer (unique attemptId+questionId) | Attempt 1-N ExamEvent
User 1-N Session | QuestionBank 1-N Question (optional, for later)
Attempt stores questionOrder / optionOrder JSON so shuffles are reproducible.

## 4. Schema: see server/prisma/schema.prisma

## 5. Roadmap
P1 auth/roles/schema (this) -> P2 exam+question CRUD, CSV import, assignment -> P3 student CBT UI, timer, autosave -> P4 submit/scoring/results -> P5 security events, export -> P6 load test, deploy.

## 6. Security considerations
- httpOnly + Secure session cookie; SameSite=Lax if same-origin via Vercel rewrite, else None + Origin-check CSRF guard (implemented).
- Rate limit on login; helmet; zod validation; Prisma parameterized queries; generic auth errors; timing-equalized login.
- Correct answers never sent to students before submission; scoring only on server.
- Browser protections (fullscreen, visibility, right-click block) are deterrents only: they can be bypassed and mainly produce an audit trail for the examiner.

## 7. Performance for 100-200 concurrent students
Likely bottlenecks: (1) everyone starting at once -> cache exam questions in memory, create attempts in one transaction; (2) autosave writes -> debounce client-side, upsert single answers, no per-second calls; (3) DB connections -> Neon pooled URL, small Prisma pool per instance; (4) Render free-tier cold starts/CPU -> use an always-on paid instance on exam day; (5) mass auto-submit at deadline -> lazy submit on next request plus a batched sweeper job.
Capacity is unproven until load-tested (k6 script planned in Phase 6: login -> start -> ~1 save/20s -> submit).
