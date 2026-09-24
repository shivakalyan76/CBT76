import { useEffect, useState } from "react";
import { getExamResults, getStudentResultDetail, exportExamResultsCsv } from "../../services/adminApi";
import { Empty, ErrorState, Loading, Pagination } from "../../components/Common";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, card, input } from "../../components/ui";
import { fmt, messageFor } from "../../utils/errors";
import type { AdminExamResultItem, AdminExamResultsResponse, Exam, StudentResultDetailResponse } from "../../types";

function StudentResultDetailModal({
  examId,
  studentId,
  onClose,
}: {
  examId: string;
  studentId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StudentResultDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getStudentResultDetail(examId, studentId)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(messageFor(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [examId, studentId]);

  return (
    <Modal
      title={data ? `Result Details — ${data.student.name}` : "Student Result Details"}
      onClose={onClose}
      wide
    >
      {loading && <Loading text="Loading detailed evaluation…" />}
      {error && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {data && (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Student & Exam Info */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4 sm:text-sm">
            <div>
              <span className="text-slate-500">Student:</span>
              <p className="font-semibold text-slate-800">{data.student.name}</p>
              <p className="text-xs text-slate-500">{data.student.enrollmentNumber}</p>
            </div>
            <div>
              <span className="text-slate-500">Dept / Section:</span>
              <p className="font-semibold text-slate-800">
                {data.student.department || "—"} {data.student.section ? `(${data.student.section})` : ""}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Status:</span>
              <p className="font-semibold">
                {data.attempt ? (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      data.attempt.isPassed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {data.attempt.isPassed ? "PASS" : "FAIL"} ({data.attempt.percentage ?? 0}%)
                  </span>
                ) : (
                  <span className="text-slate-500">Not Started</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Score:</span>
              <p className="font-semibold text-slate-800">
                {data.attempt ? `${data.attempt.score} / ${data.attempt.totalMarks}` : "—"}
              </p>
            </div>
          </div>

          {/* Metrics summary */}
          {data.attempt && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-center text-xs">
              <div className="rounded border bg-white p-2">
                <span className="text-slate-500">Total Questions</span>
                <p className="text-base font-bold text-slate-800">{data.attempt.totalQuestions}</p>
              </div>
              <div className="rounded border bg-white p-2">
                <span className="text-slate-500">Attempted</span>
                <p className="text-base font-bold text-blue-700">{data.attempt.attempted}</p>
              </div>
              <div className="rounded border bg-emerald-50 border-emerald-200 p-2">
                <span className="text-emerald-700">Correct</span>
                <p className="text-base font-bold text-emerald-800">{data.attempt.correct}</p>
              </div>
              <div className="rounded border bg-rose-50 border-rose-200 p-2">
                <span className="text-rose-700">Wrong</span>
                <p className="text-base font-bold text-rose-800">{data.attempt.wrong}</p>
              </div>
              <div className="rounded border bg-slate-50 border-slate-200 p-2">
                <span className="text-slate-500">Unanswered</span>
                <p className="text-base font-bold text-slate-700">{data.attempt.unanswered}</p>
              </div>
            </div>
          )}

          {/* Question-by-question breakdown */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-semibold text-slate-900">Question Evaluation Breakdown</h3>
            {!data.questions || data.questions.length === 0 ? (
              <p className="text-sm text-slate-500">No question response data available.</p>
            ) : (
              data.questions.map((q) => {
                const statusBadge =
                  q.status === "CORRECT" ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      CORRECT (+{q.marksObtained})
                    </span>
                  ) : q.status === "INCORRECT" ? (
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                      INCORRECT ({q.marksObtained})
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      UNANSWERED (0)
                    </span>
                  );

                return (
                  <div
                    key={q.id}
                    className={`rounded-lg border p-3.5 transition-colors ${
                      q.status === "CORRECT"
                        ? "border-emerald-200 bg-emerald-50/20"
                        : q.status === "INCORRECT"
                        ? "border-rose-200 bg-rose-50/20"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                          {q.index}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          Marks: +{q.marks} / −{q.negativeMarks}
                        </span>
                      </div>
                      <div>{statusBadge}</div>
                    </div>

                    <p className="mt-2 text-sm font-medium text-slate-900">{q.questionText}</p>

                    <div className="mt-3 space-y-1.5 pl-2 text-xs sm:text-sm">
                      {q.options.map((opt, idx) => {
                        const isStudentChoice = q.selectedOptionId === opt.id;
                        const isCorrectOption = opt.isCorrect;

                        let optStyle = "border-slate-200 bg-white text-slate-700";
                        if (isCorrectOption && isStudentChoice) {
                          optStyle = "border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-500";
                        } else if (isCorrectOption && !isStudentChoice) {
                          optStyle = "border-emerald-400 bg-emerald-50/60 text-emerald-800";
                        } else if (isStudentChoice && !isCorrectOption) {
                          optStyle = "border-rose-400 bg-rose-50 text-rose-900 font-medium ring-1 ring-rose-400";
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between rounded border px-3 py-2 ${optStyle}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-500">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              <span>{opt.optionText}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              {isStudentChoice && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">
                                  Selected
                                </span>
                              )}
                              {isCorrectOption && (
                                <span className="rounded bg-emerald-600 px-1.5 py-0.5 font-medium text-white">
                                  Correct
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-2.5 rounded bg-blue-50 p-2 text-xs text-blue-900">
                        <span className="font-semibold">Explanation: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button className={btn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function ResultsTab({ exam }: { exam: Exam }) {
  const toast = useToast();
  const [data, setData] = useState<AdminExamResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getExamResults(exam.id, {
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        result: resultFilter || undefined,
      });
      setData(res);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id, page, search, statusFilter, resultFilter]);

  async function handleExportCsv() {
    setExporting(true);
    try {
      const csvText = await exportExamResultsCsv(exam.id);
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = exam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.href = url;
      a.download = `${safeTitle}-results.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Exam results exported successfully");
    } catch (err) {
      toast.error(messageFor(err));
    } finally {
      setExporting(false);
    }
  }

  const stats = data?.stats;

  return (
    <div className="space-y-4">
      {/* 1. Exam Statistics Overview */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Total Assigned</p>
            <p className="text-xl font-bold text-slate-900">{stats.totalAssigned}</p>
            <p className="mt-1 text-xs text-slate-500">
              Started: {stats.started} · Active: {stats.started - stats.submitted - stats.autoSubmitted}
            </p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Submissions</p>
            <p className="text-xl font-bold text-blue-700">{stats.submitted + stats.autoSubmitted}</p>
            <p className="mt-1 text-xs text-slate-500">
              Manual: {stats.submitted} · Auto: {stats.autoSubmitted}
            </p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Average Score</p>
            <p className="text-xl font-bold text-slate-900">{stats.averageScore}</p>
            <p className="mt-1 text-xs text-slate-500">
              High: <span className="font-semibold text-emerald-700">{stats.highestScore}</span> · Low:{" "}
              <span className="font-semibold text-rose-700">{stats.lowestScore}</span>
            </p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Pass / Fail</p>
            <p className="text-xl font-bold text-slate-900">
              <span className="text-emerald-700">{stats.passCount}</span> /{" "}
              <span className="text-rose-700">{stats.failCount}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Passing criteria: {exam.passPercentage}%</p>
          </div>

          <div className={`${card} p-3 col-span-2 sm:col-span-4 lg:col-span-1`}>
            <p className="text-xs font-medium text-slate-500">Pass Rate</p>
            <p className="text-xl font-bold text-emerald-700">{stats.passPercentage}%</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, stats.passPercentage))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Filter & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Search student results"
            placeholder="Search by name, enrollment, dept…"
            className={`${input} !mt-0 w-64 text-xs`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <select
            aria-label="Filter by attempt status"
            className={`${input} !mt-0 w-36 text-xs`}
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

          <select
            aria-label="Filter by pass or fail"
            className={`${input} !mt-0 w-32 text-xs`}
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Results</option>
            <option value="PASS">Passed</option>
            <option value="FAIL">Failed</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => loadData()} disabled={loading}>
            Refresh
          </button>
          <button
            className={btnPrimary}
            onClick={handleExportCsv}
            disabled={exporting || !data?.items.length}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* 3. Error / Loading / Table */}
      {loading && !data && <Loading text="Loading exam results…" />}
      {error && <ErrorState error={error} onRetry={loadData} />}

      {data && data.items.length === 0 && (
        <Empty
          title="No student results found"
          hint={
            search || statusFilter || resultFilter
              ? "Try resetting your search or filter criteria."
              : "No students assigned or no exam attempts recorded yet."
          }
        />
      )}

      {data && data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Student</th>
                <th className="px-3 py-2.5 font-semibold">Dept / Sec</th>
                <th className="px-3 py-2.5 font-semibold">Attempt Status</th>
                <th className="px-3 py-2.5 font-semibold text-center">Score</th>
                <th className="px-3 py-2.5 font-semibold text-center">%</th>
                <th className="px-3 py-2.5 font-semibold text-center">C / W / U</th>
                <th className="px-3 py-2.5 font-semibold text-center">Result</th>
                <th className="px-3 py-2.5 font-semibold">Submitted At</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item: AdminExamResultItem) => {
                const isEvaluated = item.score !== null && item.attemptStatus !== "NOT_STARTED";
                const isPass = item.isPassed === true;

                let statusBadge = (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    Not Started
                  </span>
                );
                if (item.attemptStatus === "IN_PROGRESS") {
                  statusBadge = (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      In Progress
                    </span>
                  );
                } else if (item.attemptStatus === "SUBMITTED") {
                  statusBadge = (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Submitted
                    </span>
                  );
                } else if (item.attemptStatus === "AUTO_SUBMITTED") {
                  statusBadge = (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Auto-Submitted
                    </span>
                  );
                }

                return (
                  <tr key={item.assignmentId} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="font-mono text-xs text-slate-500">{item.enrollmentNumber}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.department || "—"} {item.section ? `(${item.section})` : ""}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge}</td>
                    <td className="px-3 py-2.5 text-center font-semibold text-slate-900">
                      {isEvaluated ? `${item.score} / ${item.totalMarks}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center font-medium">
                      {isEvaluated ? `${item.percentage}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {isEvaluated ? (
                        <span className="font-mono">
                          <span className="text-emerald-700 font-bold">{item.correct}</span> /{" "}
                          <span className="text-rose-700 font-bold">{item.wrong}</span> /{" "}
                          <span className="text-slate-500">{item.unanswered}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {isEvaluated && item.isPassed !== null ? (
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                            isPass ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {isPass ? "PASS" : "FAIL"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {item.submittedAt ? fmt(item.submittedAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {item.attemptId ? (
                        <button
                          className={`${btn} !py-1 !text-xs`}
                          onClick={() => setDetailStudentId(item.studentId)}
                        >
                          View Breakdown
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Pagination */}
      {data && data.total > pageSize && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPage={(p) => setPage(p)}
        />
      )}

      {/* 5. Detail Breakdown Modal */}
      {detailStudentId && (
        <StudentResultDetailModal
          examId={exam.id}
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
        />
      )}
    </div>
  );
}
