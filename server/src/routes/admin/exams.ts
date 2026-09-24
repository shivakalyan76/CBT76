import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import { prisma } from "../../db";
import { HttpError, h, pageParams } from "../../utils/http";
import { parseCsv } from "../../utils/csv";
import { generateUniqueExamKey } from "../../utils/examKey";

const r = Router();

const examInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  instructions: z.string().max(10000).nullish(),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  totalQuestionsToAsk: z.coerce.number().int().min(1).nullish(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  cameraRequired: z.boolean().default(false),
  defaultMarks: z.coerce.number().min(0).max(1000).default(1),
  defaultNegative: z.coerce.number().min(0).max(1000).default(0),
  passPercentage: z.coerce.number().min(0).max(100).default(40),
  resultVisibility: z.enum(["HIDDEN", "AFTER_SUBMIT", "AFTER_EXAM_END"]).default("HIDDEN"),
}).refine((v) => v.endTime > v.startTime, { message: "endTime must be after startTime", path: ["endTime"] });

const counts = { _count: { select: { questions: true, assignments: true, attempts: true } } } as const;

r.get("/", h(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const status = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional().parse(req.query.status);
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.exam.findMany({ where, skip, take, orderBy: { startTime: "desc" }, include: counts }),
    prisma.exam.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
}));

r.post("/", h(async (req, res) => {
  const data = examInput.parse(req.body);
  const exam = await prisma.exam.create({ data: { ...data, createdById: req.user!.id } });
  res.status(201).json(exam);
}));

r.get("/:id", h(async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, include: counts });
  if (!exam) throw new HttpError(404, "Exam not found");
  res.json(exam);
}));

r.put("/:id", h(async (req, res) => {
  const data = examInput.parse(req.body);
  const existing = await prisma.exam.findUnique({ where: { id: req.params.id }, include: counts });
  if (!existing) throw new HttpError(404, "Exam not found");
  if (existing._count.attempts > 0) {
    // Rules that affect fairness or scoring are frozen once attempts exist.
    const locked = ["durationMinutes", "shuffleQuestions", "shuffleOptions", "cameraRequired", "defaultMarks", "defaultNegative", "totalQuestionsToAsk"] as const;
    const changed = locked.filter((k) => String(data[k] ?? null) !== String(existing[k] ?? null));
    if (changed.length) throw new HttpError(409, `Cannot change ${changed.join(", ")} after students have started`);
  }
  res.json(await prisma.exam.update({ where: { id: existing.id }, data }));
}));

r.delete("/:id", h(async (req, res) => {
  const n = await prisma.attempt.count({ where: { examId: req.params.id } });
  if (n > 0) throw new HttpError(409, "This exam has attempts. Archive it instead of deleting.");
  await prisma.exam.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

r.post("/:id/publish", h(async (req, res) => {
  const exam = await prisma.exam.findUnique({
    where: { id: req.params.id },
    include: { questions: { include: { options: { select: { isCorrect: true } } } } },
  });
  if (!exam) throw new HttpError(404, "Exam not found");
  const problems: string[] = [];
  if (exam.questions.length === 0) problems.push("Add at least one question");
  if (exam.totalQuestionsToAsk && exam.totalQuestionsToAsk > exam.questions.length) {
    problems.push(`Exam asks for ${exam.totalQuestionsToAsk} questions but only ${exam.questions.length} exist`);
  }
  exam.questions.forEach((q, i) => {
    if (q.options.length < 2) problems.push(`Question ${i + 1} needs at least 2 options`);
    if (q.options.filter((o) => o.isCorrect).length !== 1) problems.push(`Question ${i + 1} needs exactly one correct option`);
  });
  if (exam.endTime <= new Date()) problems.push("End time is in the past");
  if (problems.length) throw new HttpError(400, "Exam is not ready to publish", problems);
  res.json(await prisma.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED" } }));
}));

r.post("/:id/unpublish", h(async (req, res) => {
  const n = await prisma.attempt.count({ where: { examId: req.params.id } });
  if (n > 0) throw new HttpError(409, "Students have already started; cannot unpublish");
  res.json(await prisma.exam.update({ where: { id: req.params.id }, data: { status: "DRAFT" } }));
}));

// ---- Assignments ----
r.get("/:id/assignments", h(async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exam) throw new HttpError(404, "Exam not found");

  const [rows, attempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { examId: req.params.id },
      include: { student: { select: { id: true, name: true, loginId: true, department: true, section: true, isActive: true } } },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.attempt.findMany({
      where: { examId: req.params.id },
      select: { studentId: true, status: true, startedAt: true, submittedAt: true, score: true, totalMarks: true },
    }),
  ]);

  const attemptMap = new Map(attempts.map((a) => [a.studentId, a]));

  const result = rows.map((a) => {
    const attempt = attemptMap.get(a.studentId);
    return {
      id: a.student.id,
      assignmentId: a.id,
      name: a.student.name,
      loginId: a.student.loginId,
      department: a.department || a.student.department || "",
      section: a.section || a.student.section || "",
      examKey: a.examKey || "",
      isActive: a.student.isActive,
      attemptStatus: attempt ? attempt.status : "NOT_STARTED",
      startedAt: attempt?.startedAt,
      submittedAt: attempt?.submittedAt,
    };
  });

  res.json(result);
}));

const singleAssignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enrollmentNumber: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, . _ - only"),
  department: z.string().trim().max(100).optional().default(""),
  section: z.string().trim().max(50).optional().default(""),
});

