import { Router } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../db";
import { config, isProd } from "../config";
import { SESSION_COOKIE, hashToken, requireAuth, requireRole, invalidateSessionCache, getSessionCookieOptions } from "../middleware/auth";
import { HttpError, h } from "../utils/http";
import { evaluateAttempt } from "../utils/evaluation";

const r = Router();

// In-memory cache for published exam questions structure to eliminate DB hammering on concurrent starts
interface CachedExamStructure {
  exam: any;
  cachedAt: number;
}
const examStructureCache = new Map<string, CachedExamStructure>();
const EXAM_STRUCTURE_TTL_MS = 15000;

export async function getExamStructure(examId: string) {
  const cached = examStructureCache.get(examId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < EXAM_STRUCTURE_TTL_MS) {
    return cached.exam;
  }
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        include: {
          options: {
            select: { id: true, optionText: true, position: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (exam && exam.status === "PUBLISHED") {
    examStructureCache.set(examId, { exam, cachedAt: now });
  }
  return exam;
}

// Helper to shuffle array deterministically or securely
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canShowResult(visibility: string, endTime: Date): boolean {
  if (visibility === "AFTER_SUBMIT") return true;
  if (visibility === "AFTER_EXAM_END") return new Date() >= new Date(endTime);
  return false;
}

function formatResultPayload(att: {
  totalQuestions: number | null;
  attempted: number | null;
  correct: number | null;
  wrong: number | null;
  score: any;
  totalMarks: any;
  percentage: any;
  isPassed: boolean | null;
}) {
  const total = att.totalQuestions ?? 0;
  const attempted = att.attempted ?? 0;
  const unanswered = Math.max(0, total - attempted);
  const isPassed = att.isPassed ?? false;

  return {
    totalQuestions: total,
    attempted,
    correct: att.correct ?? 0,
    wrong: att.wrong ?? 0,
    unanswered,
    score: att.score !== null ? Number(att.score) : 0,
    totalMarks: att.totalMarks !== null ? Number(att.totalMarks) : 0,
    percentage: att.percentage !== null ? Number(att.percentage) : 0,
    isPassed,
    status: isPassed ? "PASS" : "FAIL",
  };
}

// ==========================================
// 1. Student Exam Verification Entry Endpoint
// ==========================================
const verifySchema = z.object({
  enrollmentNumber: z.string().trim().min(1, "Enrollment Number is required"),
  examKey: z.string().trim().min(4, "4-digit Exam Key is required").max(10),
});

r.post("/verify", h(async (req, res) => {
  const { enrollmentNumber, examKey } = verifySchema.parse(req.body);

  // 1. Check student exists
  const student = await prisma.user.findFirst({
    where: {
      loginId: { equals: enrollmentNumber, mode: "insensitive" },
      role: "STUDENT",
    },
  });

  if (!student) {
    throw new HttpError(404, "Invalid enrollment number. Student not found.");
  }

  // 2. Check student active status
  if (!student.isActive) {
    throw new HttpError(403, "Student account is deactivated. Please contact exam administrator.");
  }

  // 3. Find assignment matching student and 4-digit key
  const assignment = await prisma.examAssignment.findFirst({
    where: {
      studentId: student.id,
      examKey: examKey,
    },
    include: {
      exam: {
        include: {
          _count: { select: { questions: true } },
        },
      },
    },
  });

  if (!assignment) {
    throw new HttpError(401, "Invalid 4-digit exam key for this enrollment number.");
  }

  const exam = assignment.exam;

  // 4. Check exam status & time window
  if (exam.status !== "PUBLISHED") {
    throw new HttpError(403, "This exam is not currently available or published.");
  }

  const now = new Date();
  if (now < exam.startTime) {
    throw new HttpError(400, `Exam has not started yet. It will open at ${exam.startTime.toLocaleString()}.`);
  }
  if (now > exam.endTime) {
    throw new HttpError(400, `Exam window has closed. The deadline was ${exam.endTime.toLocaleString()}.`);
  }

  // 5. Check if student already submitted
  const existingAttempt = await prisma.attempt.findUnique({
    where: {
      examId_studentId: {
        examId: exam.id,
        studentId: student.id,
      },
    },
  });

  if (existingAttempt && (existingAttempt.status === "SUBMITTED" || existingAttempt.status === "AUTO_SUBMITTED")) {
    throw new HttpError(403, "Exam attempt has already been submitted and locked. Re-entry is not permitted.");
  }

  // 6. Establish student session cookie
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000);

  const nowUtc = new Date();
  await prisma.session.updateMany({
    where: { userId: student.id, revokedAt: null },
    data: { revokedAt: nowUtc },
  });
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: student.id,
      expiresAt,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 250),
    },
  });
  prisma.auditLog.create({
    data: {
      userId: student.id,
      action: "STUDENT_EXAM_ENTER",
      metadata: { examId: exam.id, enrollmentNumber: student.loginId, ip: req.ip },
    },
  }).catch(() => {});

  invalidateSessionCache(undefined, student.id);

  res.cookie(SESSION_COOKIE, token, getSessionCookieOptions(expiresAt));

  res.json({
    student: {
      id: student.id,
      name: student.name,
      enrollmentNumber: student.loginId,
      department: assignment.department || student.department || "",
      section: assignment.section || student.section || "",
    },
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime,
      endTime: exam.endTime,
      cameraRequired: Boolean(exam.cameraRequired),
      defaultMarks: exam.defaultMarks,
      defaultNegative: exam.defaultNegative,
      passPercentage: exam.passPercentage,
      resultVisibility: exam.resultVisibility,
      totalQuestions: exam.totalQuestionsToAsk || exam._count.questions,
    },
    attempt: existingAttempt
      ? {
          id: existingAttempt.id,
          status: existingAttempt.status,
          startedAt: existingAttempt.startedAt,
          deadline: existingAttempt.deadline,
        }
      : null,
  });
}));

