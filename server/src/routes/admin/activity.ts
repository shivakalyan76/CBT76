import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { HttpError, h } from "../../utils/http";

const r = Router();

export const SUSPICIOUS_EVENT_TYPES = new Set([
  "TAB_SWITCH",
  "FULLSCREEN_EXIT",
  "PAGE_HIDDEN",
  "WINDOW_BLUR",
  "REFRESH_ATTEMPT",
  "CONNECTION_LOST",
  "LEAVE_ATTEMPT",
  "CAMERA_PERMISSION_DENIED",
  "CAMERA_DISCONNECTED",
]);

export const EVENT_LABELS: Record<string, string> = {
  EXAM_STARTED: "Exam Started",
  TAB_SWITCH: "Tab Switch",
  FULLSCREEN_EXIT: "Fullscreen Exit",
  FULLSCREEN_ENTER: "Fullscreen Entered",
  FULLSCREEN_RESTORED: "Fullscreen Restored",
  PAGE_HIDDEN: "Page Hidden / Tab Switch",
  PAGE_VISIBLE: "Page Restored / Visible",
  CONNECTION_LOST: "Connection Lost (Offline)",
  CONNECTION_RESTORED: "Connection Restored (Online)",
  REFRESH_ATTEMPT: "Page Reload Attempt",
  WINDOW_BLUR: "Window Focus Lost",
  WINDOW_FOCUS: "Window Focus Restored",
  LEAVE_ATTEMPT: "Page Leave Attempt",
  CAMERA_PERMISSION_GRANTED: "Camera Permission Granted",
  CAMERA_PERMISSION_DENIED: "Camera Permission Denied",
  CAMERA_STARTED: "Camera Preview Started",
  CAMERA_STOPPED: "Camera Preview Stopped",
  CAMERA_DISCONNECTED: "Camera Disconnected",
  CAMERA_RECONNECTED: "Camera Reconnected",
  EXAM_SUBMITTED: "Exam Submitted",
  AUTO_SUBMITTED: "Auto Submitted",
};

export function getEventLabel(type: string): string {
  return EVENT_LABELS[type.toUpperCase()] || type.replace(/_/g, " ");
}

export function isSuspiciousEvent(type: string): boolean {
  return SUSPICIOUS_EVENT_TYPES.has(type.toUpperCase());
}

/**
 * 1. GET /api/admin/exams/:examId/activity
 * List all students assigned to the exam with real-time attempt status, suspicious activity count,
 * last active timestamp, and summary counts.
 */
const activityQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED"]).optional(),
  suspiciousOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

