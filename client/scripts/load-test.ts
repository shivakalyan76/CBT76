/**
 * Phase 7 — Performance & Load Testing Harness for CBT76
 * 
 * Simulates concurrent students executing the realistic end-to-end exam flow:
 * 1. Verification (Enrollment + 4-digit exam key)
 * 2. Start Exam (Initialize attempt & fetch randomized questions)
 * 3. Fetch Attempt / Recovery (Active attempt state)
 * 4. Concurrent Autosaves & Security Events (Answers + Option selections + Palette tracking)
 * 5. Synchronized Simultaneous Submissions & Automatic Evaluation
 * 
 * Measures:
 * - Throughput (Requests/sec)
 * - Latency distributions: Min, Mean, Median (p50), p95, p99, Max
 * - Success / Failure counts and Error Rate (%)
 * - Endpoint-by-endpoint performance breakdowns
 */

import * as crypto from "crypto";

const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:4000";
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

interface RequestMetric {
  endpoint: string;
  method: string;
  durationMs: number;
  statusCode: number;
  success: boolean;
  error?: string;
}

interface LatencySummary {
  count: number;
  min: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

interface StageResult {
  concurrency: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePercent: number;
  totalDurationMs: number;
  requestsPerSecond: number;
  overallLatency: LatencySummary;
  endpointLatency: Record<string, LatencySummary>;
  autosaveThroughputRps: number;
  submissionThroughputRps: number;
}

class SessionClient {
  private cookie = "";

  constructor(public id: string) {}

  async request(path: string, options: { method?: string; body?: unknown } = {}): Promise<{ status: number; data: any; durationMs: number }> {
    const url = `${API_BASE}/api${path}`;
    const headers: Record<string, string> = {
      Origin: CLIENT_URL,
    };
    if (this.cookie) {
      headers.Cookie = this.cookie;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      const durationMs = performance.now() - start;

      const sc = res.headers.getSetCookie?.() ?? [];
      for (const c of sc) {
        const kv = c.split(";")[0];
        this.cookie = kv.endsWith("=") ? "" : kv;
      }

      const data = await res.json().catch(() => ({}));
      return { status: res.status, data, durationMs };
    } catch (err: any) {
      const durationMs = performance.now() - start;
      return { status: 0, data: { error: err.message }, durationMs };
    }
  }
}

function calculateLatencies(durations: number[]): LatencySummary {
  if (durations.length === 0) {
    return { count: 0, min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const count = sorted.length;
  const percentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * count), count - 1);
    return sorted[idx];
  };

  return {
    count,
    min: Math.round(sorted[0] * 100) / 100,
    mean: Math.round((sum / count) * 100) / 100,
    p50: Math.round(percentile(50) * 100) / 100,
    p95: Math.round(percentile(95) * 100) / 100,
    p99: Math.round(percentile(99) * 100) / 100,
    max: Math.round(sorted[count - 1] * 100) / 100,
  };
}

