import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { createExam, getExam, updateExam } from "../../services/adminApi";
import { ErrorState, FieldError, Loading } from "../../components/Common";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, input } from "../../components/ui";
import { fieldErrors, messageFor, toLocalInput } from "../../utils/errors";
import type { ExamInput, ResultVisibility } from "../../types";

interface F {
  title: string; description: string; instructions: string; durationMinutes: string; startTime: string; endTime: string;
  totalQuestionsToAsk: string; shuffleQuestions: boolean; shuffleOptions: boolean; cameraRequired: boolean;
  defaultMarks: string; defaultNegative: string; passPercentage: string; resultVisibility: ResultVisibility;
}
const blank: F = { title: "", description: "", instructions: "", durationMinutes: "60", startTime: "", endTime: "", totalQuestionsToAsk: "",
  shuffleQuestions: false, shuffleOptions: false, cameraRequired: false, defaultMarks: "1", defaultNegative: "0", passPercentage: "40", resultVisibility: "HIDDEN" };

// Defined at module level so inputs keep focus between keystrokes.
const Field = ({ msgs, label, children }: { msgs?: string[]; label: string; children: ReactNode }) => (
  <label className="block text-sm font-medium">{label}{children}<FieldError msgs={msgs} /></label>
);

export default function ExamForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<F>(blank);
  const [errs, setErrs] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = useAsync(() => (id ? getExam(id) : Promise.resolve(null)), [id]);

  useEffect(() => {
    const e = existing.data;
    if (e) setF({ title: e.title, description: e.description ?? "", instructions: e.instructions ?? "", durationMinutes: String(e.durationMinutes),
      startTime: toLocalInput(e.startTime), endTime: toLocalInput(e.endTime), totalQuestionsToAsk: e.totalQuestionsToAsk?.toString() ?? "",
      shuffleQuestions: e.shuffleQuestions, shuffleOptions: e.shuffleOptions, cameraRequired: e.cameraRequired ?? false, defaultMarks: e.defaultMarks, defaultNegative: e.defaultNegative,
      passPercentage: e.passPercentage, resultVisibility: e.resultVisibility });
  }, [existing.data]);

  if (id && existing.loading && !existing.data) return <Loading />;
  if (id && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;
  const locked = (existing.data?._count?.attempts ?? 0) > 0;
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((s) => ({ ...s, [k]: v }));

  async function submit(ev: FormEvent) {
    ev.preventDefault(); setBanner(""); setErrs({});
    const local: Record<string, string[]> = {};
    if (!f.startTime) local.startTime = ["Start time is required"];
    if (!f.endTime) local.endTime = ["End time is required"];
    if (Object.keys(local).length) return setErrs(local);
    const body: ExamInput = {
      title: f.title, description: f.description || null, instructions: f.instructions || null,
      durationMinutes: Number(f.durationMinutes), startTime: new Date(f.startTime).toISOString(), endTime: new Date(f.endTime).toISOString(),
      totalQuestionsToAsk: f.totalQuestionsToAsk ? Number(f.totalQuestionsToAsk) : null,
      shuffleQuestions: f.shuffleQuestions, shuffleOptions: f.shuffleOptions,
      cameraRequired: f.cameraRequired,
      defaultMarks: Number(f.defaultMarks), defaultNegative: Number(f.defaultNegative), passPercentage: Number(f.passPercentage),
      resultVisibility: f.resultVisibility,
    };
    setBusy(true);
    try {
      const saved = id ? await updateExam(id, body) : await createExam(body);
      toast.success(id ? "Exam updated" : "Exam created");
      nav(`/admin/exams/${saved.id}`);
    } catch (e) {
      const fe = fieldErrors(e); setErrs(fe);
      setBanner(Object.keys(fe).length ? "Please fix the highlighted fields." : messageFor(e));
    } finally { setBusy(false); }
  }

  const lockedTitle = locked ? "Locked: students have already started" : undefined;

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 rounded-lg border bg-white p-5">
      <h1 className="text-xl font-semibold">{id ? "Edit exam" : "New exam"}</h1>
      {locked && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Students have started this exam, so duration, shuffling, camera, marks and question count are locked.</p>}
      {banner && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{banner}</p>}
      <Field msgs={errs.title} label="Title"><input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} /></Field>
      <Field msgs={errs.description} label="Description (optional)"><textarea className={input} rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field msgs={errs.instructions} label="Instructions shown to students"><textarea className={input} rows={5} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field msgs={errs.startTime} label="Opens at"><input type="datetime-local" className={input} value={f.startTime} onChange={(e) => set("startTime", e.target.value)} required /></Field>
        <Field msgs={errs.endTime} label="Closes at"><input type="datetime-local" className={input} value={f.endTime} onChange={(e) => set("endTime", e.target.value)} required /></Field>
        <Field msgs={errs.durationMinutes} label="Duration (minutes)"><input type="number" min={1} max={600} className={input} value={f.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} required disabled={locked} title={lockedTitle} /></Field>
        <Field msgs={errs.totalQuestionsToAsk} label="Questions per student (blank = all)"><input type="number" min={1} className={input} value={f.totalQuestionsToAsk} onChange={(e) => set("totalQuestionsToAsk", e.target.value)} disabled={locked} title={lockedTitle} /></Field>
        <Field msgs={errs.defaultMarks} label="Default marks per question"><input type="number" step="0.25" min={0} className={input} value={f.defaultMarks} onChange={(e) => set("defaultMarks", e.target.value)} required disabled={locked} title={lockedTitle} /></Field>
        <Field msgs={errs.defaultNegative} label="Default negative marks (wrong answer)"><input type="number" step="0.25" min={0} className={input} value={f.defaultNegative} onChange={(e) => set("defaultNegative", e.target.value)} required disabled={locked} title={lockedTitle} /></Field>
        <Field msgs={errs.passPercentage} label="Pass percentage"><input type="number" min={0} max={100} className={input} value={f.passPercentage} onChange={(e) => set("passPercentage", e.target.value)} required /></Field>
        <Field msgs={errs.resultVisibility} label="Students can see results">
          <select className={input} value={f.resultVisibility} onChange={(e) => set("resultVisibility", e.target.value as ResultVisibility)}>
            <option value="HIDDEN">Never (admin only)</option><option value="AFTER_SUBMIT">Right after submitting</option><option value="AFTER_EXAM_END">After the exam closes</option></select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        <fieldset className="space-y-2 text-sm rounded-md border border-slate-200 bg-slate-50/50 p-3">
          <legend className="font-semibold text-slate-800">Randomization</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.shuffleQuestions} onChange={(e) => set("shuffleQuestions", e.target.checked)} disabled={locked} /> Random question order</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.shuffleOptions} onChange={(e) => set("shuffleOptions", e.target.checked)} disabled={locked} /> Random option order</label>
        </fieldset>
        <fieldset className="space-y-2 text-sm rounded-md border border-slate-200 bg-slate-50/50 p-3">
          <legend className="font-semibold text-slate-800">Camera Monitoring</legend>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={f.cameraRequired}
              onChange={(e) => set("cameraRequired", e.target.checked)}
              disabled={locked}
            />
            <div>
              <span className="font-medium text-slate-900">Require Live Camera Preview</span>
              <p className="text-xs text-slate-500 mt-0.5">Requests standard browser webcam access on start and monitors camera connection status during the exam.</p>
            </div>
          </label>
        </fieldset>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Link to={id ? `/admin/exams/${id}` : "/admin/exams"} className={btn}>Cancel</Link>
        <button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save exam"}</button>
      </div>
    </form>
  );
}