// ==========================================
// Authenticated Student Protected Endpoints
// ==========================================
r.use(requireAuth, requireRole("STUDENT"));

// 2. Start / Enter Exam
const startSchema = z.object({
  examId: z.string().min(1),
});

r.post("/start", h(async (req, res) => {
  const { examId } = startSchema.parse(req.body);
  const studentId = req.user!.id;

  const exam = await getExamStructure(examId);

  if (!exam) throw new HttpError(404, "Exam not found");
  if (exam.status !== "PUBLISHED") throw new HttpError(403, "Exam is not active");

  const now = new Date();
  if (now > exam.endTime) throw new HttpError(400, "Exam time window has expired");

  // Verify assignment
  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });
  if (!assignment) throw new HttpError(403, "You are not assigned to this exam");

  // Check for existing attempt
  let attempt = await prisma.attempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: {
      answers: true,
    },
  });

  if (attempt) {
    // If already submitted
    if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
      if (attempt.score === null) {
        await evaluateAttempt(attempt.id, attempt.status === "AUTO_SUBMITTED");
        attempt = (await prisma.attempt.findUnique({ where: { id: attempt.id }, include: { answers: true } }))!;
      }
      const showRes = canShowResult(exam.resultVisibility, exam.endTime);

      return res.json({
        locked: true,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        examTitle: exam.title,
        resultVisibility: exam.resultVisibility,
        result: showRes ? formatResultPayload(attempt) : null,
        message: "Attempt already submitted and locked",
      });
    }

    // If time has expired on server
    if (now.getTime() >= attempt.deadline.getTime()) {
      const evalRes = await evaluateAttempt(attempt.id, true);
      const showRes = canShowResult(exam.resultVisibility, exam.endTime);

      return res.json({
        locked: true,
        status: "AUTO_SUBMITTED",
        submittedAt: now,
        examTitle: exam.title,
        resultVisibility: exam.resultVisibility,
        result: showRes ? formatResultPayload({ ...attempt, ...evalRes }) : null,
        message: "Exam time has expired",
      });
    }
  } else {
    // Create new attempt
    let questionList = [...exam.questions];
    if (exam.totalQuestionsToAsk && exam.totalQuestionsToAsk < questionList.length) {
      questionList = shuffle(questionList).slice(0, exam.totalQuestionsToAsk);
    } else if (exam.shuffleQuestions) {
      questionList = shuffle(questionList);
    }

    const questionOrder = questionList.map((q: any) => q.id);
    const optionOrder: Record<string, string[]> = {};

    for (const q of questionList as any[]) {
      const opts = exam.shuffleOptions ? shuffle(q.options) : q.options;
      optionOrder[q.id] = opts.map((o: any) => o.id);
    }

    // Calculate deadline: startedAt + durationMinutes, capped at exam.endTime
    const maxDurationMs = exam.durationMinutes * 60_000;
    const deadlineMs = Math.min(now.getTime() + maxDurationMs, new Date(exam.endTime).getTime());
    const deadline = new Date(deadlineMs);

    attempt = await prisma.attempt.create({
      data: {
        examId,
        studentId,
        startedAt: now,
        deadline,
        status: "IN_PROGRESS",
        questionOrder: questionOrder as any,
        optionOrder: optionOrder as any,
        totalQuestions: questionOrder.length,
      },
      include: { answers: true },
    });

    await prisma.examEvent.create({
      data: {
        attemptId: attempt.id,
        eventType: "EXAM_STARTED",
        metadata: { ip: req.ip },
      },
    });
  }

  // Format questions and options according to attempt order (NEVER leaking isCorrect or explanation)
  const questionMap = new Map((exam.questions as any[]).map((q: any) => [q.id, q]));
  const orderedQuestionIds = (attempt.questionOrder as string[]) || [];
  const optionOrderMap = (attempt.optionOrder as Record<string, string[]>) || {};

  const sanitizedQuestions = orderedQuestionIds
    .map((qId, idx) => {
      const q: any = questionMap.get(qId);
      if (!q) return null;

      const optMap = new Map((q.options as any[]).map((o: any) => [o.id, o]));
      const optIds: string[] = optionOrderMap[qId] || (q.options as any[]).map((o: any) => o.id);
      const orderedOptions = optIds
        .map((optId) => {
          const opt: any = optMap.get(optId);
          if (!opt) return null;
          return { id: opt.id, optionText: opt.optionText };
        })
        .filter(Boolean);

      return {
        id: q.id,
        index: idx + 1,
        questionText: q.questionText,
        marks: q.marks ? String(q.marks) : String(exam.defaultMarks),
        negativeMarks: q.negativeMarks ? String(q.negativeMarks) : String(exam.defaultNegative),
        options: orderedOptions,
      };
    })
    .filter(Boolean);

  const answerMap: Record<string, { selectedOptionId: string | null; markedForReview: boolean; visited: boolean }> = {};
  for (const a of attempt.answers) {
    answerMap[a.questionId] = {
      selectedOptionId: a.selectedOptionId,
      markedForReview: a.markedForReview,
      visited: a.visited,
    };
  }

  const remainingSeconds = Math.max(0, Math.floor((attempt.deadline.getTime() - Date.now()) / 1000));

  res.json({
    attemptId: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    remainingSeconds,
    totalQuestions: sanitizedQuestions.length,
    questions: sanitizedQuestions,
    answers: answerMap,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
      cameraRequired: Boolean(exam.cameraRequired),
      defaultMarks: exam.defaultMarks,
      defaultNegative: exam.defaultNegative,
      resultVisibility: exam.resultVisibility,
    },
    student: {
      id: req.user!.id,
      name: req.user!.name,
      enrollmentNumber: req.user!.loginId,
      department: assignment.department || "",
      section: assignment.section || "",
    },
  });
}));

