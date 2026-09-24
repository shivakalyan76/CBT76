export type Role = "ADMIN" | "STUDENT";
export interface User { id: string; name: string; loginId: string; role: Role; department?: string | null; section?: string | null }

export type ExamStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ResultVisibility = "HIDDEN" | "AFTER_SUBMIT" | "AFTER_EXAM_END";

// Prisma Decimal fields arrive as strings in JSON.
export interface Exam {
  id: string; title: string; description: string | null; instructions: string | null;
  durationMinutes: number; startTime: string; endTime: string; status: ExamStatus;
  totalQuestionsToAsk: number | null; shuffleQuestions: boolean; shuffleOptions: boolean;
  cameraRequired: boolean;
  defaultMarks: string; defaultNegative: string; passPercentage: string; resultVisibility: ResultVisibility;
  _count?: { questions: number; assignments: number; attempts: number };
}
export interface ExamInput {
  title: string; description: string | null; instructions: string | null;
  durationMinutes: number; startTime: string; endTime: string; totalQuestionsToAsk: number | null;
  shuffleQuestions: boolean; shuffleOptions: boolean;
  cameraRequired?: boolean;
  defaultMarks: number; defaultNegative: number; passPercentage: number; resultVisibility: ResultVisibility;
}
export interface Option { id: string; optionText: string; isCorrect: boolean; position: number }
export interface Question {
  id: string; questionText: string; marks: string | null; negativeMarks: string | null;
  explanation: string | null; position: number; options: Option[];
}
export interface QuestionInput {
  questionText: string; marks: number | null; negativeMarks: number | null; explanation: string | null;
  options: { optionText: string; isCorrect: boolean }[];
}
export interface Student {
  id: string; name: string; loginId: string; email: string | null;
  department?: string | null; section?: string | null; isActive: boolean; createdAt: string;
}
export interface AssignedStudent {
  id: string; assignmentId?: string; name: string; loginId: string;
  department?: string; section?: string; examKey?: string; isActive?: boolean;
  attemptStatus?: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt?: string | null; submittedAt?: string | null;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface Credential { loginId: string; name: string; password?: string; examKey?: string; department?: string; section?: string }

// Student CBT examination & evaluation types
export interface StudentVerificationResult {
  student: {
    id: string;
    name: string;
    enrollmentNumber: string;
    department: string;
    section: string;
  };
  exam: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    cameraRequired?: boolean;
    defaultMarks: string;
    defaultNegative: string;
    passPercentage: string;
    resultVisibility?: ResultVisibility;
    totalQuestions: number;
  };
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    deadline: string;
  } | null;
}

export interface CbtQuestionOption {
  id: string;
  optionText: string;
}

export interface CbtQuestion {
  id: string;
  index: number;
  questionText: string;
  marks: string;
  negativeMarks: string;
  options: CbtQuestionOption[];
}

export interface CbtAnswerState {
  selectedOptionId: string | null;
  markedForReview: boolean;
  visited: boolean;
}

export interface StudentEvaluationSummary {
  totalQuestions: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  score: number;
  totalMarks: number;
  percentage: number;
  isPassed: boolean;
  passPercentage?: number;
  status: "PASS" | "FAIL";
}

export interface CbtAttemptState {
  attemptId: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt: string;
  deadline: string;
  remainingSeconds: number;
  totalQuestions: number;
  questions: CbtQuestion[];
  answers: Record<string, CbtAnswerState>;
  exam: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    durationMinutes: number;
    cameraRequired?: boolean;
    defaultMarks: string;
    defaultNegative: string;
    resultVisibility?: ResultVisibility;
  };
  student: {
    id: string;
    name: string;
    enrollmentNumber: string;
    department?: string;
    section?: string;
  };
  locked?: boolean;
  submittedAt?: string;
  resultVisibility?: ResultVisibility;
  result?: StudentEvaluationSummary | null;
  message?: string;
}

// Admin Results & Evaluation types
export interface ExamStatistics {
  totalAssigned: number;
  started: number;
  submitted: number;
  autoSubmitted: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  passCount: number;
  failCount: number;
  passPercentage: number;
}

export interface AdminExamResultItem {
  assignmentId: string;
  studentId: string;
  name: string;
  enrollmentNumber: string;
  department: string;
  section: string;
  examKey: string;
  attemptId: string | null;
  attemptStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  score: number | null;
  totalMarks: number | null;
  percentage: number | null;
  isPassed: boolean | null;
  passStatus: string;
  correct: number | null;
  wrong: number | null;
  unanswered: number | null;
  attempted: number | null;
  totalQuestions: number | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export interface AdminExamResultsResponse {
  items: AdminExamResultItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: ExamStatistics;
}

export interface QuestionEvaluationDetail {
  index: number;
  id: string;
  questionText: string;
  marks: number;
  negativeMarks: number;
  explanation: string | null;
  options: Array<{
    id: string;
    optionText: string;
    isCorrect: boolean;
  }>;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  correctOptionId: string | null;
  correctOptionText: string | null;
  status: "CORRECT" | "INCORRECT" | "UNANSWERED";
  marksObtained: number;
}

export interface StudentResultDetailResponse {
  student: {
    id: string;
    name: string;
    enrollmentNumber: string;
    department: string;
    section: string;
  };
  exam: {
    id: string;
    title: string;
    passPercentage: number;
    defaultMarks?: number;
    defaultNegative?: number;
  };
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    submittedAt: string;
    score: number | null;
    totalMarks: number | null;
    percentage: number | null;
    isPassed: boolean | null;
    totalQuestions: number;
    attempted: number;
    correct: number;
    wrong: number;
    unanswered: number;
  } | null;
  questions?: QuestionEvaluationDetail[];
  message?: string;
}

