import { Router } from "express";
import { prisma } from "../../db";
import { HttpError, h } from "../../utils/http";

const r = Router();

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 1. GET /api/admin/exams/:examId/analytics/overview
 * Returns high-level exam metrics, score distribution histogram buckets, and department/section performance breakdowns.
 */
r.get("/:examId/analytics/overview", h(async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      title: true,
      passPercentage: true,
      durationMinutes: true,
      defaultMarks: true,
      defaultNegative: true,
      _count: {
        select: {
          assignments: true,
          questions: true,
          attempts: true,
        },
      },
    },
  });

  if (!exam) {
    throw new HttpError(404, "Exam not found");
  }

  // Fetch all assignments (enrolled students)
  const assignments = await prisma.examAssignment.findMany({
    where: { examId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          loginId: true,
          department: true,
          section: true,
        },
      },
    },
  });

  // Fetch all attempts for this exam
  const attempts = await prisma.attempt.findMany({
    where: { examId },
    select: {
      id: true,
      studentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      score: true,
      totalMarks: true,
      percentage: true,
      isPassed: true,
    },
  });

  const totalEnrolled = assignments.length;
  const startedCount = attempts.length;
  const autoSubmittedCount = attempts.filter((a) => a.status === "AUTO_SUBMITTED").length;
  const manualSubmittedCount = attempts.filter((a) => a.status === "SUBMITTED").length;
  const completedCount = manualSubmittedCount + autoSubmittedCount;

  // Completed attempts with numeric scores
  const evaluatedAttempts = attempts.filter(
    (a) => (a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED") && a.score !== null
  );

  let averageScore = 0;
  let highestScore = 0;
  let lowestScore = 0;
  let passCount = 0;
  let failCount = 0;
  let totalCompletionMinutes = 0;
  let completionCount = 0;

  // Score distribution buckets (0-20, 21-40, 41-60, 61-80, 81-100)
  const scoreBuckets = [
    { range: "0–20%", min: 0, max: 20, count: 0 },
    { range: "21–40%", min: 20.001, max: 40, count: 0 },
    { range: "41–60%", min: 40.001, max: 60, count: 0 },
    { range: "61–80%", min: 60.001, max: 80, count: 0 },
    { range: "81–100%", min: 80.001, max: 100, count: 0 },
  ];

  if (evaluatedAttempts.length > 0) {
    let sumScore = 0;
    highestScore = Number(evaluatedAttempts[0].score);
    lowestScore = Number(evaluatedAttempts[0].score);

    for (const att of evaluatedAttempts) {
      const sc = Number(att.score);
      const pct = Number(att.percentage ?? 0);
      sumScore += sc;

      if (sc > highestScore) highestScore = sc;
      if (sc < lowestScore) lowestScore = sc;

      if (att.isPassed) passCount++;
      else failCount++;

      // Time spent
      if (att.startedAt && att.submittedAt) {
        const ms = new Date(att.submittedAt).getTime() - new Date(att.startedAt).getTime();
        const mins = Math.max(0, ms / (1000 * 60));
        totalCompletionMinutes += mins;
        completionCount++;
      }

      // Buckets
      if (pct <= 20) scoreBuckets[0].count++;
      else if (pct <= 40) scoreBuckets[1].count++;
      else if (pct <= 60) scoreBuckets[2].count++;
      else if (pct <= 80) scoreBuckets[3].count++;
      else scoreBuckets[4].count++;
    }

    averageScore = Number((sumScore / evaluatedAttempts.length).toFixed(2));
  }

  const passPercentage =
    completedCount > 0 ? Number(((passCount / completedCount) * 100).toFixed(1)) : 0;
  const avgCompletionTimeMinutes =
    completionCount > 0 ? Number((totalCompletionMinutes / completionCount).toFixed(1)) : 0;

  // Department Performance Aggregation
  const attemptByStudentId = new Map(attempts.map((a) => [a.studentId, a]));
  const deptMap = new Map<
    string,
    {
      department: string;
      enrolled: number;
      completed: number;
      scores: number[];
      percentages: number[];
      passCount: number;
      failCount: number;
    }
  >();

  const sectionMap = new Map<
    string,
    {
      department: string;
      section: string;
      enrolled: number;
      completed: number;
      scores: number[];
      passCount: number;
      failCount: number;
    }
  >();

  for (const asgn of assignments) {
    const dept = (asgn.department || asgn.student.department || "General").trim();
    const sec = (asgn.section || asgn.student.section || "A").trim();

    // Init Dept
    if (!deptMap.has(dept)) {
      deptMap.set(dept, {
        department: dept,
        enrolled: 0,
        completed: 0,
        scores: [],
        percentages: [],
        passCount: 0,
        failCount: 0,
      });
    }
    const dObj = deptMap.get(dept)!;
    dObj.enrolled++;

    // Init Section
    const secKey = `${dept}::${sec}`;
    if (!sectionMap.has(secKey)) {
      sectionMap.set(secKey, {
        department: dept,
        section: sec,
        enrolled: 0,
        completed: 0,
        scores: [],
        passCount: 0,
        failCount: 0,
      });
    }
    const sObj = sectionMap.get(secKey)!;
    sObj.enrolled++;

    const att = attemptByStudentId.get(asgn.studentId);
    if (att && (att.status === "SUBMITTED" || att.status === "AUTO_SUBMITTED") && att.score !== null) {
      const s = Number(att.score);
      const p = Number(att.percentage ?? 0);

      dObj.completed++;
      dObj.scores.push(s);
      dObj.percentages.push(p);
      if (att.isPassed) dObj.passCount++;
      else dObj.failCount++;

      sObj.completed++;
      sObj.scores.push(s);
      if (att.isPassed) sObj.passCount++;
      else sObj.failCount++;
    }
  }

  const deptPerformance = Array.from(deptMap.values()).map((d) => {
    const avgScore =
      d.scores.length > 0
        ? Number((d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(2))
        : 0;
    const avgPct =
      d.percentages.length > 0
        ? Number((d.percentages.reduce((a, b) => a + b, 0) / d.percentages.length).toFixed(1))
        : 0;
    const passRate =
      d.completed > 0 ? Number(((d.passCount / d.completed) * 100).toFixed(1)) : 0;

    return {
      department: d.department,
      enrolled: d.enrolled,
      completed: d.completed,
      averageScore: avgScore,
      averagePercentage: avgPct,
      passCount: d.passCount,
      failCount: d.failCount,
      passRate,
    };
  });

  const sectionPerformance = Array.from(sectionMap.values()).map((s) => {
    const avgScore =
      s.scores.length > 0
        ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(2))
        : 0;
    const passRate =
      s.completed > 0 ? Number(((s.passCount / s.completed) * 100).toFixed(1)) : 0;

    return {
      department: s.department,
      section: s.section,
      enrolled: s.enrolled,
      completed: s.completed,
      averageScore: avgScore,
      passRate,
    };
  });

  res.json({
    exam: {
      id: exam.id,
      title: exam.title,
      passPercentage: Number(exam.passPercentage),
      durationMinutes: exam.durationMinutes,
      totalQuestions: exam._count.questions,
    },
    summary: {
      totalEnrolled,
      started: startedCount,
      completed: completedCount,
      autoSubmitted: autoSubmittedCount,
      manualSubmitted: manualSubmittedCount,
      averageScore,
      highestScore,
      lowestScore,
      passCount,
      failCount,
      passPercentage,
      avgCompletionTimeMinutes,
    },
    scoreDistribution: scoreBuckets,
    deptPerformance,
    sectionPerformance,
  });
}));