// 3. Get Active Attempt / Refresh Recovery
r.get("/attempt", h(async (req, res) => {
  const studentId = req.user!.id;

  let attempt = await prisma.attempt.findFirst({
    where: { studentId },
    orderBy: { startedAt: "desc" },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              options: {
                select: { id: true, optionText: true, position: true },
              },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) {
    return res.json({ attempt: null });
  }

  const exam = attempt.exam;
  const now = new Date();

  // If already submitted
  if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
    if (attempt.score === null) {
      await evaluateAttempt(attempt.id, attempt.status === "AUTO_SUBMITTED");
      attempt = (await prisma.attempt.findUnique({
        where: { id: attempt.id },
        include: { exam: { include: { questions: { include: { options: true } } } }, answers: true },
      }))!;
    }

    const showRes = canShowResult(exam.resultVisibility, exam.endTime);

    return res.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        submittedAt: attempt.submittedAt,
        examTitle: exam.title,
        resultVisibility: exam.resultVisibility,
        result: showRes ? formatResultPayload(attempt) : null,
      },
    });
  }

  // If time has expired on server
  if (now.getTime() >= attempt.deadline.getTime()) {
    const evalRes = await evaluateAttempt(attempt.id, true);
    const showRes = canShowResult(exam.resultVisibility, exam.endTime);

    return res.json({
      attempt: {
        id: attempt.id,
        status: "AUTO_SUBMITTED",
        submittedAt: now,
        examTitle: exam.title,
        resultVisibility: exam.resultVisibility,
        result: showRes ? formatResultPayload({ ...attempt, ...evalRes }) : null,
      },
    });
  }

  // Active attempt reconstruction
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const orderedQuestionIds = (attempt.questionOrder as string[]) || [];
  const optionOrderMap = (attempt.optionOrder as Record<string, string[]>) || {};

  const sanitizedQuestions = orderedQuestionIds
    .map((qId, idx) => {
      const q = questionMap.get(qId);
      if (!q) return null;

      const optMap = new Map(q.options.map((o) => [o.id, o]));
      const optIds = optionOrderMap[qId] || q.options.map((o) => o.id);
      const orderedOptions = optIds
        .map((optId) => {
          const opt = optMap.get(optId);
          if (!opt) return null;
          return { id: opt.id, optionText: opt.optionText };
        })
        .filter(Boolean);

      return {
        id: q.id,
        index: idx + 1,
        questionText: q.questionText,
        marks: q.marks ? String(q.marks) : String(exam.defaultMarks),
        negativeMarks: q.negativeMarks ? String(q.negativeMarks) : String(exam.defaultNegative),
        options: orderedOptions,
      };
    })
    .filter(Boolean);

  const answerMap: Record<string, { selectedOptionId: string | null; markedForReview: boolean; visited: boolean }> = {};
  for (const a of attempt.answers) {
    answerMap[a.questionId] = {
      selectedOptionId: a.selectedOptionId,
      markedForReview: a.markedForReview,
      visited: a.visited,
    };
  }

  const remainingSeconds = Math.max(0, Math.floor((attempt.deadline.getTime() - Date.now()) / 1000));

  const attemptPayload = {
    attemptId: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    remainingSeconds,
    totalQuestions: sanitizedQuestions.length,
    questions: sanitizedQuestions,
    answers: answerMap,
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
      cameraRequired: Boolean(exam.cameraRequired),
      defaultMarks: exam.defaultMarks,
      defaultNegative: exam.defaultNegative,
      resultVisibility: exam.resultVisibility,
    },
    student: {
      id: req.user!.id,
      name: req.user!.name,
      enrollmentNumber: req.user!.loginId,
    },
  };

  res.json({
    ...attemptPayload,
    attempt: attemptPayload,
  });
}));