const bulkAssignSchema = z.object({
  studentIds: z.array(z.string()).min(1).max(1000).optional(),
  student: singleAssignSchema.optional(),
  students: z.array(singleAssignSchema).min(1).max(1000).optional(),
});

r.post("/:id/assignments", h(async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exam) throw new HttpError(404, "Exam not found");

  const body = bulkAssignSchema.parse(req.body);

  // Case 1: Direct single student assignment (Admin enters Name, Enrollment, Department, Section)
  if (body.student || (req.body.name && req.body.enrollmentNumber)) {
    const sData = body.student || singleAssignSchema.parse(req.body);
    const dummyPw = await argon2.hash(randomBytes(16).toString("hex"));

    // Find or create student
    let student = await prisma.user.findFirst({
      where: { loginId: { equals: sData.enrollmentNumber, mode: "insensitive" } },
    });

    if (!student) {
      student = await prisma.user.create({
        data: {
          name: sData.name,
          loginId: sData.enrollmentNumber,
          department: sData.department || null,
          section: sData.section || null,
          passwordHash: dummyPw,
          role: "STUDENT",
        },
      });
    } else {
      // Update name/dept/section if updated
      student = await prisma.user.update({
        where: { id: student.id },
        data: {
          name: sData.name || student.name,
          department: sData.department || student.department,
          section: sData.section || student.section,
        },
      });
    }

    // Check if already assigned
    const existing = await prisma.examAssignment.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    });

    if (existing) {
      // Return existing key
      return res.json({
        assigned: 1,
        alreadyAssigned: true,
        assignment: {
          id: existing.id,
          studentId: student.id,
          name: student.name,
          loginId: student.loginId,
          department: existing.department || student.department || "",
          section: existing.section || student.section || "",
          examKey: existing.examKey,
        },
      });
    }

    const key = await generateUniqueExamKey(exam.id);
    const assignment = await prisma.examAssignment.create({
      data: {
        examId: exam.id,
        studentId: student.id,
        examKey: key,
        department: sData.department || null,
        section: sData.section || null,
      },
    });

    return res.status(201).json({
      assigned: 1,
      assignment: {
        id: assignment.id,
        studentId: student.id,
        name: student.name,
        loginId: student.loginId,
        department: assignment.department || student.department || "",
        section: assignment.section || student.section || "",
        examKey: assignment.examKey,
      },
    });
  }

  // Case 2: Batch array of students
  if (body.students && body.students.length > 0) {
    let created = 0;
    const assignmentsList: any[] = [];
    const dummyPw = await argon2.hash(randomBytes(16).toString("hex"));

    for (const sData of body.students) {
      let student = await prisma.user.findFirst({
        where: { loginId: { equals: sData.enrollmentNumber, mode: "insensitive" } },
      });

      if (!student) {
        student = await prisma.user.create({
          data: {
            name: sData.name,
            loginId: sData.enrollmentNumber,
            department: sData.department || null,
            section: sData.section || null,
            passwordHash: dummyPw,
            role: "STUDENT",
          },
        });
      }

      const existing = await prisma.examAssignment.findUnique({
        where: { examId_studentId: { examId: exam.id, studentId: student.id } },
      });

      if (!existing) {
        const key = await generateUniqueExamKey(exam.id);
        const a = await prisma.examAssignment.create({
          data: {
            examId: exam.id,
            studentId: student.id,
            examKey: key,
            department: sData.department || student.department || null,
            section: sData.section || student.section || null,
          },
        });
        created++;
        assignmentsList.push({
          name: student.name,
          loginId: student.loginId,
          department: a.department || "",
          section: a.section || "",
          examKey: key,
        });
      }
    }

    return res.json({ assigned: created, skipped: body.students.length - created, assignments: assignmentsList });
  }

  // Case 3: studentIds array (selection from existing students)
  if (body.studentIds && body.studentIds.length > 0) {
    const valid = await prisma.user.findMany({
      where: { id: { in: body.studentIds }, role: "STUDENT" },
      select: { id: true, department: true, section: true },
    });

    const alreadyAssigned = await prisma.examAssignment.findMany({
      where: { examId: exam.id, studentId: { in: valid.map((s) => s.id) } },
      select: { studentId: true },
    });
    const alreadySet = new Set(alreadyAssigned.map((a) => a.studentId));

    const toAssign = valid.filter((s) => !alreadySet.has(s.id));
    let assignedCount = 0;

    for (const s of toAssign) {
      const key = await generateUniqueExamKey(exam.id);
      await prisma.examAssignment.create({
        data: {
          examId: exam.id,
          studentId: s.id,
          examKey: key,
          department: s.department || null,
          section: s.section || null,
        },
      });
      assignedCount++;
    }

    return res.json({ assigned: assignedCount, skipped: body.studentIds.length - assignedCount });
  }

  throw new HttpError(400, "Missing student information or student IDs to assign");
}));

