import { useState, useEffect } from "react";
import ExamEntry from "./ExamEntry";
import ExamInstructions from "./ExamInstructions";
import CbtInterface from "./CbtInterface";
import { getStudentAttempt } from "../../services/studentApi";
import type { CbtAttemptState, StudentVerificationResult } from "../../types";

export default function StudentExamFlow() {
  const [step, setStep] = useState<"loading" | "entry" | "instructions" | "cbt">("loading");
  const [verificationData, setVerificationData] = useState<StudentVerificationResult | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<CbtAttemptState | null>(null);

  useEffect(() => {
    // Check if user already has an active or submitted attempt
    getStudentAttempt()
      .then((res) => {
        if (res.attempt) {
          setActiveAttempt(res.attempt);
          setStep("cbt");
        } else {
          // Check if verification was stored in session
          const stored = sessionStorage.getItem("cbt_verification");
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setVerificationData(parsed);
              setStep("instructions");
              return;
            } catch {
              // fallback
            }
          }
          setStep("entry");
        }
      })
      .catch(() => {
        setStep("entry");
      });
  }, []);

  if (step === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Initializing CBT Portal…</span>
        </div>
      </div>
    );
  }

  if (step === "cbt") {
    return <CbtInterface initialAttempt={activeAttempt} />;
  }

  if (step === "instructions") {
    return (
      <ExamInstructions
        verificationData={verificationData}
        onStartExam={(attempt) => {
          setActiveAttempt(attempt);
          setStep("cbt");
        }}
      />
    );
  }

  return (
    <ExamEntry
      onVerified={(data) => {
        setVerificationData(data);
        sessionStorage.setItem("cbt_verification", JSON.stringify(data));
        setStep("instructions");
      }}
    />
  );
}
