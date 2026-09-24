import { api } from "./api";
import type { CbtAttemptState, SecurityEventType, StudentEvaluationSummary, StudentVerificationResult } from "../types";

const S = "/student";

export const verifyStudentEntry = (enrollmentNumber: string, examKey: string) =>
  api<StudentVerificationResult>(`${S}/verify`, {
    method: "POST",
    body: { enrollmentNumber, examKey },
  });

export const startStudentExam = (examId: string) =>
  api<CbtAttemptState>(`${S}/start`, {
    method: "POST",
    body: { examId },
  });

export const getStudentAttempt = () =>
  api<{ attempt: CbtAttemptState | null }>(`${S}/attempt`);

export const saveStudentAnswer = (data: {
  attemptId: string;
  questionId: string;
  selectedOptionId?: string | null;
  markedForReview?: boolean;
  visited?: boolean;
}) =>
  api<{ ok: true; answer: { questionId: string; selectedOptionId: string | null; markedForReview: boolean; visited: boolean } }>(
    `${S}/answer`,
    {
      method: "POST",
      body: data,
    }
  );

export const submitStudentExam = (attemptId: string, autoSubmitted = false) =>
  api<{
    ok: true;
    status: "SUBMITTED" | "AUTO_SUBMITTED";
    submittedAt: string;
    examTitle: string;
    resultVisibility?: string;
    result?: StudentEvaluationSummary | null;
  }>(`${S}/submit`, {
    method: "POST",
    body: { attemptId, autoSubmitted },
  });

export const sendSecurityEvent = (
  attemptId: string,
  eventType: SecurityEventType,
  metadata?: Record<string, any>
) =>
  api<{ ok: true; eventId: string; eventType: string; timestamp: string }>(
    `${S}/event`,
    {
      method: "POST",
      body: { attemptId, eventType, metadata },
    }
  );