// CSV Import for Exam Assignments: name, enrollment, department, section
r.post("/:id/assignments/import", h(async (req, res) => {
  const exam = await prisma.exam.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exam) throw new HttpError(404, "Exam not found");

  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const rows = parseCsv(csv, 2000);
  const errors: { row: number; message: string }[] = [];
  const validRows: { name: string; enrollmentNumber: string; department: string; section: string }[] = [];
  const seenEnrollment = new Set<string>();

  rows.forEach((raw, i) => {
    const rowNum = i + 2;
    const name = (raw.name || raw.studentName || "").trim();
    const enrollment = (raw.enrollment || raw.enrollmentNumber || raw.loginId || "").trim();
    const department = (raw.department || raw.dept || "").trim();
    const section = (raw.section || raw.sec || "").trim();

    if (!name) {
      errors.push({ row: rowNum, message: "Student Name is required" });
      return;
    }
    if (!enrollment) {
      errors.push({ row: rowNum, message: "Enrollment Number is required" });
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(enrollment)) {
      errors.push({ row: rowNum, message: `Invalid enrollment number "${enrollment}" (letters, numbers, . _ - only)` });
      return;
    }

    const keyLower = enrollment.toLowerCase();
    if (seenEnrollment.has(keyLower)) {
      errors.push({ row: rowNum, message: `Duplicate enrollment number "${enrollment}" in CSV file` });
      return;
    }
    seenEnrollment.add(keyLower);

    validRows.push({ name, enrollmentNumber: enrollment, department, section });
  });

  if (errors.length > 0) {
    throw new HttpError(400, `CSV import rejected: ${errors.length} issue(s) found.`, errors);
  }

  const dummyPw = await argon2.hash(randomBytes(16).toString("hex"));
  const createdAssignments: { name: string; loginId: string; department: string; section: string; examKey: string }[] = [];
  let newlyAssigned = 0;
  const existingAssignments = await prisma.examAssignment.findMany({
    where: { examId: exam.id },
    select: { examKey: true },
  });
  const usedKeys = new Set(existingAssignments.map((a) => a.examKey).filter(Boolean) as string[]);

  const getUniqueKey = () => {
    for (let i = 0; i < 100; i++) {
      const k = String(Math.floor(1000 + Math.random() * 9000));
      if (!usedKeys.has(k)) {
        usedKeys.add(k);
        return k;
      }
    }
    const fallback = String(Math.floor(1000 + Math.random() * 9000));
    usedKeys.add(fallback);
    return fallback;
  };

  for (const row of validRows) {
    let student = await prisma.user.findFirst({
      where: { loginId: { equals: row.enrollmentNumber, mode: "insensitive" } },
    });

    if (!student) {
      student = await prisma.user.create({
        data: {
          name: row.name,
          loginId: row.enrollmentNumber,
          department: row.department || null,
          section: row.section || null,
          passwordHash: dummyPw,
          role: "STUDENT",
        },
      });
    }

    const existing = await prisma.examAssignment.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    });

    if (!existing) {
      const key = getUniqueKey();
      const a = await prisma.examAssignment.create({
        data: {
          examId: exam.id,
          studentId: student.id,
          examKey: key,
          department: row.department || student.department || null,
          section: row.section || student.section || null,
        },
      });
      newlyAssigned++;
      createdAssignments.push({
        name: student.name,
        loginId: student.loginId,
        department: a.department || "",
        section: a.section || "",
        examKey: key,
      });
    } else {
      createdAssignments.push({
        name: student.name,
        loginId: student.loginId,
        department: existing.department || student.department || "",
        section: existing.section || student.section || "",
        examKey: existing.examKey || "",
      });
    }
  }

  res.status(201).json({
    imported: newlyAssigned,
    totalInFile: validRows.length,
    assignments: createdAssignments,
  });
}));

r.delete("/:id/assignments/:studentId", h(async (req, res) => {
  const started = await prisma.attempt.count({ where: { examId: req.params.id, studentId: req.params.studentId } });
  if (started) throw new HttpError(409, "Student has already started this exam");
  await prisma.examAssignment.deleteMany({ where: { examId: req.params.id, studentId: req.params.studentId } });
  res.json({ ok: true });
}));

export default r;