// 4. Autosave Answer / Status Endpoint
const answerSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().nullable().optional(),
  markedForReview: z.boolean().optional(),
  visited: z.boolean().optional(),
});

r.post("/answer", h(async (req, res) => {
  const { attemptId, questionId, selectedOptionId, markedForReview, visited } = answerSchema.parse(req.body);
  const studentId = req.user!.id;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentId: true, status: true, deadline: true },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new HttpError(404, "Attempt not found");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new HttpError(403, "Attempt is already submitted and locked");
  }

  const now = new Date();
  // 5 seconds grace for network latency
  if (now.getTime() > attempt.deadline.getTime() + 5000) {
    await evaluateAttempt(attempt.id, true);
    throw new HttpError(403, "Exam deadline has passed. Attempt auto-submitted.");
  }

  const updated = await prisma.answer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId,
      },
    },
    update: {
      ...(selectedOptionId !== undefined && { selectedOptionId }),
      ...(markedForReview !== undefined && { markedForReview }),
      ...(visited !== undefined && { visited }),
      answeredAt: now,
    },
    create: {
      attemptId,
      questionId,
      selectedOptionId: selectedOptionId || null,
      markedForReview: markedForReview ?? false,
      visited: visited ?? true,
      answeredAt: now,
    },
  });

  res.json({
    ok: true,
    answer: {
      questionId: updated.questionId,
      selectedOptionId: updated.selectedOptionId,
      markedForReview: updated.markedForReview,
      visited: updated.visited,
    },
  });
}));

