import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { verifyStudentEntry } from "../../services/studentApi";
import { ApiError } from "../../services/api";
import type { StudentVerificationResult } from "../../types";

export default function ExamEntry({
  onVerified,
}: {
  onVerified?: (data: StudentVerificationResult) => void;
}) {
  const nav = useNavigate();
  const [enrollmentNumber, setEnrollmentNumber] = useState("");
  const [examKey, setExamKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!enrollmentNumber.trim()) {
      setError("Please enter your enrollment number.");
      return;
    }
    if (!examKey.trim() || examKey.trim().length < 4) {
      setError("Please enter your 4-digit exam key.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await verifyStudentEntry(enrollmentNumber.trim(), examKey.trim());
      if (onVerified) {
        onVerified(data);
      } else {
        // Store verification in sessionStorage for recovery / routing
        sessionStorage.setItem("cbt_verification", JSON.stringify(data));
        nav("/exam/instructions");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Unable to verify credentials. Please check your network connection.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100 selection:bg-blue-500 selection:text-white">
      {/* Subtle background ambient gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-600/20 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-[100px]" />
      </div>

      {/* Top institution / header bar */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-900/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 font-bold text-white shadow-lg shadow-blue-500/25">
              CBT
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                Computer Based Testing System
              </h1>
              <p className="text-xs text-slate-400">Secure Online Examination Portal</p>
            </div>
          </div>
          <a
            href="/login"
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-700/80 hover:text-white"
          >
            Admin Portal →
          </a>
        </div>
      </header>

      {/* Center entry form card */}
      <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                STUDENT EXAMINATION ENTRY
              </h2>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                Enter your enrollment number and assigned 4-digit exam key to begin.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200"
              >
                <svg className="h-4 w-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Enrollment Number
                </label>
                <div className="mt-1.5 relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. A120105225058"
                    value={enrollmentNumber}
                    onChange={(e) => setEnrollmentNumber(e.target.value.toUpperCase().trim())}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 font-mono text-sm tracking-wide text-white placeholder-slate-500 shadow-inner transition-all focus:border-blue-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  4-Digit Exam Key
                </label>
                <div className="mt-1.5 relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 5832"
                    value={examKey}
                    onChange={(e) => setExamKey(e.target.value.trim())}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-3 font-mono text-lg font-bold tracking-widest text-center text-blue-400 placeholder-slate-600 shadow-inner transition-all focus:border-blue-500 focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Verifying with Server…
                    </span>
                  ) : (
                    <>
                      <span>START EXAM</span>
                      <svg
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
              <p className="text-[11px] text-slate-500">
                Need your exam key? Please contact your exam invigilator or administrator.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-800/80 py-3 text-center text-xs text-slate-500">
        Computer Based Test Portal &copy; {new Date().getFullYear()} · All rights reserved.
      </footer>
    </div>
  );
}