/**
 * 2. GET /api/admin/exams/:examId/analytics/questions
 * Returns item analysis and difficulty metrics for every question in the exam.
 */
r.get("/:examId/analytics/questions", h(async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { position: "asc" },
        include: {
          options: {
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!exam) {
    throw new HttpError(404, "Exam not found");
  }

  // Fetch all completed/started attempts for this exam
  const attempts = await prisma.attempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    include: {
      answers: true,
    },
  });

  const totalEvaluatedAttempts = attempts.length;

  // Build a map of questionId -> answers[]
  const answersByQuestion = new Map<string, Array<(typeof attempts)[0]["answers"][0]>>();
  for (const att of attempts) {
    for (const ans of att.answers) {
      if (!answersByQuestion.has(ans.questionId)) {
        answersByQuestion.set(ans.questionId, []);
      }
      answersByQuestion.get(ans.questionId)!.push(ans);
    }
  }

  const defaultMarks = Number(exam.defaultMarks);
  const defaultNegative = Number(exam.defaultNegative);

  const questionItems = exam.questions.map((q, idx) => {
    const qMarks = q.marks !== null ? Number(q.marks) : defaultMarks;
    const qNeg = q.negativeMarks !== null ? Number(q.negativeMarks) : defaultNegative;

    const answers = answersByQuestion.get(q.id) || [];
    const totalAssignedAttempts = totalEvaluatedAttempts;

    let attemptedCount = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let sumMarksObtained = 0;

    for (const ans of answers) {
      if (ans.selectedOptionId !== null) {
        attemptedCount++;
        if (ans.isCorrect === true) {
          correctCount++;
        } else if (ans.isCorrect === false) {
          wrongCount++;
        }
      }
      if (ans.marksObtained !== null) {
        sumMarksObtained += Number(ans.marksObtained);
      }
    }

    const unansweredCount = Math.max(0, totalAssignedAttempts - attemptedCount);

    const attemptedPercentage =
      totalAssignedAttempts > 0
        ? Number(((attemptedCount / totalAssignedAttempts) * 100).toFixed(1))
        : 0;
    const correctPercentage =
      totalAssignedAttempts > 0
        ? Number(((correctCount / totalAssignedAttempts) * 100).toFixed(1))
        : 0;
    const wrongPercentage =
      totalAssignedAttempts > 0
        ? Number(((wrongCount / totalAssignedAttempts) * 100).toFixed(1))
        : 0;
    const unansweredPercentage =
      totalAssignedAttempts > 0
        ? Number(((unansweredCount / totalAssignedAttempts) * 100).toFixed(1))
        : 0;

    const averageMarksObtained =
      totalAssignedAttempts > 0
        ? Number((sumMarksObtained / totalAssignedAttempts).toFixed(2))
        : 0;

    // Classification
    const isLowPerforming = totalAssignedAttempts > 0 && correctPercentage < 35 && attemptedCount > 0;
    let difficultyLevel: "EASY" | "MEDIUM" | "HARD" = "MEDIUM";
    if (correctPercentage >= 75) difficultyLevel = "EASY";
    else if (correctPercentage < 40) difficultyLevel = "HARD";

    return {
      index: idx + 1,
      id: q.id,
      questionText: q.questionText,
      marks: qMarks,
      negativeMarks: qNeg,
      totalAttempts: totalAssignedAttempts,
      attemptedCount,
      attemptedPercentage,
      correctCount,
      correctPercentage,
      wrongCount,
      wrongPercentage,
      unansweredCount,
      unansweredPercentage,
      averageMarksObtained,
      isLowPerforming,
      difficultyLevel,
    };
  });

  res.json({
    examId: exam.id,
    totalQuestions: exam.questions.length,
    totalEvaluatedAttempts,
    questions: questionItems,
  });
}));