let cachedAdminClient: SessionClient | null = null;
async function getAdminClient(): Promise<SessionClient> {
  if (cachedAdminClient) return cachedAdminClient;
  const admin = new SessionClient("admin");
  const loginRes = await admin.request("/auth/login", {
    method: "POST",
    body: { loginId: "admin", password: "ChangeMe-Admin-123" },
  });
  if (loginRes.status !== 200) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginRes.data)}`);
  }
  cachedAdminClient = admin;
  return admin;
}

// Admin setup: Create exam, questions, and students
async function setupLoadTestExam(targetUsers: number): Promise<{
  examId: string;
  questions: Array<{ id: string; options: Array<{ id: string; isCorrect: boolean }> }>;
  students: Array<{ enrollment: string; examKey: string; name: string }>;
}> {
  const admin = await getAdminClient();
  const stamp = Date.now().toString().slice(-6);
  const startTime = new Date(Date.now() - 3600_000).toISOString();
  const endTime = new Date(Date.now() + 86400_000).toISOString();

  // 1. Create Exam
  const examRes = await admin.request("/admin/exams", {
    method: "POST",
    body: {
      title: `Load Test Exam ${stamp} (${targetUsers} Users)`,
      description: "High concurrency load test exam",
      instructions: "Perform all questions and submit",
      durationMinutes: 60,
      startTime,
      endTime,
      totalQuestionsToAsk: null,
      shuffleQuestions: true,
      shuffleOptions: true,
      defaultMarks: 1,
      defaultNegative: 0.25,
      passPercentage: 40,
      resultVisibility: "AFTER_SUBMIT",
    },
  });

  if (examRes.status !== 201) {
    throw new Error(`Failed to create load exam: ${JSON.stringify(examRes.data)}`);
  }
  const examId = examRes.data.id;

  // 2. Import 20 Realistic Questions via CSV
  let csvContent = "question,optionA,optionB,optionC,optionD,correctAnswer,marks,negativeMarks\n";
  for (let q = 1; q <= 20; q++) {
    const correctLetter = ["A", "B", "C", "D"][(q - 1) % 4];
    csvContent += `"Load Test Question ${q}: What is the time complexity of operation ${q}?","O(1)","O(log N)","O(N)","O(N^2)",${correctLetter},1,0.25\n`;
  }

  const importQRes = await admin.request(`/admin/exams/${examId}/questions/import`, {
    method: "POST",
    body: { csv: csvContent },
  });

  if (importQRes.status !== 200 && importQRes.status !== 201) {
    throw new Error(`Failed to import questions: ${JSON.stringify(importQRes.data)}`);
  }

  // 3. Publish Exam
  const pubRes = await admin.request(`/admin/exams/${examId}/publish`, { method: "POST" });
  if (pubRes.status !== 200) {
    throw new Error(`Failed to publish exam: ${JSON.stringify(pubRes.data)}`);
  }

  // 4. Fetch created questions with options for answer simulation
  const questionsRes = await admin.request(`/admin/exams/${examId}/questions`);
  const questions = questionsRes.data;

  // 5. Batch assign students (generating unique 4-digit keys via CSV import)
  let studentCsv = "name,enrollment,department,section\n";
  for (let idx = 1; idx <= targetUsers; idx++) {
    const enrollment = `L${stamp}_${String(idx).padStart(4, "0")}`;
    const name = `Load Student ${idx}`;
    const dept = idx % 2 === 0 ? "CSE" : "ECE";
    const sec = idx % 3 === 0 ? "A" : "B";
    studentCsv += `"${name}","${enrollment}","${dept}","${sec}"\n`;
  }

  const assignRes = await admin.request(`/admin/exams/${examId}/assignments/import`, {
    method: "POST",
    body: { csv: studentCsv },
  });

  if (assignRes.status !== 200 && assignRes.status !== 201) {
    throw new Error(`Failed to import student assignments: ${JSON.stringify(assignRes.data)}`);
  }

  const assignedList = assignRes.data.assignments || [];
  const students = assignedList.map((a: any) => ({
    enrollment: a.loginId,
    examKey: a.password || a.examKey,
    name: a.name,
  }));

  return { examId, questions, students };
}

// Run single student workflow
async function runStudentScenario(
  studentInfo: { enrollment: string; examKey: string; name: string },
  examId: string,
  syncBarrier: { wait: () => Promise<void> },
  metrics: RequestMetric[]
) {
  const client = new SessionClient(studentInfo.enrollment);

  try {
    // 1. Verify Entry
    const vRes = await client.request("/student/verify", {
      method: "POST",
      body: { enrollmentNumber: studentInfo.enrollment, examKey: studentInfo.examKey },
    });
    metrics.push({
      endpoint: "POST /student/verify",
      method: "POST",
      durationMs: vRes.durationMs,
      statusCode: vRes.status,
      success: vRes.status === 200,
      error: vRes.status !== 200 ? JSON.stringify(vRes.data) : undefined,
    });
    if (vRes.status !== 200) {
      console.error(`[Verify Error] ${studentInfo.enrollment}: status=${vRes.status}`, vRes.data);
      return;
    }

    // 2. Start Exam
    const sRes = await client.request("/student/start", {
      method: "POST",
      body: { examId },
    });
    metrics.push({
      endpoint: "POST /student/start",
      method: "POST",
      durationMs: sRes.durationMs,
      statusCode: sRes.status,
      success: sRes.status === 200,
      error: sRes.status !== 200 ? JSON.stringify(sRes.data) : undefined,
    });
    if (sRes.status !== 200) {
      console.error(`[Start Error] ${studentInfo.enrollment}: status=${sRes.status}`, sRes.data);
      return;
    }

    const attemptId = sRes.data.attemptId;
    const questions: Array<{ id: string; options: Array<{ id: string }> }> = sRes.data.questions || [];

    // 3. Fetch Attempt (simulates reconnect / page load recovery)
    const attRes = await client.request("/student/attempt");
    metrics.push({
      endpoint: "GET /student/attempt",
      method: "GET",
      durationMs: attRes.durationMs,
      statusCode: attRes.status,
      success: attRes.status === 200,
    });

    // 4. Concurrent Autosaves across 5-8 questions
    const numToAnswer = Math.min(8, questions.length);
    for (let qIdx = 0; qIdx < numToAnswer; qIdx++) {
      const q = questions[qIdx];
      const chosenOpt = q.options[qIdx % q.options.length]?.id || null;

      const ansRes = await client.request("/student/answer", {
        method: "POST",
        body: {
          attemptId,
          questionId: q.id,
          selectedOptionId: chosenOpt,
          markedForReview: qIdx % 3 === 0,
          visited: true,
        },
      });

      metrics.push({
        endpoint: "POST /student/answer",
        method: "POST",
        durationMs: ansRes.durationMs,
        statusCode: ansRes.status,
        success: ansRes.status === 200,
        error: ansRes.status !== 200 ? JSON.stringify(ansRes.data) : undefined,
      });
    }

    // 5. Security Event (Fullscreen / Focus check)
    const evtRes = await client.request("/student/event", {
      method: "POST",
      body: {
        attemptId,
        eventType: "PAGE_VISIBLE",
        metadata: { browser: "Chrome", battery: 95 },
      },
    });
    metrics.push({
      endpoint: "POST /student/event",
      method: "POST",
      durationMs: evtRes.durationMs,
      statusCode: evtRes.status,
      success: evtRes.status === 200,
    });

    // 6. Wait at barrier for synchronized simultaneous submission
    await syncBarrier.wait();

    // 7. Simultaneous Submit & Automatic Evaluation
    const subRes = await client.request("/student/submit", {
      method: "POST",
      body: { attemptId },
    });
    metrics.push({
      endpoint: "POST /student/submit",
      method: "POST",
      durationMs: subRes.durationMs,
      statusCode: subRes.status,
      success: subRes.status === 200 && subRes.data?.ok === true,
      error: subRes.status !== 200 ? JSON.stringify(subRes.data) : undefined,
    });
  } catch (err: any) {
    console.error(`[Student Execution Exception] ${studentInfo.enrollment}:`, err);
  } finally {
    syncBarrier.signal();
  }
}

// Barrier synchronization class with safety timeout
class SimpleBarrier {
  private count = 0;
  private promise: Promise<void>;
  private resolve!: () => void;
  private timer: NodeJS.Timeout;

  constructor(private threshold: number, timeoutMs = 20000) {
    this.promise = new Promise((res) => {
      this.resolve = res;
    });
    this.timer = setTimeout(() => {
      this.resolve();
    }, timeoutMs);
  }

  async wait() {
    this.count++;
    if (this.count >= this.threshold) {
      clearTimeout(this.timer);
      this.resolve();
    }
    return this.promise;
  }

  signal() {
    this.count++;
    if (this.count >= this.threshold) {
      clearTimeout(this.timer);
      this.resolve();
    }
  }
}

// Execute benchmark for a given concurrency tier
async function benchmarkTier(concurrency: number): Promise<StageResult> {
  console.log(`\n======================================================`);
  console.log(`🚀 Starting Load Test Tier: ${concurrency} Concurrent Students`);
  console.log(`======================================================`);

  console.log(`  - Provisioning exam & ${concurrency} assigned student credentials...`);
  const setupStart = performance.now();
  const { examId, students } = await setupLoadTestExam(concurrency);
  console.log(`  - Setup completed in ${((performance.now() - setupStart) / 1000).toFixed(2)}s`);

  const metrics: RequestMetric[] = [];
  const barrier = new SimpleBarrier(concurrency);

  console.log(`  - Launching ${concurrency} virtual students simultaneously...`);
  const stageStart = performance.now();

  const studentPromises = students.map((std) =>
    runStudentScenario(std, examId, barrier, metrics)
  );

  await Promise.all(studentPromises);
  const totalDurationMs = performance.now() - stageStart;

  const totalRequests = metrics.length;
  const successfulRequests = metrics.filter((m) => m.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const errorRatePercent = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
  const requestsPerSecond = totalDurationMs > 0 ? (totalRequests / (totalDurationMs / 1000)) : 0;

  const overallLatency = calculateLatencies(metrics.map((m) => m.durationMs));

  // Endpoint specific breakdown
  const endpointMap = new Map<string, number[]>();
  for (const m of metrics) {
    if (!endpointMap.has(m.endpoint)) endpointMap.set(m.endpoint, []);
    endpointMap.get(m.endpoint)!.push(m.durationMs);
  }

  const endpointLatency: Record<string, LatencySummary> = {};
  for (const [ep, durations] of endpointMap.entries()) {
    endpointLatency[ep] = calculateLatencies(durations);
  }

  // Autosave and submission specific throughputs
  const autosaveMetrics = metrics.filter((m) => m.endpoint === "POST /student/answer");
  const autosaveThroughputRps = totalDurationMs > 0 ? (autosaveMetrics.length / (totalDurationMs / 1000)) : 0;

  const submitMetrics = metrics.filter((m) => m.endpoint === "POST /student/submit");
  const submitDurations = submitMetrics.map((m) => m.durationMs);
  const submitSumDuration = submitDurations.reduce((a, b) => a + b, 0);
  const submissionThroughputRps = submitSumDuration > 0 ? (submitMetrics.length / (submitSumDuration / 1000)) : 0;

  console.log(`\n📊 Tier Summary (${concurrency} Users):`);
  console.log(`  • Total Requests:      ${totalRequests}`);
  console.log(`  • Successful Requests: ${successfulRequests} (${(100 - errorRatePercent).toFixed(1)}%)`);
  console.log(`  • Failed Requests:     ${failedRequests} (${errorRatePercent.toFixed(2)}%)`);
  console.log(`  • Total Time:          ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`  • Throughput:          ${requestsPerSecond.toFixed(2)} req/s`);
  console.log(`  • Latencies (ms):      Min: ${overallLatency.min}ms | p50: ${overallLatency.p50}ms | p95: ${overallLatency.p95}ms | p99: ${overallLatency.p99}ms | Max: ${overallLatency.max}ms`);
  console.log(`  • Autosave RPS:        ${autosaveThroughputRps.toFixed(2)} req/s (p95: ${endpointLatency["POST /student/answer"]?.p95 ?? 0}ms)`);
  console.log(`  • Submission RPS:      ${submissionThroughputRps.toFixed(2)} req/s (p95: ${endpointLatency["POST /student/submit"]?.p95 ?? 0}ms)`);

  return {
    concurrency,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePercent: Math.round(errorRatePercent * 100) / 100,
    totalDurationMs: Math.round(totalDurationMs),
    requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
    overallLatency,
    endpointLatency,
    autosaveThroughputRps: Math.round(autosaveThroughputRps * 100) / 100,
    submissionThroughputRps: Math.round(submissionThroughputRps * 100) / 100,
  };
}