// 5. Submit Exam Endpoint with Automatic Evaluation
const submitSchema = z.object({
  attemptId: z.string().min(1),
  autoSubmitted: z.boolean().optional().default(false),
});

r.post("/submit", h(async (req, res) => {
  const { attemptId, autoSubmitted } = submitSchema.parse(req.body);
  const studentId = req.user!.id;

  let attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: true,
    },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new HttpError(404, "Attempt not found");
  }

  const exam = attempt.exam;

  if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
    if (attempt.score === null) {
      await evaluateAttempt(attempt.id, attempt.status === "AUTO_SUBMITTED");
      attempt = (await prisma.attempt.findUnique({ where: { id: attempt.id }, include: { exam: true } }))!;
    }
    const showRes = canShowResult(exam.resultVisibility, exam.endTime);

    return res.json({
      ok: true,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      examTitle: exam.title,
      resultVisibility: exam.resultVisibility,
      result: showRes ? formatResultPayload(attempt) : null,
    });
  }

  // Automatic Server-Side Evaluation
  const evalResult = await evaluateAttempt(attempt.id, autoSubmitted);
  const showRes = canShowResult(exam.resultVisibility, exam.endTime);

  res.json({
    ok: true,
    status: autoSubmitted ? "AUTO_SUBMITTED" : "SUBMITTED",
    submittedAt: new Date(),
    examTitle: exam.title,
    resultVisibility: exam.resultVisibility,
    result: showRes
      ? {
          totalQuestions: evalResult.totalQuestions,
          attempted: evalResult.attempted,
          correct: evalResult.correct,
          wrong: evalResult.wrong,
          unanswered: evalResult.unanswered,
          score: evalResult.score,
          totalMarks: evalResult.totalMarks,
          percentage: evalResult.percentage,
          isPassed: evalResult.isPassed,
          passPercentage: evalResult.passPercentage,
          status: evalResult.isPassed ? "PASS" : "FAIL",
        }
      : null,
  });
}));

// 6. Security Event Logging Endpoint (Phase 5)
const eventLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120, // ample for legitimate browser transitions (2/sec per student), throttles spam
  keyGenerator: (req) => req.user?.id || req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
});

const securityEventSchema = z.object({
  attemptId: z.string().min(1),
  eventType: z.string().min(2).max(50),
  metadata: z.record(z.any()).optional(),
});

r.post("/event", eventLimiter, h(async (req, res) => {
  const { attemptId, eventType, metadata } = securityEventSchema.parse(req.body);
  const studentId = req.user!.id;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentId: true, status: true, deadline: true },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new HttpError(404, "Attempt not found");
  }

  // If already completed or locked, do not allow further event modifications
  if (attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED") {
    throw new HttpError(403, "Attempt is already submitted and locked");
  }

  // Check if deadline has elapsed
  if (new Date() > attempt.deadline) {
    await evaluateAttempt(attempt.id, true);
    throw new HttpError(403, "Exam duration has expired; attempt auto-submitted");
  }

  // Record security event with server timestamp
  const event = await prisma.examEvent.create({
    data: {
      attemptId: attempt.id,
      eventType: eventType.toUpperCase(),
      metadata: {
        ...(metadata || {}),
        ip: req.ip,
        userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 150) : undefined,
      },
    },
  });

  res.json({
    ok: true,
    eventId: event.id,
    eventType: event.eventType,
    timestamp: event.timestamp,
  });
}));

export default r;

