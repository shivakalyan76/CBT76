import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { deleteExam, getExam, publishExam, unpublishExam } from "../../services/adminApi";
import { ErrorState, Loading, StatusBadge } from "../../components/Common";
import { ConfirmDialog } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, card } from "../../components/ui";
import { fmt, listDetails, messageFor } from "../../utils/errors";
import { ApiError } from "../../services/api";
import QuestionsTab from "./QuestionsTab";
import AssignmentsTab from "./AssignmentsTab";
import ResultsTab from "./ResultsTab";
import ActivityTab from "./ActivityTab";
import AnalyticsTab from "./AnalyticsTab";

export default function ExamDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: exam, error, loading, reload } = useAsync(() => getExam(id), [id]);
  const [tab, setTab] = useState<"questions" | "students" | "results" | "activity" | "analytics">("questions");
  const [problems, setProblems] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);

  if (loading && !exam) return <Loading />;
  if (error && !exam) return <ErrorState error={error} onRetry={reload} />;
  const e = exam!;
  const attempts = e._count?.attempts ?? 0;

  async function toggle() {
    setBusy(true); setProblems(null);
    try {
      if (e.status === "PUBLISHED") { await unpublishExam(e.id); toast.success("Exam unpublished"); }
      else { await publishExam(e.id); toast.success("Exam published"); }
      reload();
    } catch (x) {
      // Publish validation failures come back as 400 with a list of problems.
      if (x instanceof ApiError && x.status === 400 && listDetails(x).length) setProblems(listDetails(x) as string[]);
      else toast.error(x);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm"><Link to="/admin/exams" className="text-blue-700 hover:underline">← Exams</Link></p>
          <h1 className="flex items-center gap-2 text-xl font-semibold">{e.title} <StatusBadge status={e.status} /></h1>
          <p className="text-sm text-slate-600">{fmt(e.startTime)} → {fmt(e.endTime)} · {e.durationMinutes} min</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/admin/exams/${e.id}/edit`} className={btn}>Edit</Link>
          {e.status !== "ARCHIVED" && <button className={e.status === "PUBLISHED" ? btn : btnPrimary} disabled={busy} onClick={toggle}>{busy ? "Working…" : e.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>}
          <button className={btn} onClick={() => setDel(true)}>Delete</button>
        </div>
      </div>

      {problems && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">This exam can't be published yet:</p>
          <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      <div className={`${card} grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4`}>
        <p>Questions: <strong>{e._count?.questions}</strong>{e.totalQuestionsToAsk ? ` (asks ${e.totalQuestionsToAsk})` : ""}</p>
        <p>Assigned: <strong>{e._count?.assignments}</strong></p><p>Attempts: <strong>{attempts}</strong></p>
        <p>Default marks: {e.defaultMarks} / −{e.defaultNegative}</p><p>Pass: {e.passPercentage}%</p>
        <p>Shuffle: {e.shuffleQuestions ? "questions" : "no q"} · {e.shuffleOptions ? "options" : "no opt"}</p>
        <p>Camera: <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${e.cameraRequired ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{e.cameraRequired ? "📷 Required" : "Disabled"}</span></p>
      </div>

      <div role="tablist" className="flex gap-1 border-b">
        {(["questions", "students", "results", "activity", "analytics"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 ${tab === t ? "border-b-2 border-blue-700 text-blue-800" : "text-slate-600"}`}>
            {t === "questions"
              ? `Questions (${e._count?.questions ?? 0})`
              : t === "students"
              ? `Students (${e._count?.assignments ?? 0})`
              : t === "results"
              ? `Results (${attempts})`
              : t === "activity"
              ? "Activity / Monitoring"
              : "Analytics & Reports"}
          </button>
        ))}
      </div>
      {tab === "questions" ? (
        <QuestionsTab exam={e} onChanged={reload} />
      ) : tab === "students" ? (
        <AssignmentsTab exam={e} onChanged={reload} />
      ) : tab === "results" ? (
        <ResultsTab exam={e} />
      ) : tab === "activity" ? (
        <ActivityTab exam={e} />
      ) : (
        <AnalyticsTab exam={e} />
      )}

      {del && <ConfirmDialog title="Delete exam?" danger confirmLabel="Delete" onClose={() => setDel(false)}
        message={<>Delete <strong>{e.title}</strong>, its questions and assignments? This cannot be undone.{attempts > 0 && " This exam has attempts, so the server will refuse."}</>}
        onConfirm={async () => { try { await deleteExam(e.id); toast.success("Exam deleted"); nav("/admin/exams"); } catch (x) { toast.error(messageFor(x)); setDel(false); } }} />}
    </div>
  );
}
