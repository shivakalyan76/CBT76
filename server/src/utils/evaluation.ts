import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db";

export interface EvaluationResult {
  totalQuestions: number;
  attempted: number;
  unanswered: number;
  correct: number;
  wrong: number;
  score: number;
  totalMarks: number;
  percentage: number;
  isPassed: boolean;
  passPercentage: number;
}

/**
 * Server-side evaluation of a student's attempt.
 * Evaluates correctness, computes positive & negative marking, total score, percentage,
 * and pass/fail determination based on exam rules.
 */
export async function evaluateAttempt(
  attemptId: string,
  autoSubmitted = false
): Promise<EvaluationResult> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: {
        include: {
          questions: {
            include: {
              options: true,
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) {
    throw new Error("Attempt not found for evaluation");
  }

  const exam = attempt.exam;
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const orderedQuestionIds = (attempt.questionOrder as string[]) || exam.questions.map((q) => q.id);
  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const defaultMarks = Number(exam.defaultMarks);
  const defaultNegative = Number(exam.defaultNegative);
  const passPercentage = Number(exam.passPercentage);

  let totalQuestions = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let totalPossibleMarks = 0;
  let netScore = 0;

  const answerUpdates: Array<{
    questionId: string;
    isCorrect: boolean | null;
    marksObtained: number;
    selectedOptionId: string | null;
  }> = [];

  for (const qId of orderedQuestionIds) {
    const q = questionMap.get(qId);
    if (!q) continue;

    totalQuestions++;
    const qMarks = q.marks !== null ? Number(q.marks) : defaultMarks;
    const qNegative = q.negativeMarks !== null ? Number(q.negativeMarks) : defaultNegative;
    totalPossibleMarks += qMarks;

    const ans = answerMap.get(qId);
    const selectedOptId = ans?.selectedOptionId || null;

    if (!selectedOptId) {
      // Unanswered
      answerUpdates.push({
        questionId: qId,
        isCorrect: null,
        marksObtained: 0,
        selectedOptionId: null,
      });
    } else {
      const selectedOption = q.options.find((o) => o.id === selectedOptId);
      if (selectedOption?.isCorrect) {
        // Correct answer
        correctCount++;
        netScore += qMarks;
        answerUpdates.push({
          questionId: qId,
          isCorrect: true,
          marksObtained: qMarks,
          selectedOptionId: selectedOptId,
        });
      } else {
        // Wrong answer
        wrongCount++;
        netScore -= qNegative;
        answerUpdates.push({
          questionId: qId,
          isCorrect: false,
          marksObtained: -qNegative,
          selectedOptionId: selectedOptId,
        });
      }
    }
  }

  const attemptedCount = correctCount + wrongCount;
  const unansweredCount = totalQuestions - attemptedCount;

  // Round percentage to 2 decimal places
  const percentage = totalPossibleMarks > 0
    ? Math.round(((netScore / totalPossibleMarks) * 100) * 100) / 100
    : 0;

  const isPassed = percentage >= passPercentage;
  const now = new Date();

  // Persist evaluation results atomically
  await prisma.$transaction(async (tx) => {
    // 1. Update attempt summary
    await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        status: autoSubmitted ? "AUTO_SUBMITTED" : "SUBMITTED",
        submittedAt: now,
        totalQuestions,
        attempted: attemptedCount,
        correct: correctCount,
        wrong: wrongCount,
        score: new Prisma.Decimal(netScore.toFixed(2)),
        totalMarks: new Prisma.Decimal(totalPossibleMarks.toFixed(2)),
        percentage: new Prisma.Decimal(percentage.toFixed(2)),
        isPassed,
      },
    });

    // 2. Parallel updates/creates for answers inside transaction
    const answerPromises = answerUpdates.map((update) => {
      const existing = answerMap.get(update.questionId);
      if (existing) {
        return tx.answer.update({
          where: { id: existing.id },
          data: {
            isCorrect: update.isCorrect,
            marksObtained: new Prisma.Decimal(update.marksObtained.toFixed(2)),
          },
        });
      } else {
        return tx.answer.create({
          data: {
            attemptId: attempt.id,
            questionId: update.questionId,
            selectedOptionId: update.selectedOptionId,
            isCorrect: update.isCorrect,
            marksObtained: new Prisma.Decimal(update.marksObtained.toFixed(2)),
            visited: false,
          },
        });
      }
    });

    // 3. Log event
    const eventPromise = tx.examEvent.create({
      data: {
        attemptId: attempt.id,
        eventType: autoSubmitted ? "EXAM_AUTO_SUBMITTED" : "EXAM_SUBMITTED",
        metadata: {
          score: netScore,
          totalMarks: totalPossibleMarks,
          percentage,
          isPassed,
          correct: correctCount,
          wrong: wrongCount,
          unanswered: unansweredCount,
        },
      },
    });

    await Promise.all([...answerPromises, eventPromise]);
  }, {
    maxWait: 30000,
    timeout: 45000,
  });

  return {
    totalQuestions,
    attempted: attemptedCount,
    unanswered: unansweredCount,
    correct: correctCount,
    wrong: wrongCount,
    score: netScore,
    totalMarks: totalPossibleMarks,
    percentage,
    isPassed,
    passPercentage,
  };
}
