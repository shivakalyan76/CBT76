import { useState, type FormEvent } from "react";
import Modal from "../../components/Modal";
import { FieldError } from "../../components/Common";
import { btn, btnPrimary, input } from "../../components/ui";
import { createQuestion, updateQuestion } from "../../services/adminApi";
import { fieldErrors, messageFor } from "../../utils/errors";
import type { Question } from "../../types";

const L = ["A", "B", "C", "D", "E", "F", "G", "H"];
interface Opt { text: string; correct: boolean }

export default function QuestionEditor({ examId, question, onClose, onSaved }: { examId: string; question?: Question; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(question?.questionText ?? "");
  const [opts, setOpts] = useState<Opt[]>(question ? question.options.map((o) => ({ text: o.optionText, correct: o.isCorrect })) : [0, 1, 2, 3].map(() => ({ text: "", correct: false })));
  const [marks, setMarks] = useState(question?.marks ?? "");
  const [neg, setNeg] = useState(question?.negativeMarks ?? "");
  const [expl, setExpl] = useState(question?.explanation ?? "");
  const [err, setErr] = useState(""); const [fe, setFe] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setFe({});
    const filled = opts.filter((o) => o.text.trim());
    if (!text.trim()) return setErr("Question text is required.");
    if (filled.length < 2) return setErr("Enter at least two options.");
    if (opts.some((o) => o.correct && !o.text.trim())) return setErr("The correct answer points to an empty option.");
    if (filled.filter((o) => o.correct).length !== 1) return setErr("Mark exactly one option as correct.");
    const body = {
      questionText: text.trim(), marks: marks === "" ? null : Number(marks), negativeMarks: neg === "" ? null : Number(neg),
      explanation: expl.trim() || null, options: filled.map((o) => ({ optionText: o.text.trim(), isCorrect: o.correct })),
    };
    setBusy(true);
    try { question ? await updateQuestion(question.id, body) : await createQuestion(examId, body); onSaved(); }
    catch (x) { setFe(fieldErrors(x)); setErr(messageFor(x)); } finally { setBusy(false); }
  }

  return (
    <Modal title={question ? "Edit question" : "Add question"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3 text-sm">
        {err && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{err}</p>}
        <label className="block font-medium">Question<textarea className={input} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus /><FieldError msgs={fe.questionText} /></label>
        <fieldset>
          <legend className="font-medium">Options (select the correct one)</legend>
          {opts.map((o, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <input type="radio" name="correct" checked={o.correct} onChange={() => setOpts(opts.map((x, j) => ({ ...x, correct: j === i })))} aria-label={`Option ${L[i]} is correct`} />
              <span className="w-5 font-semibold" aria-hidden>{L[i]}</span>
              <input className={`${input} mt-0`} value={o.text} placeholder={`Option ${L[i]}`} aria-label={`Option ${L[i]} text`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {opts.length > 2 && <button type="button" className={btn} aria-label={`Remove option ${L[i]}`} onClick={() => setOpts(opts.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
          <FieldError msgs={fe.options} />
          {opts.length < 8 && <button type="button" className={`${btn} mt-2`} onClick={() => setOpts([...opts, { text: "", correct: false }])}>Add option {L[opts.length]}</button>}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium">Marks (blank = exam default)<input type="number" step="0.25" min={0} className={input} value={marks} onChange={(e) => setMarks(e.target.value)} /><FieldError msgs={fe.marks} /></label>
          <label className="block font-medium">Negative marks (blank = exam default)<input type="number" step="0.25" min={0} className={input} value={neg} onChange={(e) => setNeg(e.target.value)} /><FieldError msgs={fe.negativeMarks} /></label>
        </div>
        <label className="block font-medium">Explanation (optional)<textarea className={input} rows={2} value={expl} onChange={(e) => setExpl(e.target.value)} /></label>
        <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Save question"}</button></div>
      </form>
    </Modal>
  );
}
