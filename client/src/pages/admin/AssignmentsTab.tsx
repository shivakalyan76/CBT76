import { useEffect, useState, type FormEvent } from "react";
import { useAsync } from "../../hooks/useAsync";
import {
  assignSingleStudent,
  assignStudents,
  importExamAssignments,
  listAssignments,
  listStudents,
  unassignStudent,
} from "../../services/adminApi";
import { Empty, ErrorState, FieldError, Loading, Pagination } from "../../components/Common";
import Modal, { ConfirmDialog } from "../../components/Modal";
import CsvImportModal from "../../components/CsvImportModal";
import CredentialsModal from "../../components/CredentialsModal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, input } from "../../components/ui";
import { fieldErrors, messageFor } from "../../utils/errors";
import type { AssignedStudent, Credential, Exam } from "../../types";

const ASSIGNMENT_CSV_TEMPLATE = "name,enrollment,department,section\nShivakalyan Thota,A120105225058,CSE,A\nAsha Rao,A120105225059,ECE,B\n";

function AssignStudentModal({
  examId,
  onClose,
  onAssigned,
}: {
  examId: string;
  onClose: () => void;
  onAssigned: (student: AssignedStudent) => void;
}) {
  const [f, setF] = useState({ name: "", enrollmentNumber: "", department: "", section: "" });
  const [err, setErr] = useState("");
  const [fe, setFe] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setFe({});
    try {
      const res = await assignSingleStudent(examId, {
        name: f.name.trim(),
        enrollmentNumber: f.enrollmentNumber.trim(),
        department: f.department.trim(),
        section: f.section.trim(),
      });
      onAssigned(res.assignment);
    } catch (x) {
      setFe(fieldErrors(x));
      setErr(Object.keys(fieldErrors(x)).length ? "Please fix the highlighted fields." : messageFor(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Assign student to exam" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">
          The server will automatically generate a unique 4-digit key for this student upon assignment.
        </p>
        {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        <label className="block text-sm font-medium">
          Student Name <span className="text-red-600">*</span>
          <input
            type="text"
            className={input}
            required
            autoFocus
            placeholder="e.g. Shivakalyan Thota"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <FieldError msgs={fe.name} />
        </label>
        <label className="block text-sm font-medium">
          Enrollment Number <span className="text-red-600">*</span>
          <input
            type="text"
            className={input}
            required
            placeholder="e.g. A120105225058"
            value={f.enrollmentNumber}
            onChange={(e) => setF({ ...f, enrollmentNumber: e.target.value })}
          />
          <FieldError msgs={fe.enrollmentNumber} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Department
            <input
              type="text"
              className={input}
              placeholder="e.g. CSE"
              value={f.department}
              onChange={(e) => setF({ ...f, department: e.target.value })}
            />
          </label>
          <label className="block text-sm font-medium">
            Section
            <input
              type="text"
              className={input}
              placeholder="e.g. A"
              value={f.section}
              onChange={(e) => setF({ ...f, section: e.target.value })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn} onClick={onClose}>
            Cancel
          </button>
          <button className={btnPrimary} disabled={busy}>
            {busy ? "Assigning & Generating Key…" : "Assign & Generate Key"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GeneratedKeyModal({
  student,
  onClose,
}: {
  student: AssignedStudent;
  onClose: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copyInfo = () => {
    const text = `Name: ${student.name}\nEnrollment: ${student.loginId}\nExam Key: ${student.examKey}\nDepartment: ${student.department || "N/A"}\nSection: ${student.section || "N/A"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Student assigned successfully" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Unique Exam Key Generated</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-3xl font-extrabold tracking-widest text-blue-900">{student.examKey}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(student.examKey || "");
                toast.success("Exam key copied!");
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700"
            >
              Copy Key
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-slate-50 p-3 text-slate-700">
          <p><strong>Student:</strong> {student.name}</p>
          <p><strong>Enrollment Number:</strong> <span className="font-mono">{student.loginId}</span></p>
          {student.department && <p><strong>Department:</strong> {student.department}</p>}
          {student.section && <p><strong>Section:</strong> {student.section}</p>}
        </div>

        <p className="text-xs text-slate-500">
          Give this 4-digit key and the enrollment number to the student. They will use these to enter and take the exam.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button className={btn} onClick={copyInfo}>
            {copied ? "Copied!" : "Copy Full Details"}
          </button>
          <button className={btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AssignmentsTab({ exam, onChanged }: { exam: Exam; onChanged: () => void }) {
  const toast = useToast();
  const assigned = useAsync(() => listAssignments(exam.id), [exam.id]);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const students = useAsync(() => listStudents({ page, pageSize: 8, search: q }), [page, q]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [rem, setRem] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const [assignModal, setAssignModal] = useState(false);
  const [csvModal, setCsvModal] = useState(false);
  const [justAssigned, setJustAssigned] = useState<AssignedStudent | null>(null);
  const [credsModal, setCredsModal] = useState<{ title: string; list: Credential[] } | null>(null);

  const assignedList = assigned.data ?? [];
  const assignedIds = new Set(assignedList.map((s) => s.id));
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };
  const refresh = () => {
    assigned.reload();
    onChanged();
  };

  async function assignSelectedExisting() {
    setBusy(true);
    try {
      const r = await assignStudents(exam.id, [...pick]);
      toast.success(`Assigned ${r.assigned}${r.skipped ? `, ${r.skipped} already assigned` : ""}`);
      setPick(new Set());
      refresh();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    const ids = [...rem];
    const results = await Promise.allSettled(ids.map((id) => unassignStudent(exam.id, id)));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed.length) {
      toast.error(`${ids.length - failed.length} removed, ${failed.length} failed: ${messageFor(failed[0].reason)}`);
    } else {
      toast.success(`Removed ${ids.length} student(s)`);
    }
    setRem(new Set());
    setConfirmRemove(false);
    refresh();
  }

  const copyAllKeys = () => {
    if (!assignedList.length) return;
    const lines = assignedList.map(
      (s) => `${s.name} | Enrollment: ${s.loginId} | Exam Key: ${s.examKey || "N/A"} | Dept: ${s.department || "N/A"} | Sec: ${s.section || "N/A"}`
    );
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`Copied ${assignedList.length} student key(s) to clipboard!`);
  };

  const pageIds = students.data?.items.filter((s) => !assignedIds.has(s.id)).map((s) => s.id) ?? [];

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Student Exam Assignments</h2>
          <p className="text-xs text-slate-500">
            Every assigned student receives a unique 4-digit key to take this exam.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={!assignedList.length} onClick={copyAllKeys}>
            📋 Copy All Keys
          </button>
          <button className={btn} onClick={() => setCsvModal(true)}>
            Import CSV
          </button>
          <button className={btnPrimary} onClick={() => setAssignModal(true)}>
            + Assign Student
          </button>
        </div>
      </div>

      {/* Main Assigned Students Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Assigned Students ({assigned.data?.length ?? "…"})
          </h3>
          {rem.size > 0 && (
            <button className={`${btn} text-red-600 hover:bg-red-50`} onClick={() => setConfirmRemove(true)}>
              Remove Selected ({rem.size})
            </button>
          )}
        </div>

        {assigned.loading && !assigned.data ? (
          <Loading />
        ) : assigned.error && !assigned.data ? (
          <ErrorState error={assigned.error} onRetry={assigned.reload} />
        ) : assignedList.length === 0 ? (
          <Empty
            title="No students assigned yet"
            hint="Click '+ Assign Student' to assign by Name, Enrollment, Department, Section or import a CSV."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="w-8 p-3">
                    <input
                      type="checkbox"
                      checked={rem.size === assignedList.length && assignedList.length > 0}
                      onChange={() => {
                        if (rem.size === assignedList.length) setRem(new Set());
                        else setRem(new Set(assignedList.map((s) => s.id)));
                      }}
                    />
                  </th>
                  <th className="p-3">Student Name</th>
                  <th className="p-3">Enrollment No.</th>
                  <th className="p-3">Dept / Section</th>
                  <th className="p-3">4-Digit Exam Key</th>
                  <th className="p-3">Attempt Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignedList.map((s) => {
                  const statusColors: Record<string, string> = {
                    NOT_STARTED: "bg-slate-100 text-slate-700",
                    IN_PROGRESS: "bg-blue-100 text-blue-800",
                    SUBMITTED: "bg-green-100 text-green-800",
                    AUTO_SUBMITTED: "bg-purple-100 text-purple-800",
                  };
                  const statusLabel = s.attemptStatus || "NOT_STARTED";

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={rem.has(s.id)}
                          onChange={() => toggle(rem, s.id, setRem)}
                        />
                      </td>
                      <td className="p-3 font-medium text-slate-900">{s.name}</td>
                      <td className="p-3 font-mono font-medium text-slate-700">{s.loginId}</td>
                      <td className="p-3 text-slate-600">
                        {s.department || s.section ? `${s.department || "—"} / ${s.section || "—"}` : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-blue-800 ring-1 ring-inset ring-blue-600/20">
                            {s.examKey || "—"}
                          </span>
                          {s.examKey && (
                            <button
                              type="button"
                              title="Copy Exam Key"
                              onClick={() => {
                                navigator.clipboard.writeText(s.examKey || "");
                                toast.success(`Copied key ${s.examKey} for ${s.name}`);
                              }}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              📋
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[statusLabel] || "bg-slate-100 text-slate-700"}`}>
                          {statusLabel.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40"
                          disabled={s.attemptStatus === "IN_PROGRESS" || s.attemptStatus === "SUBMITTED" || s.attemptStatus === "AUTO_SUBMITTED"}
                          onClick={async () => {
                            try {
                              await unassignStudent(exam.id, s.id);
                              toast.success("Removed assignment");
                              refresh();
                            } catch (e) {
                              toast.error(e);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Quick Assign from Registered Students Directory */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Or Select from Existing Student Directory</h3>
        <input
          className={`${input} mt-0 max-w-md`}
          placeholder="Search registered students by name or enrollment number..."
          aria-label="Search students"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {students.loading && !students.data ? (
          <Loading />
        ) : students.error && !students.data ? (
          <ErrorState error={students.error} onRetry={students.reload} />
        ) : (students.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-500">No matching registered students found.</p>
        ) : (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {students.data!.items.map((s) => {
                const already = assignedIds.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-xs transition-colors ${
                      already ? "bg-slate-50 text-slate-400 border-slate-200" : "bg-white text-slate-700 hover:border-blue-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={already}
                      checked={already || pick.has(s.id)}
                      onChange={() => toggle(pick, s.id, setPick)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate font-mono text-slate-500">{s.loginId}</p>
                    </div>
                    {already && <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px]">Assigned</span>}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
                <button
                  className={btn}
                  disabled={pageIds.length === 0}
                  onClick={() => setPick(new Set([...pick, ...pageIds]))}
                >
                  Select all on page
                </button>
                <button className={btn} disabled={pick.size === 0} onClick={() => setPick(new Set())}>
                  Clear
                </button>
                <button
                  className={btnPrimary}
                  disabled={pick.size === 0 || busy}
                  onClick={assignSelectedExisting}
                >
                  {busy ? "Assigning…" : `Assign Selected (${pick.size})`}
                </button>
              </div>
              <Pagination
                page={students.data!.page}
                pageSize={students.data!.pageSize}
                total={students.data!.total}
                onPage={setPage}
              />
            </div>
          </>
        )}
      </section>

      {/* Modals */}
      {assignModal && (
        <AssignStudentModal
          examId={exam.id}
          onClose={() => setAssignModal(false)}
          onAssigned={(assignedStudent) => {
            setAssignModal(false);
            refresh();
            setJustAssigned(assignedStudent);
          }}
        />
      )}

      {justAssigned && (
        <GeneratedKeyModal
          student={justAssigned}
          onClose={() => setJustAssigned(null)}
        />
      )}

      {csvModal && (
        <CsvImportModal
          title="Import exam student assignments from CSV"
          templateName="exam-assignments-template.csv"
          template={ASSIGNMENT_CSV_TEMPLATE}
          help={
            <>
              Columns: <code>name, enrollment, department, section</code>.
              Each student will be automatically assigned to this exam and given a unique 4-digit exam key.
            </>
          }
          run={(csv) => importExamAssignments(exam.id, csv)}
          onClose={() => setCsvModal(false)}
          onDone={(r) => {
            setCsvModal(false);
            toast.success(`Imported and assigned ${r.imported} student(s)`);
            refresh();
            if (r.assignments?.length) {
              setCredsModal({
                title: `Assigned Students & Generated Exam Keys (${r.assignments.length})`,
                list: r.assignments,
              });
            }
          }}
        />
      )}

      {credsModal && (
        <CredentialsModal
          title={credsModal.title}
          credentials={credsModal.list}
          onClose={() => setCredsModal(null)}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove assigned students?"
          danger
          confirmLabel="Remove"
          onClose={() => setConfirmRemove(false)}
          message={`Remove ${rem.size} student(s) from this exam? Students who have already started cannot be removed.`}
          onConfirm={removeSelected}
        />
      )}
    </div>
  );
}

