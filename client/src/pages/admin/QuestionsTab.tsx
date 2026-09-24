import { useState } from "react";
import { useAsync } from "../../hooks/useAsync";
import { deleteQuestion, importQuestions, listQuestions } from "../../services/adminApi";
import { Empty, ErrorState, Loading } from "../../components/Common";
import { ConfirmDialog } from "../../components/Modal";
import CsvImportModal from "../../components/CsvImportModal";
import QuestionEditor from "./QuestionEditor";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary } from "../../components/ui";
import type { Exam, Question } from "../../types";

const L = ["A", "B", "C", "D", "E", "F", "G", "H"];
const TEMPLATE = 'question,optionA,optionB,optionC,optionD,correctAnswer,marks,negativeMarks\n"What is HTML?","Language","Markup Language","Database","OS",B,1,0.25\n';

export default function QuestionsTab({ exam, onChanged }: { exam: Exam; onChanged: () => void }) {
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => listQuestions(exam.id), [exam.id]);
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [del, setDel] = useState<Question | null>(null);
  const [importing, setImporting] = useState(false);
  const locked = (exam._count?.attempts ?? 0) > 0;
  const refresh = () => { reload(); onChanged(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{data ? `${data.length} question(s)` : ""}{exam.status === "PUBLISHED" && " · exam is published; changes go live immediately"}</p>
        <div className="flex gap-2">
          <button className={btn} disabled={locked} onClick={() => setImporting(true)}>Import CSV</button>
          <button className={btnPrimary} disabled={locked} onClick={() => setEditing("new")}>Add question</button>
        </div>
      </div>
      {locked && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Students have started this exam; questions are locked.</p>}
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data!.length === 0 ? (
        <Empty title="No questions yet" hint="Add questions one by one or import a CSV." />
      ) : (
        <ol className="space-y-3">
          {data!.map((q, i) => (
            <li key={q.id} className="rounded-lg border bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap font-medium"><span className="text-slate-500">Q{i + 1}.</span> {q.questionText}</p>
                <span className="flex shrink-0 gap-1"><button className={btn} disabled={locked} onClick={() => setEditing(q)}>Edit</button><button className={btn} disabled={locked} onClick={() => setDel(q)}>Delete</button></span>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {q.options.map((o, j) => (
                  <li key={o.id} className={o.isCorrect ? "font-medium text-green-800" : "text-slate-700"}>{L[j]}. {o.optionText}{o.isCorrect && <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs">✓ Correct</span>}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Marks: {q.marks ?? `${exam.defaultMarks} (default)`} · Negative: {q.negativeMarks ?? `${exam.defaultNegative} (default)`}</p>
            </li>
          ))}
        </ol>
      )}
      {editing && <QuestionEditor examId={exam.id} question={editing === "new" ? undefined : editing} onClose={() => setEditing(null)}
        onSaved={() => { toast.success("Question saved"); setEditing(null); refresh(); }} />}
      {del && <ConfirmDialog title="Delete question?" danger confirmLabel="Delete" onClose={() => setDel(null)} message="This question and its options will be removed."
        onConfirm={async () => { try { await deleteQuestion(del.id); toast.success("Question deleted"); refresh(); } catch (e) { toast.error(e); } setDel(null); }} />}
      {importing && <CsvImportModal title="Import questions from CSV" templateName="questions-template.csv" template={TEMPLATE}
        help={<>Columns: <code>question, optionA…optionH, correctAnswer</code> (a letter), and optional <code>marks, negativeMarks, explanation</code>. Fill options in order (A, B, C…). If any row is invalid, <strong>nothing</strong> is imported and every problem is listed.</>}
        run={(csv) => importQuestions(exam.id, csv)} onClose={() => setImporting(false)}
        onDone={(r) => { toast.success(`Imported ${r.imported} question(s)`); setImporting(false); refresh(); }} />}
    </div>
  );
}
