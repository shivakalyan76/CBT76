import { useEffect, useState } from "react";
import { getExamActivity, getStudentActivityTimeline } from "../../services/adminApi";
import { Empty, ErrorState, Loading, Pagination } from "../../components/Common";
import Modal from "../../components/Modal";
import { btn, card, input } from "../../components/ui";
import { fmt, messageFor } from "../../utils/errors";
import type { Exam, ExamActivityResponse, StudentActivitySummary, StudentActivityTimelineResponse } from "../../types";

function StudentActivityTimelineModal({
  examId,
  studentId,
  onClose,
}: {
  examId: string;
  studentId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StudentActivityTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getStudentActivityTimeline(examId, studentId)
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
      title={data ? `Activity Log — ${data.student.name}` : "Student Activity Timeline"}
      onClose={onClose}
      wide
    >
      {loading && <Loading text="Loading event history…" />}
      {error && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {data && (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Student Info Bar */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4 sm:text-sm">
            <div>
              <span className="text-slate-500">Student:</span>
              <p className="font-semibold text-slate-800">{data.student.name}</p>
              <p className="text-xs font-mono text-slate-500">{data.student.enrollmentNumber}</p>
            </div>
            <div>
              <span className="text-slate-500">Dept / Section:</span>
              <p className="font-semibold text-slate-800">
                {data.student.department || "—"} {data.student.section ? `(${data.student.section})` : ""}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Attempt Status:</span>
              <p className="font-semibold text-slate-800">
                {data.attempt ? (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      data.attempt.status === "SUBMITTED"
                        ? "bg-emerald-100 text-emerald-800"
                        : data.attempt.status === "AUTO_SUBMITTED"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {data.attempt.status}
                  </span>
                ) : (
                  <span className="text-slate-400">Not Started</span>
                )}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Suspicious Flags:</span>
              <p className="font-semibold">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                    data.suspiciousCount > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {data.suspiciousCount} flags
                </span>
              </p>
            </div>
          </div>

          {/* Timeline Table */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Event Audit Trail</h3>
            {data.events.length === 0 ? (
              <p className="text-sm text-slate-500">No activity events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b bg-slate-50 text-slate-600">
                    <tr>
                      <th className="w-36 px-3 py-2 font-semibold">Time</th>
                      <th className="px-3 py-2 font-semibold">Event</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Details / Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.events.map((evt) => {
                      const timeStr = new Date(evt.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      });

                      return (
                        <tr
                          key={evt.id}
                          className={`hover:bg-slate-50/80 ${
                            evt.isSuspicious ? "bg-rose-50/30" : ""
                          }`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {timeStr}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {evt.label}
                          </td>
                          <td className="px-3 py-2">
                            {evt.isSuspicious ? (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                                Suspicious
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                Normal
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                            {evt.metadata ? (
                              <span>
                                {evt.metadata.durationHiddenMs
                                  ? `Hidden for ${(evt.metadata.durationHiddenMs / 1000).toFixed(1)}s`
                                  : evt.metadata.ip
                                  ? `IP: ${evt.metadata.ip}`
                                  : JSON.stringify(evt.metadata)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Examiner Notice */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Examiner Guidance:</p>
            <p className="mt-0.5">
              Browser-level events provide circumstantial audit trails and context. They do not automatically disqualify
              candidates, as legitimate system notifications, multi-monitor displays, or OS popups can occasionally trigger window focus events.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button className={btn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function ActivityTab({ exam }: { exam: Exam }) {
  const [data, setData] = useState<ExamActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await getExamActivity(exam.id, {
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        suspiciousOnly: suspiciousOnly || undefined,
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
  }, [exam.id, page, search, statusFilter, suspiciousOnly]);

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* 1. Exam Activity Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Total Assigned</p>
            <p className="text-xl font-bold text-slate-900">{summary.totalAssigned}</p>
            <p className="mt-1 text-xs text-slate-500">Started: {summary.started}</p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Currently Active</p>
            <p className="text-xl font-bold text-blue-700">{summary.activeNow}</p>
            <p className="mt-1 text-xs text-slate-500">In Progress: {summary.inProgress}</p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Students with Flags</p>
            <p className="text-xl font-bold text-amber-700">{summary.studentsWithFlags}</p>
            <p className="mt-1 text-xs text-slate-500">Of {summary.started} started</p>
          </div>

          <div className={`${card} p-3`}>
            <p className="text-xs font-medium text-slate-500">Total Security Events</p>
            <p className="text-xl font-bold text-rose-700">{summary.totalSuspiciousEvents}</p>
            <p className="mt-1 text-xs text-slate-500">Recorded across exam</p>
          </div>
        </div>
      )}

      {/* 2. Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Search student activity"
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
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="AUTO_SUBMITTED">Auto Submitted</option>
            <option value="NOT_STARTED">Not Started</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer pl-1">
            <input
              type="checkbox"
              className="rounded text-blue-600 focus:ring-blue-500"
              checked={suspiciousOnly}
              onChange={(e) => {
                setSuspiciousOnly(e.target.checked);
                setPage(1);
              }}
            />
            Suspicious Only
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => loadData()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {/* 3. Table / Loading / Empty */}
      {loading && !data && <Loading text="Loading activity logs…" />}
      {error && <ErrorState error={error} onRetry={loadData} />}

      {data && data.items.length === 0 && (
        <Empty
          title="No activity records found"
          hint={
            search || statusFilter || suspiciousOnly
              ? "Try adjusting your search or filter settings."
              : "No student activity has been recorded for this exam yet."
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
                <th className="px-3 py-2.5 font-semibold">Last Activity</th>
                <th className="px-3 py-2.5 font-semibold text-center">Flags</th>
                <th className="px-3 py-2.5 font-semibold">Flag Breakdown</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item: StudentActivitySummary) => {
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
                  <tr
                    key={item.assignmentId}
                    className={`hover:bg-slate-50/80 ${
                      item.suspiciousEventsCount > 0 ? "bg-amber-50/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="font-mono text-xs text-slate-500">{item.enrollmentNumber}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {item.department || "—"} {item.section ? `(${item.section})` : ""}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {item.lastActivityAt ? fmt(item.lastActivityAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.suspiciousEventsCount > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                          {item.suspiciousEventsCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {item.suspiciousEventsCount > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.breakdown.tabSwitches > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              Tab: {item.breakdown.tabSwitches}
                            </span>
                          )}
                          {item.breakdown.fullscreenExits > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              FS Exit: {item.breakdown.fullscreenExits}
                            </span>
                          )}
                          {item.breakdown.windowBlurs > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              Blur: {item.breakdown.windowBlurs}
                            </span>
                          )}
                          {item.breakdown.refreshAttempts > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              Reload: {item.breakdown.refreshAttempts}
                            </span>
                          )}
                          {item.breakdown.connectionLosses > 0 && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                              Offline: {item.breakdown.connectionLosses}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">No flags</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {item.attemptId ? (
                        <button
                          className={`${btn} !py-1 !text-xs`}
                          onClick={() => setSelectedStudentId(item.studentId)}
                        >
                          View Event Log
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

      {/* 5. Student Event Log Timeline Modal */}
      {selectedStudentId && (
        <StudentActivityTimelineModal
          examId={exam.id}
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}
