/* End-to-end check of the admin flow using the client's real service layer against a running API.
   Run: API_BASE=http://localhost:5173 npx tsx scripts/flow-test.ts   (Vite proxy) or the API URL directly. */
import { ApiError, api } from "../src/services/api";
import * as A from "../src/services/adminApi";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:4000";
const ORIGIN = process.env.CLIENT_URL ?? "http://localhost:5173";
const realFetch = globalThis.fetch;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`); };

function session(sendOrigin = true) {
  let cookie = "";
  const f = async (url: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (cookie) headers.cookie = cookie;
    if (sendOrigin) headers.origin = ORIGIN;
    const res = await realFetch(BASE + url, { ...init, headers });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) { const kv = c.split(";")[0]; cookie = kv.endsWith("=") ? "" : kv; }
    return res;
  };
  return f as unknown as typeof fetch;
}
const as = (s: typeof fetch) => { (globalThis as any).fetch = s; };
const expectErr = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as ApiError; } };

async function main() {
  const admin = session(), student = session(), noOrigin = session(false);
  const day = 86400_000;
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

  // ---- auth ----
  as(admin);
  let e = await expectErr(api("/auth/login", { method: "POST", body: { loginId: "admin", password: "wrong" } }));
  check("login with wrong password -> 401", e?.status === 401, e?.status);
  const me0 = await expectErr(api("/auth/me"));
  check("/auth/me without cookie -> 401", me0?.status === 401);
  const login = await api<{ user: { role: string } }>("/auth/login", { method: "POST", body: { loginId: "admin", password: "ChangeMe-Admin-123" } });
  check("admin login", login.user.role === "ADMIN");
  as(noOrigin);
  e = await expectErr(api("/auth/login", { method: "POST", body: { loginId: "admin", password: "x" } }));
  check("POST without allowed Origin -> 403 (CSRF guard)", e?.status === 403, e?.status);
  as(admin);

  // ---- create exam ----
  e = await expectErr(A.createExam({ title: "", description: null, instructions: null, durationMinutes: 30, startTime: iso(day), endTime: iso(0), totalQuestionsToAsk: null, shuffleQuestions: false, shuffleOptions: false, defaultMarks: 1, defaultNegative: 0.25, passPercentage: 40, resultVisibility: "HIDDEN" }));
  check("invalid exam -> 400 with field errors (title, endTime)", e?.status === 400 && !!(e.details as any)?.title && !!(e.details as any)?.endTime, e?.details);
  const exam = await A.createExam({ title: "CSE204 Midterm", description: "d", instructions: "Read carefully", durationMinutes: 45, startTime: iso(-60_000), endTime: iso(day), totalQuestionsToAsk: null, shuffleQuestions: true, shuffleOptions: true, defaultMarks: 1, defaultNegative: 0.25, passPercentage: 40, resultVisibility: "AFTER_SUBMIT", cameraRequired: true });
  check("create exam with cameraRequired: true (DRAFT)", exam.status === "DRAFT" && exam.cameraRequired === true && exam.defaultNegative === "0.25", exam);
  
  // Test updating cameraRequired setting
  const updatedExam = await A.updateExam(exam.id, { ...exam, defaultMarks: Number(exam.defaultMarks), defaultNegative: Number(exam.defaultNegative), cameraRequired: true });
  check("admin updates exam preserving cameraRequired: true", updatedExam.cameraRequired === true);

  const page = await A.listExams(1, 10);
  check("exam list includes it with counts and cameraRequired", page.items.some((x) => x.id === exam.id && x.cameraRequired === true && x._count?.questions === 0), page.total);

  // ---- publish validation ----
  e = await expectErr(A.publishExam(exam.id));
  check("publish empty exam -> 400 with problem list", e?.status === 400 && Array.isArray(e.details) && (e.details as string[])[0].includes("at least one question"), e?.details);

  // ---- CSV question import ----
  const bad = 'question,optionA,optionB,optionC,optionD,correctAnswer,marks,negativeMarks\n"Q ok","a","b","","",A,1,0\n"","x","y","","",A,1,0\n"Bad letter","x","y","","",D,1,0\n"Gap","x","y","","w",A,1,0\n"Neg","x","y","","",A,1,-2\n';
  e = await expectErr(A.importQuestions(exam.id, bad));
  const rows = (e?.details as { row: number; message: string }[]) ?? [];
  check("invalid CSV -> 400, nothing imported, row-by-row errors", e?.status === 400 && rows.map((r) => r.row).join() === "3,4,5,6", rows);
  check("  ...and no questions were saved", (await A.listQuestions(exam.id)).length === 0);
  const good = 'question,optionA,optionB,optionC,optionD,optionE,correctAnswer,marks,negativeMarks\n"What is HTML?","Language","Markup Language","Database","OS",,B,1,0.25\n"Pick, with comma","one","two","three","four","five",E,2,\n"Simple","yes","no",,,,A,,\n';
  const imp = await A.importQuestions(exam.id, good);
  check("valid CSV imports 3 questions (quoted commas, option E, blanks)", imp.imported === 3, imp);
  let qs = await A.listQuestions(exam.id);
  check("options stored in order, correct flagged", qs[1].options.length === 5 && qs[1].options[4].isCorrect && qs[0].options[1].isCorrect && qs[1].questionText === "Pick, with comma", qs[1]);
  check("blank marks stay null (exam default)", qs[2].marks === null && qs[0].negativeMarks === "0.25");

  // ---- manual question CRUD ----
  e = await expectErr(A.createQuestion(exam.id, { questionText: "x", marks: null, negativeMarks: null, explanation: null, options: [{ optionText: "a", isCorrect: true }, { optionText: "b", isCorrect: true }] }));
  check("two correct options -> 400", e?.status === 400, e?.details);
  const q = await A.createQuestion(exam.id, { questionText: "Manual Q", marks: 2, negativeMarks: 0.5, explanation: "because", options: ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"].map((t, i) => ({ optionText: t, isCorrect: i === 7 })) });
  check("create question with 8 options (A-H)", q.options.length === 8 && q.options[7].isCorrect);
  const upd = await A.updateQuestion(q.id, { questionText: "Manual Q edited", marks: 3, negativeMarks: null, explanation: null, options: [{ optionText: "yes", isCorrect: false }, { optionText: "no", isCorrect: true }] });
  check("update question replaces options", upd.questionText === "Manual Q edited" && upd.options.length === 2 && upd.marks === "3");
  await A.deleteQuestion(q.id);
  check("delete question", (await A.listQuestions(exam.id)).length === 3);

  // ---- students ----
  const stamp = Date.now().toString().slice(-6);
  const s1 = await A.createStudent({ name: "Test One", loginId: `t1_${stamp}`, email: null });
  check("create student without password returns generatedPassword once", !!s1.generatedPassword && s1.generatedPassword.length >= 10);
  e = await expectErr(A.createStudent({ name: "Dup", loginId: `t1_${stamp}` }));
  check("duplicate loginId -> 409", e?.status === 409, e?.status);
  e = await expectErr(A.importStudents(`name,loginId,email,password\nA,ok_${stamp},,\nB,${`t1_${stamp}`},,\nC,ok_${stamp},,\nD,bad id!,,\n`));
  const srows = (e?.details as { row: number; message: string }[]) ?? [];
  check("invalid student CSV -> 400 with row errors, nothing imported", e?.status === 400 && srows.length >= 3, srows);
  const simp = await A.importStudents(`name,loginId,email,password\nGen One,g1_${stamp},g1_${stamp}@x.com,\nGen Two,g2_${stamp},,\nOwn Pw,g3_${stamp},,MyOwnPass99\n`);
  check("student import: 3 created, 2 generated credentials returned once", simp.imported === 3 && simp.generatedCredentials.length === 2 && simp.generatedCredentials.every((c) => c.password.length >= 10), simp);
  const found = await A.listStudents({ page: 1, pageSize: 10, search: `g1_${stamp}` });
  check("student search", found.total === 1 && found.items[0].name === "Gen One", found);
  check("student list is paginated", (await A.listStudents({ page: 1, pageSize: 2 })).items.length === 2);

  // ---- assignment ----
  const all = (await A.listStudents({ page: 1, pageSize: 100, search: stamp })).items;
  const ids = all.map((s) => s.id);
  const a1 = await A.assignStudents(exam.id, ids);
  check("bulk assign", a1.assigned === ids.length && a1.skipped === 0, a1);
  const a2 = await A.assignStudents(exam.id, ids);
  check("re-assign skips duplicates", a2.assigned === 0 && a2.skipped === ids.length, a2);
  check("assignments listed", (await A.listAssignments(exam.id)).length === ids.length);
  await A.unassignStudent(exam.id, ids[0]);
  check("remove assignment", (await A.listAssignments(exam.id)).length === ids.length - 1);

  // ---- publish / unpublish ----
  const pub = await A.publishExam(exam.id);
  check("publish succeeds once valid", pub.status === "PUBLISHED", pub.status);
  const unp = await A.unpublishExam(exam.id);
  check("unpublish", unp.status === "DRAFT");
  const past = await A.createExam({ title: "Past", description: null, instructions: null, durationMinutes: 10, startTime: iso(-2 * day), endTime: iso(-day), totalQuestionsToAsk: null, shuffleQuestions: false, shuffleOptions: false, defaultMarks: 1, defaultNegative: 0, passPercentage: 40, resultVisibility: "HIDDEN" });
  await A.createQuestion(past.id, { questionText: "q", marks: null, negativeMarks: null, explanation: null, options: [{ optionText: "a", isCorrect: true }, { optionText: "b", isCorrect: false }] });
  e = await expectErr(A.publishExam(past.id));
  check("publish with end time in the past -> 400 message", e?.status === 400 && (e.details as string[]).some((m) => m.includes("past")), e?.details);
  await A.deleteExam(past.id);
  check("delete exam without attempts", (await expectErr(A.getExam(past.id)))?.status === 404);

  // ---- student sessions: reset / deactivate / role checks ----
  as(student);
  await api("/auth/login", { method: "POST", body: { loginId: `g3_${stamp}`, password: "MyOwnPass99" } });
  e = await expectErr(A.listExams(1, 10));
  check("student calling /api/admin/* -> 403", e?.status === 403, e?.status);
  as(admin);
  const g3 = all.find((s) => s.loginId === `g3_${stamp}`)!;
  await A.patchStudent(g3.id, { password: "BrandNewPass1" });
  as(student);
  e = await expectErr(api("/auth/me"));
  check("password reset revokes the student's live session -> 401", e?.status === 401, e?.status);
  await api("/auth/login", { method: "POST", body: { loginId: `g3_${stamp}`, password: "BrandNewPass1" } });
  check("login with reset password works", true);
  as(admin);
  await A.patchStudent(g3.id, { isActive: false });
  as(student);
  e = await expectErr(api("/auth/login", { method: "POST", body: { loginId: `g3_${stamp}`, password: "BrandNewPass1" } }));
  check("deactivated student cannot log in", e?.status === 401, e?.status);
  as(admin);
  await A.patchStudent(g3.id, { isActive: true });

  // ---- Phase 3: Student Examination Flow ----
  console.log("\n--- Phase 3: Student Examination Flow Tests ---");
  const studentCbt = session();
  as(admin);

  // 1. Admin assigns student with Name, Enrollment, Department, Section
  const testEnrollment = `A120105_${stamp}`;
  const assignRes = await A.assignSingleStudent(exam.id, {
    name: "Shivakalyan Thota",
    enrollmentNumber: testEnrollment,
    department: "CSE",
    section: "A",
  });
  check("admin assigns student -> returns generated 4-digit key", !!assignRes.assignment.examKey && assignRes.assignment.examKey.length === 4 && /^\d{4}$/.test(assignRes.assignment.examKey), assignRes.assignment);
  const studentKey = assignRes.assignment.examKey!;

  // Verify assignment is in exam assignments list with key
  const examAssignments = await A.listAssignments(exam.id);
  const foundAssignment = examAssignments.find((a) => a.loginId === testEnrollment);
  check("assignment listed in admin view with key and department/section", foundAssignment?.examKey === studentKey && foundAssignment?.department === "CSE" && foundAssignment?.section === "A", foundAssignment);

  // Publish the exam for testing the student taking flow
  await A.publishExam(exam.id);

  // 2. Student Verification & Entry
  as(studentCbt);
  let vErr = await expectErr(api("/student/verify", { method: "POST", body: { enrollmentNumber: "NON_EXISTENT_ROLL", examKey: studentKey } }));
  check("verify with wrong enrollment -> 404", vErr?.status === 404, vErr?.status);

  vErr = await expectErr(api("/student/verify", { method: "POST", body: { enrollmentNumber: testEnrollment, examKey: "0000" } }));
  check("verify with wrong 4-digit key -> 401", vErr?.status === 401, vErr?.status);

  const verifySuccess = await api<{ student: { name: string; enrollmentNumber: string; department: string }; exam: { id: string; title: string; durationMinutes: number; cameraRequired: boolean } }>("/student/verify", {
    method: "POST",
    body: { enrollmentNumber: testEnrollment, examKey: studentKey },
  });
  check("verify with correct enrollment + 4-digit key -> 200 with student, exam details, and cameraRequired: true", verifySuccess.student.enrollmentNumber === testEnrollment && verifySuccess.exam.id === exam.id && verifySuccess.exam.cameraRequired === true, verifySuccess);

  // 3. Start Exam & CBT Attempt Initialization
  const startRes = await api<{
    attemptId: string;
    status: string;
    remainingSeconds: number;
    totalQuestions: number;
    questions: Array<{ id: string; questionText: string; options: Array<{ id: string; optionText: string; isCorrect?: boolean }> }>;
    answers: Record<string, any>;
  }>("/student/start", {
    method: "POST",
    body: { examId: exam.id },
  });
  check("start exam creates attempt with server timer and question list", startRes.status === "IN_PROGRESS" && startRes.remainingSeconds > 0 && startRes.questions.length > 0, startRes.attemptId);

  // Crucial security check: isCorrect and explanation are NEVER leaked to student!
  const hasLeakedAnswer = startRes.questions.some((q) => q.options.some((o) => (o as any).isCorrect !== undefined) || (q as any).explanation !== undefined);
  check("security: correct answers & explanations NOT leaked in question payload", !hasLeakedAnswer);

  const firstQ = startRes.questions[0];
  const secondQ = startRes.questions[1];
  const firstOpt = firstQ.options[0].id;

  // 4. Autosave Answer & Mark for Review
  const save1 = await api<{ ok: boolean; answer: { selectedOptionId: string; markedForReview: boolean } }>("/student/answer", {
    method: "POST",
    body: { attemptId: startRes.attemptId, questionId: firstQ.id, selectedOptionId: firstOpt, markedForReview: true },
  });
  check("autosave answer with selected option and marked for review", save1.ok && save1.answer.selectedOptionId === firstOpt && save1.answer.markedForReview === true);

  // Clear answer
  const save2 = await api<{ ok: boolean; answer: { selectedOptionId: string | null } }>("/student/answer", {
    method: "POST",
    body: { attemptId: startRes.attemptId, questionId: firstQ.id, selectedOptionId: null },
  });
  check("clear answer updates saved state to null", save2.ok && save2.answer.selectedOptionId === null);

  // Re-select option
  await api("/student/answer", {
    method: "POST",
    body: { attemptId: startRes.attemptId, questionId: firstQ.id, selectedOptionId: firstOpt, markedForReview: false },
  });

  if (secondQ) {
    await api("/student/answer", {
      method: "POST",
      body: { attemptId: startRes.attemptId, questionId: secondQ.id, selectedOptionId: secondQ.options[0].id, markedForReview: true },
    });
  }

  // 5. Reconnect / Refresh Recovery
  const recoverAttempt = await api<{
    attempt: {
      attemptId: string;
      status: string;
      remainingSeconds: number;
      exam: { id: string; title: string; cameraRequired: boolean };
      answers: Record<string, { selectedOptionId: string | null; markedForReview: boolean }>;
    };
  }>("/student/attempt");
  check("refresh/reconnect recovery restores attempt, cameraRequired flag, remaining timer, and saved answers", recoverAttempt.attempt.status === "IN_PROGRESS" && recoverAttempt.attempt.exam.cameraRequired === true && recoverAttempt.attempt.answers[firstQ.id]?.selectedOptionId === firstOpt, recoverAttempt.attempt);

  // 6. Submit Exam & Automatic Evaluation
  const submitRes = await api<{
    ok: boolean;
    status: string;
    submittedAt: string;
    result?: {
      totalQuestions: number;
      attempted: number;
      correct: number;
      wrong: number;
      unanswered: number;
      score: number;
      totalMarks: number;
      percentage: number;
      isPassed: boolean;
      status: "PASS" | "FAIL";
    } | null;
  }>("/student/submit", {
    method: "POST",
    body: { attemptId: startRes.attemptId },
  });
  check("manual submit locks attempt as SUBMITTED", submitRes.ok && submitRes.status === "SUBMITTED");
  check("submit returns evaluated result scorecard on server", !!submitRes.result && submitRes.result.totalQuestions === 3 && submitRes.result.unanswered === 1, submitRes.result);

  // 7. Security: Verify attempt locked against modifications & re-entry
  const modifyAfterSubmit = await expectErr(api("/student/answer", {
    method: "POST",
    body: { attemptId: startRes.attemptId, questionId: firstQ.id, selectedOptionId: null },
  }));
  check("modifying answers after submission is rejected -> 403", modifyAfterSubmit?.status === 403, modifyAfterSubmit?.status);

  const reVerify = await expectErr(api("/student/verify", {
    method: "POST",
    body: { enrollmentNumber: testEnrollment, examKey: studentKey },
  }));
  check("re-verifying after submission is locked and rejected -> 403", reVerify?.status === 403, reVerify?.status);

  // 8. Reconnect after submission returns scorecard
  const studentPostSubmitState = await api<{
    attempt: {
      attemptId: string;
      status: string;
      result: {
        totalQuestions: number;
        attempted: number;
        correct: number;
        wrong: number;
        unanswered: number;
        score: number;
        totalMarks: number;
        percentage: number;
        isPassed: boolean;
        status: string;
      } | null;
    };
  }>("/student/attempt");
  check("post-submission state returns evaluated scorecard to student", studentPostSubmitState.attempt.status === "SUBMITTED" && studentPostSubmitState.attempt.result !== null, studentPostSubmitState.attempt.result);

  // ---- Phase 4: Evaluation, Admin Results, Details Breakdown & Export ----
  console.log("\n--- Phase 4: Evaluation & Admin Results Tests ---");
  as(admin);

  // 1. Admin Results endpoint & Real-time Exam Statistics
  const resultsData = await A.getExamResults(exam.id, { page: 1, pageSize: 20 });
  check("admin results list returns items and stats", Array.isArray(resultsData.items) && !!resultsData.stats, resultsData.stats);
  check("stats: totalAssigned >= 1, submitted >= 1", resultsData.stats.totalAssigned >= 1 && resultsData.stats.submitted >= 1, resultsData.stats);
  check("stats: passCount + failCount === submitted", resultsData.stats.passCount + resultsData.stats.failCount === (resultsData.stats.submitted + resultsData.stats.autoSubmitted));

  const studentResultItem = resultsData.items.find((i) => i.enrollmentNumber === testEnrollment);
  check("results item includes student score, percentage, correct/wrong/unanswered, passStatus", !!studentResultItem && studentResultItem.score !== null && studentResultItem.percentage !== null && studentResultItem.passStatus !== "", studentResultItem);

  // 2. Admin Search & Filtering
  const searchMatch = await A.getExamResults(exam.id, { search: "Shivakalyan" });
  check("results search by student name matches record", searchMatch.items.some((i) => i.enrollmentNumber === testEnrollment));

  const searchMismatch = await A.getExamResults(exam.id, { search: "NonExistentStudentXYZ" });
  check("results search with no match returns 0 items", searchMismatch.items.length === 0);

  const filterSubmitted = await A.getExamResults(exam.id, { status: "SUBMITTED" });
  check("results filter by status=SUBMITTED includes student", filterSubmitted.items.some((i) => i.enrollmentNumber === testEnrollment));

  const filterNotStarted = await A.getExamResults(exam.id, { status: "NOT_STARTED" });
  check("results filter by status=NOT_STARTED excludes submitted student", !filterNotStarted.items.some((i) => i.enrollmentNumber === testEnrollment));

  // 3. Admin Student Result Detailed Breakdown
  const studentTargetId = studentResultItem!.studentId;
  const detail = await A.getStudentResultDetail(exam.id, studentTargetId);
  check("admin can fetch student result details breakdown", detail.student.enrollmentNumber === testEnrollment && !!detail.attempt && Array.isArray(detail.questions), detail);
  check("detail breakdown contains question list with status, marks, student answer, correct answer", (detail.questions?.length ?? 0) === 3 && detail.questions!.every((q) => q.status && q.marks !== undefined && q.correctOptionId), detail.questions);

  // 4. Export CSV
  const csvText = await A.exportExamResultsCsv(exam.id);
  check("export results CSV returns formatted CSV text with headers", typeof csvText === "string" && csvText.includes("Enrollment Number") && csvText.includes("Score"));
  check("exported CSV contains student enrollment and score", csvText.includes(testEnrollment) && csvText.includes("Shivakalyan Thota"));

  // 5. Create 2nd student to explicitly test Positive & Negative Marking calculations
  console.log("\n--- Phase 4: Detailed Positive & Negative Marking Verification ---");
  const testEnrollment2 = `A120105_neg_${stamp}`;
  const assign2 = await A.assignSingleStudent(exam.id, {
    name: "Marking Test Student",
    enrollmentNumber: testEnrollment2,
    department: "ECE",
    section: "B",
  });
  const key2 = assign2.assignment.examKey!;
  const student2Session = session();
  as(student2Session);

  await api("/student/verify", { method: "POST", body: { enrollmentNumber: testEnrollment2, examKey: key2 } });
  const start2 = await api<{ attemptId: string; questions: Array<{ id: string; options: Array<{ id: string; optionText: string }> }> }>("/student/start", {
    method: "POST",
    body: { examId: exam.id },
  });

  // Fetch true correct options via admin to ensure deliberate correct / wrong answers
  as(admin);
  const qList = await A.listQuestions(exam.id);
  const q0 = qList[0]; // HTML question: defaultMarks 1 (or 1), negative 0.25, correct is 'Markup Language' (idx 1)
  const q1 = qList[1]; // Comma question: marks 2, negative 0.25 (exam default), correct is 'five' (idx 4)
  const q2 = qList[2]; // Simple question: marks 1, negative 0.25, correct is 'yes' (idx 0)

  const q0CorrectOpt = q0.options.find((o) => o.isCorrect)!.id;
  const q1WrongOpt = q1.options.find((o) => !o.isCorrect)!.id;

  // Answer Q0 CORRECTLY (+1.00), Q1 WRONGLY (-0.25), Q2 UNANSWERED (0.00)
  as(student2Session);
  await api("/student/answer", { method: "POST", body: { attemptId: start2.attemptId, questionId: q0.id, selectedOptionId: q0CorrectOpt } });
  await api("/student/answer", { method: "POST", body: { attemptId: start2.attemptId, questionId: q1.id, selectedOptionId: q1WrongOpt } });

  const submit2 = await api<{
    ok: boolean;
    result: {
      totalQuestions: number;
      attempted: number;
      correct: number;
      wrong: number;
      unanswered: number;
      score: number;
      totalMarks: number;
      percentage: number;
      isPassed: boolean;
      status: string;
    };
  }>("/student/submit", {
    method: "POST",
    body: { attemptId: start2.attemptId },
  });

  // Net score: +1.00 (Q0) - 0.25 (Q1) + 0 (Q2) = 0.75
  // Total marks: 1 (Q0) + 2 (Q1) + 1 (Q2) = 4.00
  // Percentage: (0.75 / 4.00) * 100 = 18.75%
  // Exam passPercentage: 40% -> FAIL
  check("positive & negative marking calculated correctly: 1 correct (+1), 1 wrong (-0.25), 1 unanswered (0) -> score 0.75", submit2.result.correct === 1 && submit2.result.wrong === 1 && submit2.result.unanswered === 1 && submit2.result.score === 0.75, submit2.result);
  check("total possible marks calculated correctly: 4.00", submit2.result.totalMarks === 4, submit2.result);
  check("percentage calculated correctly: 18.75%", submit2.result.percentage === 18.75, submit2.result);
  check("pass/fail status evaluated correctly: FAIL (< 40%)", submit2.result.isPassed === false && submit2.result.status === "FAIL", submit2.result);

  // Security check: Student 2 cannot access Student 1's attempt or submit request
  const crossAccess = await expectErr(api("/student/submit", { method: "POST", body: { attemptId: startRes.attemptId } }));
  check("security: student cannot submit/access another student's attempt -> 404 or 403", crossAccess?.status === 404 || crossAccess?.status === 403, crossAccess?.status);

  // ---- Phase 5: Exam Security & Activity Monitoring Tests ----
  console.log("\n--- Phase 5: Security & Activity Monitoring Tests ---");
  const testEnrollment3 = `A120105_sec_${stamp}`;
  as(admin);
  const assign3 = await A.assignSingleStudent(exam.id, {
    name: "Security Monitored Student",
    enrollmentNumber: testEnrollment3,
    department: "IT",
    section: "C",
  });
  const key3 = assign3.assignment.examKey!;
  const student3Session = session();
  as(student3Session);

  await api("/student/verify", { method: "POST", body: { enrollmentNumber: testEnrollment3, examKey: key3 } });
  const start3 = await api<{ attemptId: string }>("/student/start", {
    method: "POST",
    body: { examId: exam.id },
  });
  check("student 3 starts exam for security tracking", !!start3.attemptId);

  // 1. Send legitimate browser security events during exam
  const evtTab = await api<{ ok: boolean; eventId: string; eventType: string }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "TAB_SWITCH" },
  });
  check("student records TAB_SWITCH event server-side", evtTab.ok && evtTab.eventType === "TAB_SWITCH", evtTab);

  const evtFsExit = await api<{ ok: boolean; eventId: string; eventType: string }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "FULLSCREEN_EXIT" },
  });
  check("student records FULLSCREEN_EXIT event server-side", evtFsExit.ok && evtFsExit.eventType === "FULLSCREEN_EXIT", evtFsExit);

  const evtFsEnter = await api<{ ok: boolean; eventId: string; eventType: string }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "FULLSCREEN_ENTER" },
  });
  check("student records FULLSCREEN_ENTER event", evtFsEnter.ok && evtFsEnter.eventType === "FULLSCREEN_ENTER", evtFsEnter);

  const evtHidden = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "PAGE_HIDDEN" },
  });
  check("student records PAGE_HIDDEN event", evtHidden.ok);

  const evtVisible = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "PAGE_VISIBLE", metadata: { durationHiddenMs: 4200 } },
  });
  check("student records PAGE_VISIBLE event with metadata", evtVisible.ok);

  const evtBlur = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "WINDOW_BLUR" },
  });
  check("student records WINDOW_BLUR event", evtBlur.ok);

  const evtConnLost = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CONNECTION_LOST" },
  });
  check("student records CONNECTION_LOST event", evtConnLost.ok);

  const evtConnRestored = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CONNECTION_RESTORED" },
  });
  check("student records CONNECTION_RESTORED event", evtConnRestored.ok);

  // Camera telemetry events
  const evtCamGranted = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CAMERA_PERMISSION_GRANTED" },
  });
  check("student records CAMERA_PERMISSION_GRANTED event", evtCamGranted.ok);

  const evtCamStarted = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CAMERA_STARTED" },
  });
  check("student records CAMERA_STARTED event", evtCamStarted.ok);

  const evtCamDisc = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CAMERA_DISCONNECTED", metadata: { reason: "device_unplugged" } },
  });
  check("student records CAMERA_DISCONNECTED event", evtCamDisc.ok);

  const evtCamReconn = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CAMERA_RECONNECTED" },
  });
  check("student records CAMERA_RECONNECTED event", evtCamReconn.ok);

  const evtCamStopped = await api<{ ok: boolean }>("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "CAMERA_STOPPED" },
  });
  check("student records CAMERA_STOPPED event", evtCamStopped.ok);

  // 2. Security validation: Cross-student event submission is rejected
  const crossEventErr = await expectErr(api("/student/event", {
    method: "POST",
    body: { attemptId: startRes.attemptId, eventType: "TAB_SWITCH" }, // Attempting to post event on Student 1's attempt
  }));
  check("security: student cannot submit events for another student's attempt -> 404 or 403", crossEventErr?.status === 404 || crossEventErr?.status === 403, crossEventErr?.status);

  // 3. Submit Student 3 Exam
  await api("/student/submit", { method: "POST", body: { attemptId: start3.attemptId } });

  // 4. Security validation: Post-submission event submission is rejected
  const postSubmitEventErr = await expectErr(api("/student/event", {
    method: "POST",
    body: { attemptId: start3.attemptId, eventType: "TAB_SWITCH" },
  }));
  check("security: cannot submit security events after attempt is locked -> 403", postSubmitEventErr?.status === 403, postSubmitEventErr?.status);

  // 5. Admin Activity Monitoring & Timeline Checks
  as(admin);
  const examActivity = await A.getExamActivity(exam.id, { page: 1, pageSize: 20 });
  check("admin can fetch exam activity monitoring list with summary", !!examActivity.summary && Array.isArray(examActivity.items), examActivity.summary);
  check("admin activity summary: totalSuspiciousEvents >= 4, studentsWithFlags >= 1", examActivity.summary.totalSuspiciousEvents >= 4 && examActivity.summary.studentsWithFlags >= 1, examActivity.summary);

  const student3ActivityItem = examActivity.items.find((i) => i.enrollmentNumber === testEnrollment3);
  check("activity item for monitored student has breakdown and flags count", !!student3ActivityItem && student3ActivityItem.suspiciousEventsCount >= 4 && student3ActivityItem.breakdown.tabSwitches >= 2 && student3ActivityItem.breakdown.fullscreenExits >= 1, student3ActivityItem);

  // Filter by suspiciousOnly
  const suspiciousFiltered = await A.getExamActivity(exam.id, { suspiciousOnly: true });
  check("activity filter suspiciousOnly=true includes monitored student", suspiciousFiltered.items.some((i) => i.enrollmentNumber === testEnrollment3));

  // Admin student activity timeline
  const student3Id = student3ActivityItem!.studentId;
  const timeline = await A.getStudentActivityTimeline(exam.id, student3Id);
  check("timeline contains full chronological audit trail with labels and suspicious flags", timeline.events.length >= 10 && timeline.events.some((e) => e.eventType === "TAB_SWITCH" && e.isSuspicious) && timeline.events.some((e) => e.eventType === "EXAM_STARTED" && !e.isSuspicious), timeline.events);
  check("timeline includes camera events with formatted labels and suspicious flag on disconnect", timeline.events.some((e) => e.eventType === "CAMERA_STARTED" && e.label === "Camera Preview Started" && !e.isSuspicious) && timeline.events.some((e) => e.eventType === "CAMERA_DISCONNECTED" && e.label === "Camera Disconnected" && e.isSuspicious), timeline.events);

  // ---- Phase 6: Analytics & Reports Tests ----
  console.log("\n--- Phase 6: Analytics & Reports Tests ---");

  // 1. Overview Analytics & Score Distribution
  const analyticsOverview = await A.getExamAnalyticsOverview(exam.id);
  check("admin fetches exam analytics overview with summary, distribution, and departments", !!analyticsOverview.summary && Array.isArray(analyticsOverview.scoreDistribution) && Array.isArray(analyticsOverview.deptPerformance), analyticsOverview);
  check("analytics summary: totalEnrolled >= 3, completed >= 3, avgScore and highestScore calculated", analyticsOverview.summary.totalEnrolled >= 3 && analyticsOverview.summary.completed >= 3 && analyticsOverview.summary.averageScore > 0, analyticsOverview.summary);
  check("score distribution has 5 buckets", analyticsOverview.scoreDistribution.length === 5 && analyticsOverview.scoreDistribution.some((b) => b.count > 0), analyticsOverview.scoreDistribution);
  check("department performance aggregates candidates by department", analyticsOverview.deptPerformance.length >= 2, analyticsOverview.deptPerformance);

  // 2. Question Item Analysis & Difficulty
  const questionAnalytics = await A.getExamQuestionAnalytics(exam.id);
  check("admin fetches question item analysis for all exam questions", questionAnalytics.questions.length === 3 && questionAnalytics.totalEvaluatedAttempts >= 3, questionAnalytics);
  check("question analytics computes attempted %, correct %, wrong %, difficulty rating", questionAnalytics.questions.every((q) => q.attemptedPercentage >= 0 && q.difficultyLevel && q.averageMarksObtained !== undefined), questionAnalytics.questions);

  // 3. Export Question Analysis CSV
  const qCsvText = await A.exportQuestionAnalyticsCsv(exam.id);
  check("export question analysis CSV contains headers and item rows", typeof qCsvText === "string" && qCsvText.includes("Question #,Question Text,Total Attempts,Attempted Count,Attempted %,Correct Count,Correct %,Wrong Count,Wrong %,Unanswered Count,Unanswered %,Average Marks,Difficulty Level"));
  check("question analysis CSV contains questions data", qCsvText.includes("HTML") || qCsvText.includes("Markup"));

  // 4. Export Student Performance CSV
  const perfCsvText = await A.exportStudentPerformanceCsv(exam.id);
  check("export student performance CSV contains student records and metrics", typeof perfCsvText === "string" && perfCsvText.includes("Student Name,Enrollment Number,Department,Section,Attempt Status,Started At,Submitted At,Time Spent (Mins),Score,Total Marks,Percentage,Pass Status"));
  check("performance CSV includes candidate enrollment", perfCsvText.includes(testEnrollment) && perfCsvText.includes(testEnrollment3));

  // ---- frozen content once attempts exist (created by test harness via env hook) ----
  if (process.env.FREEZE_EXAM_ID_FILE) { require("fs").writeFileSync(process.env.FREEZE_EXAM_ID_FILE, exam.id); }
  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`EXAM_ID=${exam.id}`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error("Unexpected error:", err); process.exit(2); });