r.get("/:examId/activity", h(async (req, res) => {
  const { examId } = req.params;
  const q = activityQuerySchema.parse(req.query);

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, status: true },
  });

  if (!exam) {
    throw new HttpError(404, "Exam not found");
  }

  // Fetch all assignments with user and attempts
  const assignments = await prisma.examAssignment.findMany({
    where: { examId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          loginId: true,
          department: true,
          section: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Fetch all attempts for this exam with their events
  const attempts = await prisma.attempt.findMany({
    where: { examId },
    include: {
      events: {
        orderBy: { timestamp: "desc" },
      },
    },
  });

  const attemptMap = new Map(attempts.map((a) => [a.studentId, a]));

  // Build items for all assigned students
  let items = assignments.map((assignment) => {
    const student = assignment.student;
    const attempt = attemptMap.get(assignment.studentId);

    const attemptStatus = attempt ? attempt.status : "NOT_STARTED";
    const events = attempt?.events || [];

    const suspiciousEvents = events.filter((e) => isSuspiciousEvent(e.eventType));
    const suspiciousCount = suspiciousEvents.length;

    // Breakdown
    const breakdown = {
      tabSwitches: events.filter((e) => e.eventType === "TAB_SWITCH" || e.eventType === "PAGE_HIDDEN").length,
      fullscreenExits: events.filter((e) => e.eventType === "FULLSCREEN_EXIT").length,
      windowBlurs: events.filter((e) => e.eventType === "WINDOW_BLUR").length,
      refreshAttempts: events.filter((e) => e.eventType === "REFRESH_ATTEMPT").length,
      connectionLosses: events.filter((e) => e.eventType === "CONNECTION_LOST").length,
    };

    // Determine latest activity
    let lastActivityAt: Date | null = null;
    if (events.length > 0) {
      lastActivityAt = events[0].timestamp;
    } else if (attempt?.submittedAt) {
      lastActivityAt = attempt.submittedAt;
    } else if (attempt?.startedAt) {
      lastActivityAt = attempt.startedAt;
    }

    return {
      assignmentId: assignment.id,
      studentId: student.id,
      name: student.name,
      enrollmentNumber: student.loginId,
      department: assignment.department || student.department || "",
      section: assignment.section || student.section || "",
      attemptId: attempt?.id ?? null,
      attemptStatus,
      startedAt: attempt?.startedAt?.toISOString() ?? null,
      submittedAt: attempt?.submittedAt?.toISOString() ?? null,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      totalEventsCount: events.length,
      suspiciousEventsCount: suspiciousCount,
      breakdown,
      latestEventType: events[0]?.eventType ?? null,
      latestEventLabel: events[0] ? getEventLabel(events[0].eventType) : null,
    };
  });

  // Calculate summary metrics across all assigned students
  const now = Date.now();
  const twoMinutesAgo = now - 2 * 60 * 1000;

  const summary = {
    totalAssigned: assignments.length,
    started: attempts.length,
    inProgress: attempts.filter((a) => a.status === "IN_PROGRESS").length,
    submitted: attempts.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED").length,
    activeNow: items.filter(
      (i) => i.attemptStatus === "IN_PROGRESS" && i.lastActivityAt && new Date(i.lastActivityAt).getTime() >= twoMinutesAgo
    ).length,
    totalSuspiciousEvents: items.reduce((acc, cur) => acc + cur.suspiciousEventsCount, 0),
    studentsWithFlags: items.filter((i) => i.suspiciousEventsCount > 0).length,
  };

  // Filtering
  if (q.search) {
    const s = q.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.name.toLowerCase().includes(s) ||
        i.enrollmentNumber.toLowerCase().includes(s) ||
        i.department.toLowerCase().includes(s) ||
        i.section.toLowerCase().includes(s)
    );
  }

  if (q.status) {
    items = items.filter((i) => i.attemptStatus === q.status);
  }

  if (q.suspiciousOnly) {
    items = items.filter((i) => i.suspiciousEventsCount > 0);
  }

  // Sort: students with higher suspicious events first, then by last active
  items.sort((a, b) => {
    if (b.suspiciousEventsCount !== a.suspiciousEventsCount) {
      return b.suspiciousEventsCount - a.suspiciousEventsCount;
    }
    const tA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tB - tA;
  });

  const total = items.length;
  const start = (q.page - 1) * q.pageSize;
  const paginatedItems = items.slice(start, start + q.pageSize);

  res.json({
    items: paginatedItems,
    total,
    page: q.page,
    pageSize: q.pageSize,
    summary,
  });
}));

/**
 * 2. GET /api/admin/exams/:examId/activity/:studentId
 * Get chronological event log / audit timeline for a specific student attempt.
 */
r.get("/:examId/activity/:studentId", h(async (req, res) => {
  const { examId, studentId } = req.params;

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      loginId: true,
      department: true,
      section: true,
    },
  });

  if (!student) {
    throw new HttpError(404, "Student not found");
  }

  const assignment = await prisma.examAssignment.findUnique({
    where: { examId_studentId: { examId, studentId } },
  });

  const attempt = await prisma.attempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: {
      events: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  const events = (attempt?.events || []).map((e) => {
    const isSuspicious = isSuspiciousEvent(e.eventType);
    const label = getEventLabel(e.eventType);

    return {
      id: e.id,
      eventType: e.eventType,
      label,
      isSuspicious,
      timestamp: e.timestamp.toISOString(),
      metadata: e.metadata || null,
    };
  });

  res.json({
    student: {
      id: student.id,
      name: student.name,
      enrollmentNumber: student.loginId,
      department: assignment?.department || student.department || "",
      section: assignment?.section || student.section || "",
    },
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt.toISOString(),
          submittedAt: attempt.submittedAt?.toISOString() ?? null,
          deadline: attempt.deadline.toISOString(),
        }
      : null,
    events,
    suspiciousCount: events.filter((e) => e.isSuspicious).length,
  });
}));

export default r;
