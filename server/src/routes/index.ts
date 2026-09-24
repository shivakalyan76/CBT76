import { Router } from "express";
import auth from "./auth";
import admin from "./admin";
import student from "./student";

const api = Router();
api.get("/health", (_req, res) => res.json({ ok: true }));
api.use("/auth", auth);
api.use("/admin", admin);
api.use("/student", student);

export default api;
