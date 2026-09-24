import { useEffect, useState } from "react";
import {
  getExamAnalyticsOverview,
  getExamQuestionAnalytics,
  getExamResults,
  exportQuestionAnalyticsCsv,
  exportStudentPerformanceCsv,
  exportExamResultsCsv,
} from "../../services/adminApi";
import { Empty, ErrorState, Loading, Pagination } from "../../components/Common";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, card, input } from "../../components/ui";
import { fmt, messageFor } from "../../utils/errors";
import type {
  AdminExamResultItem,
  AdminExamResultsResponse,
  Exam,
  ExamAnalyticsOverviewResponse,
  ExamQuestionAnalyticsResponse,
} from "../../types";

function PrintableReportModal({
  exam,
  overview,
  questions,
  results,
  onClose,
}: {
  exam: Exam;
  overview: ExamAnalyticsOverviewResponse | null;
  questions: ExamQuestionAnalyticsResponse | null;
  results: AdminExamResultItem[];
  onClose: () => void;
}) {
  const summary = overview?.summary;

  return (
    <Modal title={`Printable Exam Summary — ${exam.title}`} onClose={onClose} wide>
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
        {/* Printable Header */}
        <div className="border-b pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{exam.title}</h2>
              <p className="text-xs text-slate-500">
                Official Examination Summary & Item Performance Report
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Generated: {new Date().toLocaleString()}</p>
              <p>Passing Threshold: {exam.passPercentage}%</p>
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
            <div>
              <span className="text-slate-500">Total Enrolled:</span>
              <p className="text-sm font-bold text-slate-900">{summary.totalEnrolled}</p>
            </div>
            <div>
              <span className="text-slate-500">Completed Attempts:</span>
              <p className="text-sm font-bold text-blue-700">{summary.completed}</p>
            </div>
            <div>
              <span className="text-slate-500">Average Score:</span>
              <p className="text-sm font-bold text-slate-900">
                {summary.averageScore} (Pass: {summary.passPercentage}%)
              </p>
            </div>
            <div>
              <span className="text-slate-500">Avg Completion Time:</span>
              <p className="text-sm font-bold text-slate-900">
                {summary.avgCompletionTimeMinutes} mins
              </p>
            </div>
          </div>
        )}

        {/* Question Item Analysis Table */}
        {questions && questions.questions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Question Item Performance
            </h3>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">#</th>
                    <th className="px-2 py-1.5 font-semibold">Question</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Attempts</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Correct %</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Wrong %</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Unanswered %</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Difficulty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {questions.questions.map((q) => (
                    <tr key={q.id}>
                      <td className="px-2 py-1.5 font-mono font-bold">{q.index}</td>
                      <td className="px-2 py-1.5 text-slate-800 line-clamp-1 max-w-xs">{q.questionText}</td>
                      <td className="px-2 py-1.5 text-center">{q.totalAttempts}</td>
                      <td className="px-2 py-1.5 text-center font-semibold text-emerald-700">
                        {q.correctPercentage}%
                      </td>
                      <td className="px-2 py-1.5 text-center text-rose-700">{q.wrongPercentage}%</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{q.unansweredPercentage}%</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{q.difficultyLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Student Results Table */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Student Performance Summary (Top 25)
            </h3>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Student</th>
                    <th className="px-2 py-1.5 font-semibold">Dept/Sec</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Score</th>
                    <th className="px-2 py-1.5 text-center font-semibold">%</th>
                    <th className="px-2 py-1.5 text-center font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.slice(0, 25).map((s) => (
                    <tr key={s.assignmentId}>
                      <td className="px-2 py-1.5 font-medium">{s.name} ({s.enrollmentNumber})</td>
                      <td className="px-2 py-1.5">{s.department || "—"} {s.section ? `(${s.section})` : ""}</td>
                      <td className="px-2 py-1.5">{s.attemptStatus}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{s.score !== null ? s.score : "—"}</td>
                      <td className="px-2 py-1.5 text-center">{s.percentage !== null ? `${s.percentage}%` : "—"}</td>
                      <td className="px-2 py-1.5 text-center font-bold">
                        {s.passStatus || (s.isPassed === true ? "PASS" : s.isPassed === false ? "FAIL" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <button
            onClick={() => window.print()}
            className={`${btnPrimary} !bg-indigo-600 hover:!bg-indigo-700`}
          >
            🖨️ Print Report
          </button>
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AnalyticsTab({ exam }: { exam: Exam }) {
  const toast = useToast();

  const [overview, setOverview] = useState<ExamAnalyticsOverviewResponse | null>(null);
  const [questions, setQuestions] = useState<ExamQuestionAnalyticsResponse | null>(null);
  const [resultsData, setResultsData] = useState<AdminExamResultsResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student list filtering state
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [exporting, setExporting] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [ov, qn, res] = await Promise.all([
        getExamAnalyticsOverview(exam.id),
        getExamQuestionAnalytics(exam.id),
        getExamResults(exam.id, {
          page,
          pageSize,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          result: resultFilter || undefined,
          department: departmentFilter || undefined,
          section: sectionFilter || undefined,
        }),
      ]);
      setOverview(ov);
      setQuestions(qn);
      setResultsData(res);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id, page, search, statusFilter, resultFilter, departmentFilter, sectionFilter]);

  async function handleExportCsv(type: "questions" | "performance" | "results") {
    setExporting(type);
    try {
      let csvText = "";
      let filename = "";
      const safeTitle = exam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      if (type === "questions") {
        csvText = await exportQuestionAnalyticsCsv(exam.id);
        filename = `question-analysis-${safeTitle}.csv`;
      } else if (type === "performance") {
        csvText = await exportStudentPerformanceCsv(exam.id);
        filename = `student-performance-${safeTitle}.csv`;
      } else {
        csvText = await exportExamResultsCsv(exam.id);
        filename = `exam-results-${safeTitle}.csv`;
      }

      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Report downloaded successfully");
    } catch (err) {
      toast.error(messageFor(err));
    } finally {
      setExporting(null);
    }
  }

  const summary = overview?.summary;
  const scoreBuckets = overview?.scoreDistribution || [];
  const deptPerf = overview?.deptPerformance || [];

  // Find max count in score buckets for scale
  const maxBucketCount = Math.max(1, ...scoreBuckets.map((b) => b.count));

  // Extract unique departments and sections for filters
  const uniqueDepts = Array.from(new Set(deptPerf.map((d) => d.department).filter(Boolean)));
  const uniqueSections = Array.from(
    new Set((overview?.sectionPerformance || []).map((s) => s.section).filter(Boolean))
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar with Export & Print Options */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Analytics & Performance Reports</h2>
          <p className="text-xs text-slate-500">
            Real-time item analysis, score distribution, and departmental comparisons
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => loadData()} disabled={loading}>
            Refresh
          </button>
          <button
            className={btn}
            onClick={() => handleExportCsv("questions")}
            disabled={!!exporting}
          >
            {exporting === "questions" ? "Exporting…" : "Question CSV"}
          </button>
          <button
            className={btn}
            onClick={() => handleExportCsv("performance")}
            disabled={!!exporting}
          >
            {exporting === "performance" ? "Exporting…" : "Student Perf CSV"}
          </button>
          <button
            className={btnPrimary}
            onClick={() => setShowPrintModal(true)}
            disabled={!overview}
          >
            🖨️ Printable Report
          </button>
        </div>
      </div>

      {loading && !overview && <Loading text="Aggregating exam analytics…" />}
      {error && <ErrorState error={error} onRetry={loadData} />}

      {overview && summary && (
        <>
          {/* 2. Overview Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Total Enrolled</p>
              <p className="text-xl font-bold text-slate-900">{summary.totalEnrolled}</p>
              <p className="mt-1 text-[11px] text-slate-500">Started: {summary.started}</p>
            </div>

            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Completed</p>
              <p className="text-xl font-bold text-blue-700">{summary.completed}</p>
              <p className="mt-1 text-[11px] text-slate-500">Auto: {summary.autoSubmitted}</p>
            </div>

            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Average Score</p>
              <p className="text-xl font-bold text-slate-900">{summary.averageScore}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                High: <span className="font-semibold text-emerald-700">{summary.highestScore}</span> · Low:{" "}
                <span className="font-semibold text-rose-700">{summary.lowestScore}</span>
              </p>
            </div>

            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Pass / Fail</p>
              <p className="text-xl font-bold text-slate-900">
                <span className="text-emerald-700">{summary.passCount}</span> /{" "}
                <span className="text-rose-700">{summary.failCount}</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Criteria: {exam.passPercentage}%</p>
            </div>

            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Pass Rate</p>
              <p className="text-xl font-bold text-emerald-700">{summary.passPercentage}%</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, summary.passPercentage))}%` }}
                />
              </div>
            </div>

            <div className={`${card} p-3`}>
              <p className="text-xs font-medium text-slate-500">Avg Time Spent</p>
              <p className="text-xl font-bold text-indigo-700">
                {summary.avgCompletionTimeMinutes} <span className="text-xs font-normal">mins</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Limit: {exam.durationMinutes}m</p>
            </div>
          </div>

          {/* 3. Visual Charts Grid (Pure React & SVG) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Chart 1: Score Distribution Histogram */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900">Score Distribution</h3>
                <span className="text-xs text-slate-500">Candidate score brackets</span>
              </div>

              <div className="pt-2">
                <div className="flex h-44 items-end justify-between gap-3 border-b pb-2 pt-4">
                  {scoreBuckets.map((b, idx) => {
                    const heightPercent = maxBucketCount > 0 ? (b.count / maxBucketCount) * 100 : 0;
                    const colors = [
                      "bg-rose-500",
                      "bg-amber-500",
                      "bg-blue-500",
                      "bg-indigo-500",
                      "bg-emerald-500",
                    ];

                    return (
                      <div key={b.range} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-xs font-bold text-slate-700">{b.count}</span>
                        <div className="w-full max-w-[48px] rounded-t-md bg-slate-100 flex items-end h-full">
                          <div
                            className={`w-full rounded-t-md ${colors[idx % colors.length]} transition-all duration-500`}
                            style={{ height: `${Math.max(4, heightPercent)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-slate-600 truncate">{b.range}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Chart 2: Pass vs Fail Ratio & Dept Performance */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-bold text-slate-900">Department Performance</h3>
                <span className="text-xs text-slate-500">Comparative pass rates</span>
              </div>

              {deptPerf.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">No department data recorded.</p>
              ) : (
                <div className="space-y-2.5 pt-1">
                  {deptPerf.map((d) => (
                    <div key={d.department} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          {d.department}{" "}
                          <span className="font-normal text-slate-500">
                            ({d.completed}/{d.enrolled} finished)
                          </span>
                        </span>
                        <span className="font-bold text-slate-900">
                          Avg: {d.averageScore} · <span className="text-emerald-700">{d.passRate}% Pass</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, d.passRate))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Question Item Performance & Difficulty Analysis */}
          {questions && questions.questions.length > 0 && (
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Question Item Analysis</h3>
                  <p className="text-xs text-slate-500">
                    Difficulty ratings, correct answer rates, and items requiring review
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                    Easy (≥75%)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
                    Medium (40–74%)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                    Hard (&lt;40%)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold w-12">#</th>
                      <th className="px-3 py-2.5 font-semibold">Question Text</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Attempts</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Correct %</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Wrong %</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Unanswered %</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Avg Marks</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Difficulty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {questions.questions.map((q) => {
                      let diffBadge = (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                          MEDIUM
                        </span>
                      );
                      if (q.difficultyLevel === "EASY") {
                        diffBadge = (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                            EASY
                          </span>
                        );
                      } else if (q.difficultyLevel === "HARD") {
                        diffBadge = (
                          <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                            HARD
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={q.id}
                          className={`hover:bg-slate-50/80 ${
                            q.isLowPerforming ? "bg-rose-50/20" : ""
                          }`}
                        >
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-700">{q.index}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900 line-clamp-2">{q.questionText}</div>
                            {q.isLowPerforming && (
                              <span className="inline-block mt-0.5 text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                                ⚠️ Review Recommended (Low Correct Rate)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-700">{q.totalAttempts}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-emerald-700">
                            {q.correctPercentage}%
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium text-rose-700">
                            {q.wrongPercentage}%
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-500">
                            {q.unansweredPercentage}%
                          </td>
                          <td className="px-3 py-2.5 text-center font-semibold text-slate-800">
                            {q.averageMarksObtained}
                          </td>
                          <td className="px-3 py-2.5 text-center">{diffBadge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Student Performance Analysis Section with Filters & Pagination */}
          <div className={`${card} p-4 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Student Performance Analysis</h3>
                <p className="text-xs text-slate-500">Filter and inspect individual performance data</p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                aria-label="Search student analysis"
                placeholder="Search candidate name, enrollment…"
                className={`${input} !mt-0 w-64 text-xs`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />

              {uniqueDepts.length > 0 && (
                <select
                  aria-label="Filter by department"
                  className={`${input} !mt-0 w-36 text-xs`}
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All Departments</option>
                  {uniqueDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

              {uniqueSections.length > 0 && (
                <select
                  aria-label="Filter by section"
                  className={`${input} !mt-0 w-28 text-xs`}
                  value={sectionFilter}
                  onChange={(e) => {
                    setSectionFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All Sections</option>
                  {uniqueSections.map((s) => (
                    <option key={s} value={s}>
                      Sec {s}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Filter by result"
                className={`${input} !mt-0 w-28 text-xs`}
                value={resultFilter}
                onChange={(e) => {
                  setResultFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Results</option>
                <option value="PASS">Pass</option>
                <option value="FAIL">Fail</option>
              </select>

              <select
                aria-label="Filter by attempt status"
                className={`${input} !mt-0 w-32 text-xs`}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="AUTO_SUBMITTED">Auto Submitted</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="NOT_STARTED">Not Started</option>
              </select>
            </div>

            {/* Results Table */}
            {resultsData && resultsData.items.length === 0 ? (
              <Empty title="No matching students found" hint="Try adjusting your filter settings." />
            ) : resultsData ? (
              <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Student</th>
                      <th className="px-3 py-2.5 font-semibold">Dept / Sec</th>
                      <th className="px-3 py-2.5 font-semibold">Attempt Status</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Score</th>
                      <th className="px-3 py-2.5 text-center font-semibold">%</th>
                      <th className="px-3 py-2.5 text-center font-semibold">Pass / Fail</th>
                      <th className="px-3 py-2.5 font-semibold">Submitted At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultsData.items.map((item) => (
                      <tr key={item.assignmentId} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="font-mono text-xs text-slate-500">{item.enrollmentNumber}</div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {item.department || "—"} {item.section ? `(${item.section})` : ""}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              item.attemptStatus === "SUBMITTED"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.attemptStatus === "AUTO_SUBMITTED"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {item.attemptStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                          {item.score !== null ? `${item.score} / ${item.totalMarks}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold">
                          {item.percentage !== null ? `${item.percentage}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.isPassed !== null ? (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold ${
                                item.isPassed
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {item.isPassed ? "PASS" : "FAIL"}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          {item.submittedAt ? fmt(item.submittedAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Pagination */}
            {resultsData && resultsData.total > pageSize && (
              <Pagination
                page={resultsData.page}
                pageSize={resultsData.pageSize}
                total={resultsData.total}
                onPage={(p) => setPage(p)}
              />
            )}
          </div>
        </>
      )}

      {/* 6. Printable Report Modal */}
      {showPrintModal && (
        <PrintableReportModal
          exam={exam}
          overview={overview}
          questions={questions}
          results={resultsData?.items || []}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