async function main() {
  console.log(`\n======================================================`);
  console.log(`  CBT76 Phase 7 — High Concurrency Load Test Suite    `);
  console.log(`  Target Concurrency: 10, 25, 50, 100, 150, 200 Users `);
  console.log(`======================================================\n`);

  const tiers = [10, 25, 50, 100, 150, 200];
  const results: StageResult[] = [];

  for (const tier of tiers) {
    try {
      const res = await benchmarkTier(tier);
      results.push(res);
      // Small cooldown between tiers
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err: any) {
      console.error(`❌ Load test tier ${tier} failed:`, err);
    }
  }

  console.log(`\n\n========================================================================================`);
  console.log(`                         FINAL PHASE 7 BENCHMARK RESULTS TABLE                           `);
  console.log(`========================================================================================`);
  console.log(`| Users | Total Req | Success | Failed | Error % | Throughput | p50 (ms) | p95 (ms) | Max (ms) | Submit p95 |`);
  console.log(`|-------|-----------|---------|--------|---------|------------|----------|----------|----------|------------|`);
  
  for (const r of results) {
    const submitP95 = r.endpointLatency["POST /student/submit"]?.p95 ?? 0;
    console.log(
      `| ${String(r.concurrency).padEnd(5)} ` +
      `| ${String(r.totalRequests).padEnd(9)} ` +
      `| ${String(r.successfulRequests).padEnd(7)} ` +
      `| ${String(r.failedRequests).padEnd(6)} ` +
      `| ${(r.errorRatePercent + "%").padEnd(7)} ` +
      `| ${(r.requestsPerSecond + " rps").padEnd(10)} ` +
      `| ${(r.overallLatency.p50 + "ms").padEnd(8)} ` +
      `| ${(r.overallLatency.p95 + "ms").padEnd(8)} ` +
      `| ${(r.overallLatency.max + "ms").padEnd(8)} ` +
      `| ${(submitP95 + "ms").padEnd(10)} |`
    );
  }
  console.log(`========================================================================================\n`);
}

main().catch((err) => {
  console.error("Fatal load test failure:", err);
  process.exit(1);
});
