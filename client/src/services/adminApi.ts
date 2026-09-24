import { api, buildApiUrl } from "./api";
import type { AssignedStudent, Credential, Exam, ExamInput, Page, Question, QuestionInput, Student } from "../types";

const A = "/admin";
const qs = (o: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const listExams = (page: number, pageSize: number, status?: string) =>
  api<Page<Exam>>(`${A}/exams${qs({ page, pageSize, status })}`);
export const getExam = (id: string) => api<Exam>(`${A}/exams/${id}`);
export const createExam = (body: ExamInput) => api<Exam>(`${A}/exams`, { method: "POST", body });
export const updateExam = (id: string, body: ExamInput) => api<Exam>(`${A}/exams/${id}`, { method: "PUT", body });
export const deleteExam = (id: string) => api<{ ok: true }>(`${A}/exams/${id}`, { method: "DELETE" });
export const publishExam = (id: string) => api<Exam>(`${A}/exams/${id}/publish`, { method: "POST" });
export const unpublishExam = (id: string) => api<Exam>(`${A}/exams/${id}/unpublish`, { method: "POST" });

export const listAssignments = (id: string) => api<AssignedStudent[]>(`${A}/exams/${id}/assignments`);
export const assignStudents = (id: string, studentIds: string[]) =>
  api<{ assigned: number; skipped: number }>(`${A}/exams/${id}/assignments`, { method: "POST", body: { studentIds } });
export const assignSingleStudent = (examId: string, data: { name: string; enrollmentNumber: string; department?: string; section?: string }) =>
  api<{ assigned: number; assignment: AssignedStudent }>(`${A}/exams/${examId}/assignments`, { method: "POST", body: data });
export const importExamAssignments = (examId: string, csv: string) =>
  api<{ imported: number; totalInFile: number; assignments: Credential[] }>(`${A}/exams/${examId}/assignments/import`, { method: "POST", body: { csv } });
export const unassignStudent = (id: string, studentId: string) =>
  api<{ ok: true }>(`${A}/exams/${id}/assignments/${studentId}`, { method: "DELETE" });

export const listQuestions = (examId: string) => api<Question[]>(`${A}/exams/${examId}/questions`);
export const createQuestion = (examId: string, body: QuestionInput) =>
  api<Question>(`${A}/exams/${examId}/questions`, { method: "POST", body });
export const updateQuestion = (id: string, body: QuestionInput) => api<Question>(`${A}/questions/${id}`, { method: "PUT", body });
export const deleteQuestion = (id: string) => api<{ ok: true }>(`${A}/questions/${id}`, { method: "DELETE" });
export const importQuestions = (examId: string, csv: string) =>
  api<{ imported: number }>(`${A}/exams/${examId}/questions/import`, { method: "POST", body: { csv } });

export const listStudents = (p: { page: number; pageSize: number; search?: string }) =>
  api<Page<Student>>(`${A}/students${qs(p)}`);
export const createStudent = (body: { name: string; loginId: string; email?: string | null; password?: string }) =>
  api<{ id: string; name: string; loginId: string; generatedPassword?: string }>(`${A}/students`, { method: "POST", body });
export const patchStudent = (id: string, body: { password?: string; isActive?: boolean }) =>
  api<{ ok: true }>(`${A}/students/${id}`, { method: "PATCH", body });
export const importStudents = (csv: string) =>
  api<{ imported: number; generatedCredentials: Credential[] }>(`${A}/students/import`, { method: "POST", body: { csv } });

// Exam Results & Evaluation
import type {
  AdminExamResultsResponse,
  ExamActivityResponse,
  ExamAnalyticsOverviewResponse,
  ExamQuestionAnalyticsResponse,
  StudentActivityTimelineResponse,
  StudentResultDetailResponse,
} from "../types";

export const getExamResults = (
  examId: string,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    result?: string;
    department?: string;
    section?: string;
  }
) => api<AdminExamResultsResponse>(`${A}/exams/${examId}/results${qs(params)}`);

export const getStudentResultDetail = (examId: string, studentId: string) =>
  api<StudentResultDetailResponse>(`${A}/exams/${examId}/results/${studentId}`);

export const exportExamResultsCsv = async (examId: string) => {
  const res = await fetch(`/api${A}/exams/${examId}/results/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to export results CSV");
  return res.text();
};

// Phase 5: Activity & Security Monitoring
export const getExamActivity = (
  examId: string,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    suspiciousOnly?: boolean;
  }
) => api<ExamActivityResponse>(`${A}/exams/${examId}/activity${qs(params)}`);

export const getStudentActivityTimeline = (examId: string, studentId: string) =>
  api<StudentActivityTimelineResponse>(`${A}/exams/${examId}/activity/${studentId}`);

// Phase 6: Analytics & Reports
export const getExamAnalyticsOverview = (examId: string) =>
  api<ExamAnalyticsOverviewResponse>(`${A}/exams/${examId}/analytics/overview`);

export const getExamQuestionAnalytics = (examId: string) =>
  api<ExamQuestionAnalyticsResponse>(`${A}/exams/${examId}/analytics/questions`);

export const exportQuestionAnalyticsCsv = async (examId: string) => {
  const res = await fetch(buildApiUrl(`${A}/exams/${examId}/analytics/questions/export`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to export question analysis CSV");
  return res.text();
};

export const exportStudentPerformanceCsv = async (examId: string) => {
  const res = await fetch(buildApiUrl(`${A}/exams/${examId}/analytics/performance/export`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to export student performance CSV");
  return res.text();
};



