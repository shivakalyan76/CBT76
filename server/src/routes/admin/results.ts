import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { HttpError, h, pageParams } from "../../utils/http";

const r = Router();

// ==========================================
// 1. Exam Results List & Overall Statistics
// ==========================================
r.get("/:examId/results", h(async (req, res) => {
  const { examId } = req.params;
  const { page, pageSize, skip, take } = pageParams(req.query);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, passPercentage: true, defaultMarks: true, defaultNegative: true },
  });
  if (!exam) throw new HttpError(404, "Exam not found");

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const passFilter = typeof req.query.result === "string" ? req.query.result.trim().toUpperCase() : "";
  const deptFilter = typeof req.query.department === "string" ? req.query.department.trim() : "";
  const secFilter = typeof req.query.section === "string" ? req.query.section.trim() : "";

  // Fetch all assignments for this exam to calculate accurate statistics
  const [allAssignments, allAttempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { examId },
      include: {
        student: { select: { id: true, name: true, loginId: true, department: true, section: true } },
      },
    }),
    prisma.attempt.findMany({
      where: { examId },
      select: {
        id: true,
        studentId: true,
        status: true,
        score: true,
        totalMarks: true,
        percentage: true,
        isPassed: true,
        correct: true,
        wrong: true,
        attempted: true,
        totalQuestions: true,
        startedAt: true,
        submittedAt: true,
      },
    }),
  ]);

  const attemptMap = new Map(allAttempts.map((a) => [a.studentId, a]));

  // Combine assignments with attempt data
  const combined = allAssignments.map((a) => {
    const att = attemptMap.get(a.studentId);
    const dept = a.department || a.student.department || "";
    const sec = a.section || a.student.section || "";
    const totalQ = att?.totalQuestions ?? 0;
    const attemptedQ = att?.attempted ?? 0;
    const unansweredQ = totalQ - attemptedQ;

    return {
      assignmentId: a.id,
      studentId: a.student.id,
      name: a.student.name,
      enrollmentNumber: a.student.loginId,
      department: dept,
      section: sec,
      examKey: a.examKey || "",
      attemptId: att?.id || null,
      attemptStatus: att ? att.status : "NOT_STARTED",
      score: att?.score !== null && att?.score !== undefined ? Number(att.score) : null,
      totalMarks: att?.totalMarks !== null && att?.totalMarks !== undefined ? Number(att.totalMarks) : null,
      percentage: att?.percentage !== null && att?.percentage !== undefined ? Number(att.percentage) : null,
      isPassed: att?.isPassed ?? null,
      passStatus: att?.isPassed === true ? "PASS" : att?.isPassed === false ? "FAIL" : "—",
      correct: att?.correct ?? null,
      wrong: att?.wrong ?? null,
      unanswered: att ? unansweredQ : null,
      attempted: att?.attempted ?? null,
      totalQuestions: att?.totalQuestions ?? null,
      startedAt: att?.startedAt || null,
      submittedAt: att?.submittedAt || null,
    };
  });

  // Calculate statistics from actual completed attempts
  const completedAttempts = combined.filter(
    (c) => c.attemptStatus === "SUBMITTED" || c.attemptStatus === "AUTO_SUBMITTED"
  );
  const startedCount = combined.filter((c) => c.attemptStatus !== "NOT_STARTED").length;
  const submittedCount = combined.filter((c) => c.attemptStatus === "SUBMITTED").length;
  const autoSubmittedCount = combined.filter((c) => c.attemptStatus === "AUTO_SUBMITTED").length;

  let averageScore = 0;
  let highestScore = 0;
  let lowestScore = 0;
  let passCount = 0;
  let failCount = 0;

  if (completedAttempts.length > 0) {
    const scores = completedAttempts.map((c) => c.score ?? 0);
    const sumScore = scores.reduce((acc, s) => acc + s, 0);
    averageScore = Math.round((sumScore / scores.length) * 100) / 100;
    highestScore = Math.max(...scores);
    lowestScore = Math.min(...scores);
    passCount = completedAttempts.filter((c) => c.isPassed === true).length;
    failCount = completedAttempts.filter((c) => c.isPassed === false).length;
  }

  const passRate = completedAttempts.length > 0
    ? Math.round(((passCount / completedAttempts.length) * 100) * 100) / 100
    : 0;

  const stats = {
    totalAssigned: allAssignments.length,
    started: startedCount,
    submitted: submittedCount,
    autoSubmitted: autoSubmittedCount,
    averageScore,
    highestScore,
    lowestScore,
    passCount,
    failCount,
    passPercentage: passRate,
  };

  // Apply filters
  let filtered = combined;

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(
      (item) => item.name.toLowerCase().includes(s) || item.enrollmentNumber.toLowerCase().includes(s)
    );
  }

  if (statusFilter && statusFilter !== "ALL") {
    filtered = filtered.filter((item) => item.attemptStatus === statusFilter);
  }

  if (passFilter && passFilter !== "ALL") {
    if (passFilter === "PASS") {
      filtered = filtered.filter((item) => item.isPassed === true);
    } else if (passFilter === "FAIL") {
      filtered = filtered.filter((item) => item.isPassed === false);
    }
  }

  if (deptFilter && deptFilter !== "ALL") {
    filtered = filtered.filter((item) => item.department.toLowerCase() === deptFilter.toLowerCase());
  }

  if (secFilter && secFilter !== "ALL") {
    filtered = filtered.filter((item) => item.section.toLowerCase() === secFilter.toLowerCase());
  }

  const total = filtered.length;
  const items = filtered.slice(skip, skip + take);

  res.json({
    items,
    total,
    page,
    pageSize,
    stats,
  });
}));

