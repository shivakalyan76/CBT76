import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { startStudentExam, getStudentAttempt } from "../../services/studentApi";
import { useToast } from "../../components/Toast";
import type { CbtAttemptState, StudentVerificationResult } from "../../types";

export default function ExamInstructions({
  verificationData,
  onStartExam,
}: {
  verificationData?: StudentVerificationResult | null;
  onStartExam?: (attempt: CbtAttemptState) => void;
}) {
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<StudentVerificationResult | null>(verificationData || null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!verificationData);

  useEffect(() => {
    if (!data) {
      const stored = sessionStorage.getItem("cbt_verification");
      if (stored) {
        try {
          setData(JSON.parse(stored));
          setLoading(false);
        } catch {
          // fall through
        }
      } else {
        // Check if there is already an active attempt
        getStudentAttempt()
          .then((res) => {
            if (res.attempt && onStartExam) {
              onStartExam(res.attempt);
            } else if (res.attempt) {
              nav("/exam/take");
            } else {
              nav("/exam");
            }
          })
          .catch(() => {
            nav("/exam");
          })
          .finally(() => setLoading(false));
      }
    }
  }, [data, nav, onStartExam]);

  async function handleStart() {
    if (!data?.exam?.id) return;
    if (!agreed) {
      toast.error("Please confirm that you have read and understood the instructions.");
      return;
    }

    setBusy(true);
    try {
      const attempt = await startStudentExam(data.exam.id);
      if (onStartExam) {
        onStartExam(attempt);
      } else {
        sessionStorage.setItem("cbt_active_attempt", JSON.stringify(attempt));
        nav("/exam/take");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to start exam. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading exam details…</span>
        </div>
      </div>
    );
  }

  const { student, exam } = data;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white shadow-md">
              CBT
            </div>
            <div>
              <h1 className="text-base font-bold text-white sm:text-lg">{exam.title}</h1>
              <p className="text-xs text-slate-400">Examination Instructions & Guidelines</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-white sm:text-sm">{student.name}</p>
            <p className="font-mono text-xs text-blue-400">{student.enrollmentNumber}</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left 2 Cols: Exam Specs & Detailed Rules */}
          <div className="space-y-6 lg:col-span-2">
            {/* Candidate & Exam Summary Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-lg backdrop-blur sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
                Examination Overview
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-xs text-slate-400">Duration</p>
                  <p className="mt-1 font-mono text-xl font-bold text-white">{exam.durationMinutes} min</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-xs text-slate-400">Total Questions</p>
                  <p className="mt-1 font-mono text-xl font-bold text-white">{exam.totalQuestions}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-xs text-slate-400">Default Marks</p>
                  <p className="mt-1 font-mono text-xl font-bold text-green-400">+{exam.defaultMarks}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                  <p className="text-xs text-slate-400">Negative Marks</p>
                  <p className="mt-1 font-mono text-xl font-bold text-red-400">-{exam.defaultNegative}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-800/80 pt-4 text-xs text-slate-300">
                <p><strong>Candidate:</strong> {student.name}</p>
                <p><strong>Enrollment:</strong> <span className="font-mono">{student.enrollmentNumber}</span></p>
                {student.department && <p><strong>Department:</strong> {student.department}</p>}
                {student.section && <p><strong>Section:</strong> {student.section}</p>}
              </div>
            </div>

            {/* General Instructions */}
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-lg backdrop-blur sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
                General Instructions
              </h2>

              {exam.instructions && (
                <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 text-sm leading-relaxed text-blue-200">
                  <p className="font-semibold text-blue-300">Specific Exam Instructions:</p>
                  <p className="mt-1 whitespace-pre-wrap">{exam.instructions}</p>
                </div>
              )}

              {exam.cameraRequired && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-xs sm:text-sm text-amber-200">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <span>📷</span>
                    <span>Live Camera Monitoring Required</span>
                  </div>
                  <p className="mt-1 leading-relaxed">
                    This examination requires standard webcam monitoring. When you click <strong>I am Ready to Begin</strong>, your browser will prompt you for camera permission. Please grant permission to display the live preview during the test. No video recordings or photos are saved.
                  </p>
                </div>
              )}

              <ul className="space-y-2.5 text-xs text-slate-300 sm:text-sm">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">1</span>
                  <span>The test consists of multiple choice questions (MCQs). Only one option is correct for each question.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">2</span>
                  <span><strong>Server Controlled Timer:</strong> The countdown timer in the top header indicates the remaining time. When the timer reaches zero, your exam will be automatically submitted.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">3</span>
                  <span><strong>Autosave:</strong> Every answer you select is saved automatically to the server. If your connection drops or the browser closes, you can reload and resume without losing your answers.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">4</span>
                  <span><strong>Question Palette:</strong> Use the palette on the right to jump directly to any question. You can also use Next, Previous, Clear Answer, and Mark for Review.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">5</span>
                  <span><strong>Submission & Lock:</strong> Once you click Submit and confirm, your attempt will be permanently locked and cannot be reopened.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Col: Question Palette Legend & Agreement */}
          <div className="space-y-6">
            {/* Legend Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 shadow-lg backdrop-blur sm:p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
                Question Status Legend
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                The Question Palette uses color codes to show the status of each question:
              </p>

              <div className="mt-4 space-y-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm">
                    1
                  </span>
                  <div>
                    <p className="font-semibold text-emerald-400">Answered</p>
                    <p className="text-slate-400">You have selected an option</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 font-bold text-white shadow-sm">
                    2
                  </span>
                  <div>
                    <p className="font-semibold text-red-400">Not Answered</p>
                    <p className="text-slate-400">Visited but not answered</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 font-bold text-white shadow-sm">
                    3
                  </span>
                  <div>
                    <p className="font-semibold text-purple-400">Marked for Review</p>
                    <p className="text-slate-400">Flagged to review later</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 font-bold text-white shadow-sm">
                      4
                    </span>
                    <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-slate-950 text-[8px] text-white">✓</span>
                  </div>
                  <div>
                    <p className="font-semibold text-purple-300">Answered & Marked for Review</p>
                    <p className="text-slate-400">Answered but marked for review</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 font-bold text-slate-300">
                    5
                  </span>
                  <div>
                    <p className="font-semibold text-slate-300">Not Visited</p>
                    <p className="text-slate-400">You have not opened this question yet</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Declaration & Begin Button */}
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-950/40 to-slate-950/70 p-5 shadow-xl sm:p-6">
              <label className="flex cursor-pointer items-start gap-3 select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-950"
                />
                <span className="text-xs leading-relaxed text-slate-300">
                  I declare that I have read and understood all the instructions above and I am ready to start the examination.
                </span>
              </label>

              <div className="mt-5">
                <button
                  type="button"
                  disabled={!agreed || busy}
                  onClick={handleStart}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Starting Exam…
                    </span>
                  ) : (
                    <>
                      <span>I AM READY TO BEGIN</span>
                      <span>→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