// Phase 5: Security & Activity Monitoring types
export type SecurityEventType =
  | "EXAM_STARTED"
  | "TAB_SWITCH"
  | "FULLSCREEN_EXIT"
  | "FULLSCREEN_ENTER"
  | "FULLSCREEN_RESTORED"
  | "PAGE_HIDDEN"
  | "PAGE_VISIBLE"
  | "CONNECTION_LOST"
  | "CONNECTION_RESTORED"
  | "REFRESH_ATTEMPT"
  | "WINDOW_BLUR"
  | "WINDOW_FOCUS"
  | "LEAVE_ATTEMPT"
  | "CAMERA_PERMISSION_GRANTED"
  | "CAMERA_PERMISSION_DENIED"
  | "CAMERA_STARTED"
  | "CAMERA_STOPPED"
  | "CAMERA_DISCONNECTED"
  | "CAMERA_RECONNECTED"
  | "EXAM_SUBMITTED"
  | "AUTO_SUBMITTED";

export interface SuspiciousBreakdown {
  tabSwitches: number;
  fullscreenExits: number;
  windowBlurs: number;
  refreshAttempts: number;
  connectionLosses: number;
}

export interface StudentActivitySummary {
  assignmentId: string;
  studentId: string;
  name: string;
  enrollmentNumber: string;
  department: string;
  section: string;
  attemptId: string | null;
  attemptStatus: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
  startedAt: string | null;
  submittedAt: string | null;
  lastActivityAt: string | null;
  totalEventsCount: number;
  suspiciousEventsCount: number;
  breakdown: SuspiciousBreakdown;
  latestEventType: string | null;
  latestEventLabel: string | null;
}

export interface ExamActivityResponse {
  items: StudentActivitySummary[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalAssigned: number;
    started: number;
    inProgress: number;
    submitted: number;
    activeNow: number;
    totalSuspiciousEvents: number;
    studentsWithFlags: number;
  };
}

export interface StudentExamEventItem {
  id: string;
  eventType: string;
  label: string;
  isSuspicious: boolean;
  timestamp: string;
  metadata: Record<string, any> | null;
}

export interface StudentActivityTimelineResponse {
  student: {
    id: string;
    name: string;
    enrollmentNumber: string;
    department: string;
    section: string;
  };
  attempt: {
    id: string;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    deadline: string;
  } | null;
  events: StudentExamEventItem[];
  suspiciousCount: number;
}

// Phase 6: Analytics & Reports types
export interface ScoreBucket {
  range: string;
  min: number;
  max: number;
  count: number;
}

export interface DepartmentPerformance {
  department: string;
  enrolled: number;
  completed: number;
  averageScore: number;
  averagePercentage: number;
  passCount: number;
  failCount: number;
  passRate: number;
}

export interface SectionPerformance {
  department: string;
  section: string;
  enrolled: number;
  completed: number;
  averageScore: number;
  passRate: number;
}

export interface ExamAnalyticsOverviewResponse {
  exam: {
    id: string;
    title: string;
    passPercentage: number;
    durationMinutes: number;
    totalQuestions: number;
  };
  summary: {
    totalEnrolled: number;
    started: number;
    completed: number;
    autoSubmitted: number;
    manualSubmitted: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    passCount: number;
    failCount: number;
    passPercentage: number;
    avgCompletionTimeMinutes: number;
  };
  scoreDistribution: ScoreBucket[];
  deptPerformance: DepartmentPerformance[];
  sectionPerformance: SectionPerformance[];
}

export interface QuestionAnalyticsItem {
  index: number;
  id: string;
  questionText: string;
  marks: number;
  negativeMarks: number;
  totalAttempts: number;
  attemptedCount: number;
  attemptedPercentage: number;
  correctCount: number;
  correctPercentage: number;
  wrongCount: number;
  wrongPercentage: number;
  unansweredCount: number;
  unansweredPercentage: number;
  averageMarksObtained: number;
  isLowPerforming: boolean;
  difficultyLevel: "EASY" | "MEDIUM" | "HARD";
}

export interface ExamQuestionAnalyticsResponse {
  examId: string;
  totalQuestions: number;
  totalEvaluatedAttempts: number;
  questions: QuestionAnalyticsItem[];
}