// ==========================================
// 2. Export Results to CSV
// ==========================================
r.get("/:examId/results/export", h(async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true },
  });
  if (!exam) throw new HttpError(404, "Exam not found");

  const [assignments, attempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { examId },
      include: {
        student: { select: { id: true, name: true, loginId: true, department: true, section: true } },
      },
      orderBy: { student: { name: "asc" } },
    }),
    prisma.attempt.findMany({
      where: { examId },
    }),
  ]);

  const attemptMap = new Map(attempts.map((a) => [a.studentId, a]));

  const headers = [
    "Name",
    "Enrollment Number",
    "Department",
    "Section",
    "Score",
    "Total Marks",
    "Percentage",
    "Correct",
    "Wrong",
    "Unanswered",
    "Status",
    "Attempt Status",
    "Submission Time",
  ];

  const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;

  const rows = assignments.map((a) => {
    const att = attemptMap.get(a.studentId);
    const dept = a.department || a.student.department || "";
    const sec = a.section || a.student.section || "";
    const totalQ = att?.totalQuestions ?? 0;
    const attemptedQ = att?.attempted ?? 0;
    const unansweredQ = totalQ - attemptedQ;

    return [
      a.student.name,
      a.student.loginId,
      dept,
      sec,
      att?.score !== null && att?.score !== undefined ? String(att.score) : "—",
      att?.totalMarks !== null && att?.totalMarks !== undefined ? String(att.totalMarks) : "—",
      att?.percentage !== null && att?.percentage !== undefined ? `${att.percentage}%` : "—",
      att?.correct !== null && att?.correct !== undefined ? String(att.correct) : "—",
      att?.wrong !== null && att?.wrong !== undefined ? String(att.wrong) : "—",
      att ? String(unansweredQ) : "—",
      att?.isPassed === true ? "PASS" : att?.isPassed === false ? "FAIL" : "—",
      att?.status || "NOT_STARTED",
      att?.submittedAt ? att.submittedAt.toISOString() : "—",
    ].map(escapeCsv).join(",");
  });

  const csvContent = [headers.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="results-${exam.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv"`);
  res.send(csvContent);
}));

// ==========================================
// 3. Detailed Student Result Breakdown (Admin)
// ==========================================
r.get("/:examId/results/:studentId", h(async (req, res) => {
  const { examId, studentId } = req.params;

  const [exam, student, assignment, attempt] = await Promise.all([
    prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            options: { orderBy: { position: "asc" } },
          },
          orderBy: { position: "asc" },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, loginId: true, department: true, section: true },
    }),
    prisma.examAssignment.findUnique({
      where: { examId_studentId: { examId, studentId } },
    }),
    prisma.attempt.findUnique({
      where: { examId_studentId: { examId, studentId } },
      include: {
        answers: {
          include: { option: true },
        },
      },
    }),
  ]);

  if (!exam) throw new HttpError(404, "Exam not found");
  if (!student) throw new HttpError(404, "Student not found");

  if (!attempt) {
    return res.json({
      student: {
        id: student.id,
        name: student.name,
        enrollmentNumber: student.loginId,
        department: assignment?.department || student.department || "",
        section: assignment?.section || student.section || "",
      },
      exam: {
        id: exam.id,
        title: exam.title,
        passPercentage: Number(exam.passPercentage),
      },
      attempt: null,
      message: "Student has not started this exam yet.",
    });
  }

  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const orderedQuestionIds = (attempt.questionOrder as string[]) || exam.questions.map((q) => q.id);
  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const questionBreakdowns = orderedQuestionIds.map((qId, idx) => {
    const q = questionMap.get(qId);
    if (!q) return null;

    const ans = answerMap.get(qId);
    const selectedOpt = ans?.option || null;
    const correctOpt = q.options.find((o) => o.isCorrect) || null;

    const qMarks = q.marks !== null ? Number(q.marks) : Number(exam.defaultMarks);
    const qNegative = q.negativeMarks !== null ? Number(q.negativeMarks) : Number(exam.defaultNegative);

    let status: "CORRECT" | "INCORRECT" | "UNANSWERED" = "UNANSWERED";
    let marksObtained = 0;

    if (selectedOpt) {
      if (selectedOpt.isCorrect) {
        status = "CORRECT";
        marksObtained = qMarks;
      } else {
        status = "INCORRECT";
        marksObtained = -qNegative;
      }
    }

    return {
      index: idx + 1,
      id: q.id,
      questionText: q.questionText,
      marks: qMarks,
      negativeMarks: qNegative,
      explanation: q.explanation,
      options: q.options.map((o) => ({
        id: o.id,
        optionText: o.optionText,
        isCorrect: o.isCorrect,
      })),
      selectedOptionId: selectedOpt?.id || null,
      selectedOptionText: selectedOpt?.optionText || null,
      correctOptionId: correctOpt?.id || null,
      correctOptionText: correctOpt?.optionText || null,
      status,
      marksObtained,
    };
  }).filter(Boolean);

  res.json({
    student: {
      id: student.id,
      name: student.name,
      enrollmentNumber: student.loginId,
      department: assignment?.department || student.department || "",
      section: assignment?.section || student.section || "",
    },
    exam: {
      id: exam.id,
      title: exam.title,
      passPercentage: Number(exam.passPercentage),
      defaultMarks: Number(exam.defaultMarks),
      defaultNegative: Number(exam.defaultNegative),
    },
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score !== null ? Number(attempt.score) : null,
      totalMarks: attempt.totalMarks !== null ? Number(attempt.totalMarks) : null,
      percentage: attempt.percentage !== null ? Number(attempt.percentage) : null,
      isPassed: attempt.isPassed,
      totalQuestions: attempt.totalQuestions,
      attempted: attempt.attempted,
      correct: attempt.correct,
      wrong: attempt.wrong,
      unanswered: (attempt.totalQuestions || 0) - (attempt.attempted || 0),
    },
    questions: questionBreakdowns,
  });
}));

export default r;