/**
 * 3. GET /api/admin/exams/:examId/analytics/questions/export
 * Exports Question Analysis report as CSV.
 */
r.get("/:examId/analytics/questions/export", h(async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { position: "asc" },
      },
    },
  });

  if (!exam) {
    throw new HttpError(404, "Exam not found");
  }

  const attempts = await prisma.attempt.findMany({
    where: {
      examId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    include: { answers: true },
  });

  const totalAttempts = attempts.length;
  const answersByQuestion = new Map<string, Array<(typeof attempts)[0]["answers"][0]>>();
  for (const att of attempts) {
    for (const ans of att.answers) {
      if (!answersByQuestion.has(ans.questionId)) {
        answersByQuestion.set(ans.questionId, []);
      }
      answersByQuestion.get(ans.questionId)!.push(ans);
    }
  }

  const rows: string[] = [
    [
      "Question #",
      "Question Text",
      "Total Attempts",
      "Attempted Count",
      "Attempted %",
      "Correct Count",
      "Correct %",
      "Wrong Count",
      "Wrong %",
      "Unanswered Count",
      "Unanswered %",
      "Average Marks",
      "Difficulty Level",
    ].join(","),
  ];

  exam.questions.forEach((q, idx) => {
    const ansList = answersByQuestion.get(q.id) || [];
    let attempted = 0, correct = 0, wrong = 0, sumMarks = 0;

    for (const ans of ansList) {
      if (ans.selectedOptionId !== null) {
        attempted++;
        if (ans.isCorrect) correct++;
        else wrong++;
      }
      if (ans.marksObtained !== null) sumMarks += Number(ans.marksObtained);
    }

    const unans = Math.max(0, totalAttempts - attempted);
    const correctPct = totalAttempts > 0 ? ((correct / totalAttempts) * 100).toFixed(1) : "0.0";
    const wrongPct = totalAttempts > 0 ? ((wrong / totalAttempts) * 100).toFixed(1) : "0.0";
    const unansPct = totalAttempts > 0 ? ((unans / totalAttempts) * 100).toFixed(1) : "0.0";
    const attPct = totalAttempts > 0 ? ((attempted / totalAttempts) * 100).toFixed(1) : "0.0";
    const avgMarks = totalAttempts > 0 ? (sumMarks / totalAttempts).toFixed(2) : "0.00";

    const numCorrectPct = Number(correctPct);
    const diff = numCorrectPct >= 75 ? "EASY" : numCorrectPct < 40 ? "HARD" : "MEDIUM";

    rows.push(
      [
        idx + 1,
        escapeCsvField(q.questionText),
        totalAttempts,
        attempted,
        `${attPct}%`,
        correct,
        `${correctPct}%`,
        wrong,
        `${wrongPct}%`,
        unans,
        `${unansPct}%`,
        avgMarks,
        diff,
      ].join(",")
    );
  });

  const csvContent = rows.join("\r\n");
  const filename = `question-analysis-${exam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvContent);
}));

/**
 * 4. GET /api/admin/exams/:examId/analytics/performance/export
 * Exports Comprehensive Student Performance report as CSV.
 */
r.get("/:examId/analytics/performance/export", h(async (req, res) => {
  const { examId } = req.params;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, passPercentage: true },
  });

  if (!exam) {
    throw new HttpError(404, "Exam not found");
  }

  const assignments = await prisma.examAssignment.findMany({
    where: { examId },
    include: {
      student: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const attempts = await prisma.attempt.findMany({
    where: { examId },
  });
  const attemptMap = new Map(attempts.map((a) => [a.studentId, a]));

  const rows: string[] = [
    [
      "Student Name",
      "Enrollment Number",
      "Department",
      "Section",
      "Attempt Status",
      "Started At",
      "Submitted At",
      "Time Spent (Mins)",
      "Score",
      "Total Marks",
      "Percentage",
      "Pass Status",
    ].join(","),
  ];

  for (const asgn of assignments) {
    const student = asgn.student;
    const att = attemptMap.get(asgn.studentId);

    let timeSpent = "—";
    if (att?.startedAt && att?.submittedAt) {
      const ms = new Date(att.submittedAt).getTime() - new Date(att.startedAt).getTime();
      timeSpent = (ms / (1000 * 60)).toFixed(1);
    }

    rows.push(
      [
        escapeCsvField(student.name),
        escapeCsvField(student.loginId),
        escapeCsvField(asgn.department || student.department || ""),
        escapeCsvField(asgn.section || student.section || ""),
        att ? att.status : "NOT_STARTED",
        att?.startedAt ? att.startedAt.toISOString() : "",
        att?.submittedAt ? att.submittedAt.toISOString() : "",
        timeSpent,
        att?.score !== null && att?.score !== undefined ? Number(att.score) : "",
        att?.totalMarks !== null && att?.totalMarks !== undefined ? Number(att.totalMarks) : "",
        att?.percentage !== null && att?.percentage !== undefined ? `${Number(att.percentage)}%` : "",
        att?.isPassed !== null && att?.isPassed !== undefined
          ? att.isPassed
            ? "PASS"
            : "FAIL"
          : "—",
      ].join(",")
    );
  }

  const csvContent = rows.join("\r\n");
  const filename = `student-performance-${exam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csvContent);
}));

export default r;
