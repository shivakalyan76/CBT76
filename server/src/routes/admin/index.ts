import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import exams from "./exams";
import questions from "./questions";
import students from "./students";
import results from "./results";
import activity from "./activity";
import analytics from "./analytics";

const admin = Router();
admin.use(requireAuth, requireRole("ADMIN"));
admin.use("/exams", analytics); // /exams/:examId/analytics/*
admin.use("/exams", activity); // /exams/:examId/activity, /exams/:examId/activity/:studentId
admin.use("/exams", results); // /exams/:examId/results, /exams/:examId/results/export, /exams/:examId/results/:studentId
admin.use("/exams", exams);
admin.use("/students", students);
admin.use("/", questions); // /exams/:examId/questions, /questions/:id

export default admin;
