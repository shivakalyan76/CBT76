import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config, allowedOrigins } from "./config";
import { originGuard } from "./middleware/csrf";
import { errorHandler } from "./middleware/error";
import api from "./routes";

export const app = express();
app.set("trust proxy", 1); // Render sits behind a reverse proxy

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, mobile) or in allowedOrigins
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, "")) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api", originGuard, api);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);
