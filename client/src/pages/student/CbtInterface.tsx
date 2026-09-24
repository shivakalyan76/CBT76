import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, buildApiUrl } from "../../services/api";
import { getStudentAttempt, saveStudentAnswer, submitStudentExam, sendSecurityEvent } from "../../services/studentApi";
import { useToast } from "../../components/Toast";
import CameraPreview, { type CameraStatus } from "../../components/CameraPreview";
import type { CbtAttemptState, CbtQuestion, SecurityEventType } from "../../types";

export default function CbtInterface({
  initialAttempt,
}: {
  initialAttempt?: CbtAttemptState | null;
}) {
  const nav = useNavigate();
  const toast = useToast();

  const isInitialSubmitted =
    initialAttempt?.status === "SUBMITTED" || initialAttempt?.status === "AUTO_SUBMITTED";

  const [attempt, setAttempt] = useState<CbtAttemptState | null>(
    isInitialSubmitted ? null : (initialAttempt || null)
  );
  const [loading, setLoading] = useState(!initialAttempt || (!isInitialSubmitted && !Array.isArray(initialAttempt.questions)));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    status: string;
    submittedAt: string;
    examTitle: string;
    result?: any | null;
    resultVisibility?: string;
  } | null>(
    isInitialSubmitted && initialAttempt
      ? {
          status: initialAttempt.status,
          submittedAt: initialAttempt.submittedAt || new Date().toISOString(),
          examTitle: (initialAttempt as any).examTitle || initialAttempt.exam?.title || "Examination",
          result: (initialAttempt as any).result || null,
          resultVisibility: (initialAttempt as any).resultVisibility || initialAttempt.exam?.resultVisibility,
        }
      : null
  );

  // Remaining time in seconds
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  // Security State (Phase 5)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("initializing");
  const hiddenStartTimeRef = useRef<number | null>(null);

  // Helper to log security events server-side
  const logSecurityEvent = useCallback(
    (eventType: SecurityEventType, metadata?: Record<string, any>) => {
      if (!attempt || submittedResult) return;
      sendSecurityEvent(attempt.attemptId, eventType, metadata).catch((err) => {
        console.warn(`[Security] Failed to log ${eventType}:`, err);
      });
    },
    [attempt, submittedResult]
  );

  // Fullscreen trigger helper
  const triggerFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn("Fullscreen request error:", err);
    }
  };

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);
      if (attempt && !submittedResult) {
        if (inFs) {
          logSecurityEvent("FULLSCREEN_ENTER");
        } else {
          logSecurityEvent("FULLSCREEN_EXIT");
          setSecurityNotice("Fullscreen Mode Exited: Please return to fullscreen to maintain a secure testing environment. All events are logged.");
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [attempt, submittedResult, logSecurityEvent]);

  // Page Visibility & Tab Switch listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!attempt || submittedResult) return;

      if (document.hidden) {
        hiddenStartTimeRef.current = Date.now();
        logSecurityEvent("PAGE_HIDDEN");
        logSecurityEvent("TAB_SWITCH");
      } else {
        const duration = hiddenStartTimeRef.current ? Date.now() - hiddenStartTimeRef.current : undefined;
        hiddenStartTimeRef.current = null;
        logSecurityEvent("PAGE_VISIBLE", { durationHiddenMs: duration });
        setSecurityNotice("Security Alert: Leaving or switching away from the exam tab was detected and recorded.");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [attempt, submittedResult, logSecurityEvent]);

  // Window blur & focus listeners
  useEffect(() => {
    const handleBlur = () => {
      if (attempt && !submittedResult) {
        logSecurityEvent("WINDOW_BLUR");
      }
    };
    const handleFocus = () => {
      if (attempt && !submittedResult) {
        logSecurityEvent("WINDOW_FOCUS");
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [attempt, submittedResult, logSecurityEvent]);

  // Network Connectivity (Offline/Online) listeners
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      if (attempt && !submittedResult) {
        logSecurityEvent("CONNECTION_LOST");
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      if (attempt && !submittedResult) {
        logSecurityEvent("CONNECTION_RESTORED");
        toast.success("Network connection restored");
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [attempt, submittedResult, logSecurityEvent, toast]);

  // Load / recover attempt on mount if not provided
  useEffect(() => {
    if (!attempt && !submittedResult) {
      setLoading(true);
      getStudentAttempt()
        .then((res) => {
          if (!res.attempt) {
            nav("/exam");
            return;
          }
          if (res.attempt.status === "SUBMITTED" || res.attempt.status === "AUTO_SUBMITTED") {
            setSubmittedResult({
              status: res.attempt.status,
              submittedAt: res.attempt.submittedAt || new Date().toISOString(),
              examTitle: (res.attempt as any).examTitle || res.attempt.exam?.title || "Examination",
              result: res.attempt.result || null,
              resultVisibility: res.attempt.resultVisibility || res.attempt.exam?.resultVisibility,
            });
            setLoading(false);
            return;
          }
          setAttempt(res.attempt);
          setTimeLeft(res.attempt.remainingSeconds || 0);
          setLoading(false);
        })
        .catch((err) => {
          toast.error("Failed to load active attempt. " + err.message);
          nav("/exam");
        });
    } else if (attempt) {
      setTimeLeft(attempt.remainingSeconds || 0);
    }
  }, [attempt, submittedResult, nav, toast]);

  // Handle countdown timer
  useEffect(() => {
    if (loading || !attempt || submittedResult) return;

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Time expired -> Trigger automatic submission
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, attempt, submittedResult]);

  // Prevent accidental back navigation or tab close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submittedResult && attempt) {
        try {
          const payload = JSON.stringify({
            attemptId: attempt.attemptId,
            eventType: "REFRESH_ATTEMPT",
          });
          if (navigator.sendBeacon) {
            navigator.sendBeacon(buildApiUrl("/student/event"), new Blob([payload], { type: "application/json" }));
          }
        } catch {
          // ignore
        }
        e.preventDefault();
        e.returnValue = "Your exam is in progress. Leaving or reloading may be recorded as a security event.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attempt, submittedResult]);

  const handleAutoSubmit = useCallback(async () => {
    if (!attempt || submitting || submittedResult) return;
    setSubmitting(true);
    try {
      const res = await submitStudentExam(attempt.attemptId, true);
      setSubmittedResult({
        status: res.status,
        submittedAt: res.submittedAt,
        examTitle: res.examTitle || attempt.exam.title,
        result: res.result || null,
        resultVisibility: res.resultVisibility,
      });
      sessionStorage.removeItem("cbt_active_attempt");
      sessionStorage.removeItem("cbt_verification");
    } catch (err: any) {
      toast.error("Error submitting exam: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting, submittedResult, toast]);

  const handleManualSubmit = async () => {
    if (!attempt || submitting) return;
    setSubmitting(true);
    try {
      const res = await submitStudentExam(attempt.attemptId, false);
      setSubmittedResult({
        status: res.status,
        submittedAt: res.submittedAt,
        examTitle: res.examTitle || attempt.exam.title,
        result: res.result || null,
        resultVisibility: res.resultVisibility,
      });
      setConfirmSubmit(false);
      sessionStorage.removeItem("cbt_active_attempt");
      sessionStorage.removeItem("cbt_verification");
      toast.success("Exam submitted successfully!");
    } catch (err: any) {
      toast.error("Error during submission: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Autosave action
  const saveAnswer = async (
    qId: string,
    optId: string | null | undefined,
    marked?: boolean,
    visited = true
  ) => {
    if (!attempt) return;
    setSaveStatus("saving");

    try {
      await saveStudentAnswer({
        attemptId: attempt.attemptId,
        questionId: qId,
        selectedOptionId: optId,
        markedForReview: marked,
        visited,
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error("Autosave failed", err);
      setSaveStatus("error");
    }
  };

  // Option selection handler
  const handleSelectOption = (optId: string) => {
    if (!attempt || !attempt.questions) return;
    const currentQ = attempt.questions[currentIndex];
    if (!currentQ) return;

    const prevAns = (attempt.answers && attempt.answers[currentQ.id]) || {
      selectedOptionId: null,
      markedForReview: false,
      visited: true,
    };

    const newAns = {
      ...prevAns,
      selectedOptionId: optId,
      visited: true,
    };

    setAttempt({
      ...attempt,
      answers: {
        ...(attempt.answers || {}),
        [currentQ.id]: newAns,
      },
    });

    saveAnswer(currentQ.id, optId, newAns.markedForReview, true);
  };

  // Clear answer handler
  const handleClearAnswer = () => {
    if (!attempt || !attempt.questions) return;
    const currentQ = attempt.questions[currentIndex];
    if (!currentQ) return;

    const prevAns = (attempt.answers && attempt.answers[currentQ.id]) || {
      selectedOptionId: null,
      markedForReview: false,
      visited: true,
    };

    const newAns = {
      ...prevAns,
      selectedOptionId: null,
      visited: true,
    };

    setAttempt({
      ...attempt,
      answers: {
        ...(attempt.answers || {}),
        [currentQ.id]: newAns,
      },
    });

    saveAnswer(currentQ.id, null, newAns.markedForReview, true);
  };

  // Mark for review toggle handler
  const handleToggleReview = () => {
    if (!attempt || !attempt.questions) return;
    const currentQ = attempt.questions[currentIndex];
    if (!currentQ) return;

    const prevAns = (attempt.answers && attempt.answers[currentQ.id]) || {
      selectedOptionId: null,
      markedForReview: false,
      visited: true,
    };

    const newAns = {
      ...prevAns,
      markedForReview: !prevAns.markedForReview,
      visited: true,
    };

    setAttempt({
      ...attempt,
      answers: {
        ...(attempt.answers || {}),
        [currentQ.id]: newAns,
      },
    });

    saveAnswer(currentQ.id, newAns.selectedOptionId, newAns.markedForReview, true);
  };

  // Navigate question
  const goToQuestion = (idx: number) => {
    if (!attempt || !attempt.questions || idx < 0 || idx >= attempt.questions.length) return;

    const targetQ = attempt.questions[idx];
    if (targetQ && !attempt.answers?.[targetQ.id]?.visited) {
      // Mark as visited
      const prev = (attempt.answers && attempt.answers[targetQ.id]) || {
        selectedOptionId: null,
        markedForReview: false,
        visited: false,
      };
      setAttempt({
        ...attempt,
        answers: {
          ...(attempt.answers || {}),
          [targetQ.id]: { ...prev, visited: true },
        },
      });
      saveAnswer(targetQ.id, prev.selectedOptionId, prev.markedForReview, true);
    }

    setCurrentIndex(idx);
  };

  // Format seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  // ==========================================
  // Render Submission Locked State with Result
  // ==========================================
  if (submittedResult) {
    const evalData = submittedResult.result;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4 text-slate-100">
        <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/85 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Exam Submitted Successfully
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {attempt?.student?.name ? `${attempt.student.name} (${attempt.student.enrollmentNumber})` : "Your exam attempt is locked."}
          </p>

          {/* If Result is Visible: Render Full Scorecard */}
          {evalData ? (
            <div className="my-6 space-y-4 text-left">
              {/* Score & Pass/Fail Header Banner */}
              <div className={`flex items-center justify-between rounded-xl border p-4 ${
                evalData.isPassed
                  ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                  : "border-red-500/40 bg-red-950/20 text-red-300"
              }`}>
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Final Score</span>
                  <p className="font-mono text-2xl font-black text-white">
                    {evalData.score} <span className="text-sm font-normal text-slate-400">/ {evalData.totalMarks}</span>
                  </p>
                  <p className="text-xs font-semibold">{evalData.percentage}% Percentage</p>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase tracking-wider text-slate-400">Result</span>
                  <div className={`mt-1 inline-flex rounded-lg px-3 py-1 font-mono text-sm font-extrabold tracking-wider ${
                    evalData.isPassed ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20" : "bg-red-500 text-white shadow-md shadow-red-500/20"
                  }`}>
                    {evalData.status || (evalData.isPassed ? "PASS" : "FAIL")}
                  </div>
                </div>
              </div>

              {/* Question Breakdown Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-400">Total Questions</span>
                  <p className="mt-1 font-mono text-lg font-bold text-white">{evalData.totalQuestions}</p>
                </div>
                <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-3">
                  <span className="text-blue-400">Attempted</span>
                  <p className="mt-1 font-mono text-lg font-bold text-blue-300">{evalData.attempted}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-400">Unanswered</span>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-300">{evalData.unanswered}</p>
                </div>
                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3">
                  <span className="text-emerald-400">Correct</span>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-400">{evalData.correct}</p>
                </div>
                <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3">
                  <span className="text-red-400">Wrong</span>
                  <p className="mt-1 font-mono text-lg font-bold text-red-400">{evalData.wrong}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <span className="text-slate-400">Passing Requirement</span>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-300">{evalData.passPercentage ?? 40}%</p>
                </div>
              </div>
            </div>
          ) : (
            /* Result Hidden Notice */
            <div className="my-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300">
              <p className="font-semibold text-white">Submission Recorded</p>
              <p className="mt-1 text-slate-400">
                {submittedResult.resultVisibility === "AFTER_EXAM_END"
                  ? "Detailed scores and results will be published once the examination window officially closes."
                  : "Your answers have been securely recorded. Results are hidden by the administrator."}
              </p>
            </div>
          )}

          <div className="space-y-1.5 border-t border-slate-800/80 pt-4 text-xs text-slate-400">
            <p>Exam: <strong className="text-white">{submittedResult.examTitle}</strong></p>
            <p>
              Submitted At:{" "}
              <span className="text-slate-300">
                {new Date(submittedResult.submittedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                } catch {}
                sessionStorage.clear();
                localStorage.clear();
                window.location.href = "/";
              }}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white sm:w-auto"
            >
              Exit & Start New Exam
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                } catch {}
                sessionStorage.clear();
                localStorage.clear();
                window.location.href = "/login";
              }}
              className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md transition-colors hover:bg-blue-500 sm:w-auto"
            >
              Admin Sign In →
            </button>
          </div>
        </div>
      </div>
    );
  }


  // Loading state
  if (loading || !attempt || !Array.isArray(attempt.questions) || attempt.questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading examination…</span>
        </div>
      </div>
    );
  }

  const questions = attempt.questions || [];
  const answers = attempt.answers || {};
  const currentQ: CbtQuestion | undefined = questions[currentIndex] || questions[0];
  const currentAnswer = currentQ ? answers[currentQ.id] : undefined;

  // Question Statistics calculation for palette & confirmation modal
  let countAnswered = 0;
  let countMarked = 0;
  let countNotAnswered = 0;
  let countNotVisited = 0;

  for (const q of questions) {
    const ans = answers[q.id];
    if (!ans || !ans.visited) {
      countNotVisited++;
    } else if (ans.selectedOptionId !== null && ans.selectedOptionId !== undefined) {
      countAnswered++;
      if (ans.markedForReview) countMarked++;
    } else if (ans.markedForReview) {
      countMarked++;
    } else {
      countNotAnswered++;
    }
  }

  const isLowTime = timeLeft < 300; // < 5 mins
  const isCriticalTime = timeLeft < 60; // < 1 min

  const optionLetters = ["A", "B", "C", "D", "E", "F", "G", "H"];

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100 select-none">
      {/* Top Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3 sm:px-6">
        {/* Left: Exam Info */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 font-bold text-white shadow-md">
            CBT
          </div>
          <div>
            <h1 className="text-sm font-bold text-white sm:text-base">{attempt.exam?.title || "Examination"}</h1>
            <p className="text-[11px] text-slate-400">
              Candidate: <span className="text-slate-200">{attempt.student?.name || "Candidate"}</span> (
              <span className="font-mono text-blue-400">{attempt.student?.enrollmentNumber || ""}</span>)
            </p>
          </div>
        </div>

        {/* Right: Timer, Autosave & Submit Button */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Autosave badge */}
          <div className="hidden items-center gap-1.5 text-xs sm:flex">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-slate-400">
                <svg className="h-3 w-3 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-emerald-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-amber-400">⚠️ Save error</span>
            )}
          </div>

          {/* Countdown Timer */}
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-base font-bold shadow-inner sm:text-lg ${
              isCriticalTime
                ? "animate-pulse border border-red-500 bg-red-950/80 text-red-400"
                : isLowTime
                ? "border border-amber-500/50 bg-amber-950/40 text-amber-400"
                : "border border-slate-700 bg-slate-900 text-white"
            }`}
          >
            <svg
              className={`h-4 w-4 ${isCriticalTime ? "text-red-400" : isLowTime ? "text-amber-400" : "text-blue-400"}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatTime(timeLeft)}</span>
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={isFullscreen ? () => document.exitFullscreen().catch(() => {}) : triggerFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen Mode"}
            className="hidden items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 sm:flex"
          >
            {isFullscreen ? (
              <>
                <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0l5 0m-5 0l0 5M15 9l5-5m0 0l-5 0m5 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5M15 15l5 5m0 0l-5 0m5 0l0-5" />
                </svg>
                <span>Fullscreen</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span className="text-amber-300">Enter Fullscreen</span>
              </>
            )}
          </button>

          {/* Submit Button */}
          <button
            onClick={() => setConfirmSubmit(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 hover:shadow-emerald-600/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Submit Exam
          </button>
        </div>
      </header>

      {/* Security Banners & Alerts */}
      {!isFullscreen && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-500/30 bg-amber-950/60 px-4 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              <strong>Fullscreen Mode Exited:</strong> Please re-enter fullscreen mode to maintain an uninterrupted, secure testing environment.
            </span>
          </div>
          <button
            onClick={triggerFullscreen}
            className="rounded-lg bg-amber-500 px-3 py-1 font-bold text-slate-950 transition-colors hover:bg-amber-400"
          >
            Enter Fullscreen
          </button>
        </div>
      )}

      {isOffline && (
        <div className="flex shrink-0 items-center justify-between border-b border-rose-500/40 bg-rose-950/70 px-4 py-2 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            <span>
              <strong>Connection Lost:</strong> You appear to be offline. Your answers are stored locally and will sync once connectivity returns.
            </span>
          </div>
        </div>
      )}

      {securityNotice && (
        <div className="flex shrink-0 items-center justify-between border-b border-blue-500/30 bg-blue-950/70 px-4 py-2 text-xs text-blue-200">
          <div className="flex items-center gap-2">
            <span>🛡️</span>
            <span>{securityNotice}</span>
          </div>
          <button
            onClick={() => setSecurityNotice(null)}
            className="text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {attempt?.exam?.cameraRequired && cameraStatus === "denied" && (
        <div className="flex shrink-0 items-center justify-between border-b border-rose-500/40 bg-rose-950/70 px-4 py-2 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <span>
              <strong>Camera Permission Required:</strong> Please allow camera access in your browser settings to comply with exam monitoring requirements.
            </span>
          </div>
        </div>
      )}

      {attempt?.exam?.cameraRequired && cameraStatus === "disconnected" && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-500/40 bg-amber-950/70 px-4 py-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              <strong>Camera Disconnected:</strong> Webcam video stream was disconnected. Please check your camera connection.
            </span>
          </div>
        </div>
      )}

      {/* Center Body: Question Panel + Question Palette Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Question Area (~75%) */}
        <div className="flex flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentQ ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-between">
              {/* Question Header & Content */}
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="font-semibold text-white">
                    Question {currentIndex + 1} of {attempt.questions.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                      +{currentQ.marks} Marks
                    </span>
                    {Number(currentQ.negativeMarks) > 0 && (
                      <span className="rounded bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400 ring-1 ring-red-500/30">
                        -{currentQ.negativeMarks} Marks
                      </span>
                    )}
                  </div>
                </div>

                {/* Question Text */}
                <div className="mt-5 text-sm leading-relaxed text-slate-100 sm:text-base">
                  <p className="whitespace-pre-wrap font-medium">{currentQ.questionText}</p>
                </div>

                {/* MCQ Options List */}
                <div className="mt-6 space-y-3">
                  {currentQ.options.map((opt, oIdx) => {
                    const isSelected = currentAnswer?.selectedOptionId === opt.id;
                    const letter = optionLetters[oIdx] || String(oIdx + 1);

                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleSelectOption(opt.id)}
                        className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                          isSelected
                            ? "border-blue-500 bg-blue-950/40 text-white ring-1 ring-blue-500/40 shadow-lg shadow-blue-500/10"
                            : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200"
                          }`}
                        >
                          {letter}
                        </div>
                        <span className="pt-0.5 text-sm leading-relaxed">{opt.optionText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Question Action Toolbar */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearAnswer}
                    disabled={!currentAnswer?.selectedOptionId}
                    className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear Answer
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                      currentAnswer?.markedForReview
                        ? "border-purple-500 bg-purple-950/60 text-purple-300"
                        : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
                    }`}
                  >
                    {currentAnswer?.markedForReview ? "★ Marked for Review" : "☆ Mark for Review"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => goToQuestion(currentIndex - 1)}
                    className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={currentIndex === attempt.questions.length - 1}
                    onClick={() => goToQuestion(currentIndex + 1)}
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save & Next →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              No question selected.
            </div>
          )}
        </div>

        {/* Right: Question Palette & Status Sidebar (~25%) */}
        <aside className="hidden w-80 shrink-0 flex-col justify-between border-l border-slate-800 bg-slate-950/80 p-4 lg:flex overflow-y-auto">
          <div className="space-y-4">
            {/* Optional Live Camera Preview */}
            {attempt.exam?.cameraRequired && (
              <CameraPreview
                onSecurityEvent={logSecurityEvent}
                onStatusChange={setCameraStatus}
                isExamActive={!submittedResult}
              />
            )}

            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Question Palette
            </h3>

            {/* Quick Summary Counts */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Answered
                </span>
                <span className="font-bold text-white">{countAnswered}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <span className="flex items-center gap-1.5 text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Not Answered
                </span>
                <span className="font-bold text-white">{countNotAnswered}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <span className="flex items-center gap-1.5 text-purple-400">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Review
                </span>
                <span className="font-bold text-white">{countMarked}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-slate-600" />
                  Not Visited
                </span>
                <span className="font-bold text-white">{countNotVisited}</span>
              </div>
            </div>

            {/* Interactive Question Grid */}
            <div className="max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const ans = answers[q.id];
                  const isCurrent = idx === currentIndex;
                  const hasAnswer = ans && ans.selectedOptionId !== null && ans.selectedOptionId !== undefined;
                  const isReview = ans && ans.markedForReview;
                  const isVisited = ans && ans.visited;

                  let colorStyle = "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700";

                  if (hasAnswer && isReview) {
                    colorStyle = "bg-purple-700 text-white ring-2 ring-emerald-400";
                  } else if (hasAnswer) {
                    colorStyle = "bg-emerald-600 text-white";
                  } else if (isReview) {
                    colorStyle = "bg-purple-600 text-white";
                  } else if (isVisited) {
                    colorStyle = "bg-red-600 text-white";
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(idx)}
                      className={`relative flex h-10 w-full items-center justify-center rounded-lg border font-mono text-xs font-bold transition-all ${colorStyle} ${
                        isCurrent ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-950 scale-105" : ""
                      }`}
                    >
                      {idx + 1}
                      {hasAnswer && isReview && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-400 text-[8px] text-slate-950">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80">
            <button
              onClick={() => setConfirmSubmit(true)}
              className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
            >
              Submit Examination
            </button>
          </div>
        </aside>
      </div>

      {/* Confirmation Modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Confirm Exam Submission</h3>
            <p className="mt-1 text-xs text-slate-400">
              Please review your summary before submitting. Once submitted, your answers cannot be changed.
            </p>

            <div className="my-5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                <span className="text-slate-400">Total Questions</span>
                <p className="mt-1 text-lg font-bold text-white">{questions.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
                <span className="text-emerald-400">Answered</span>
                <p className="mt-1 text-lg font-bold text-emerald-400">{countAnswered}</p>
              </div>
              <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
                <span className="text-red-400">Unanswered</span>
                <p className="mt-1 text-lg font-bold text-red-400">{countNotAnswered + countNotVisited}</p>
              </div>
              <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-3">
                <span className="text-purple-400">Marked for Review</span>
                <p className="mt-1 text-lg font-bold text-purple-400">{countMarked}</p>
              </div>
            </div>

            {(countNotAnswered + countNotVisited > 0 || countMarked > 0) && (
              <div className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-200 ring-1 ring-amber-500/20">
                ⚠️ You have <strong>{countNotAnswered + countNotVisited}</strong> unanswered question(s)
                {countMarked > 0 ? ` and ${countMarked} marked for review.` : "."}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSubmit(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Return to Exam
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleManualSubmit}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Yes, Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
