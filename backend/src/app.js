import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { ApiError } from "./utils/ApiError.js";
import errorHandler from "./middlewares/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes from "./routes/task.routes.js";
import columnRoutes from "./routes/column.routes.js";
import boardMetaRoutes from "./routes/boardMeta.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import channelRoutes from "./routes/channel.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import githubRoutes from "./routes/github.routes.js";
import { bountyRouter } from "./routes/bounty.routes.js";
import { UPLOAD_DIR } from "./controllers/card.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProd = process.env.NODE_ENV === "production";

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    // API responses don't need a browser CSP; it only confuses some clients
    contentSecurityPolicy: false,
  })
);

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const originAllowList = new Set([...defaultDevOrigins, ...allowedOrigins]);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (originAllowList.has(origin)) return true;
  // Local Vite / preview ports in development
  if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

app.use(
  cors({
    origin(origin, cb) {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Type"],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts. Try again later." },
});

app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/google/url", authLimiter);
app.use("/api/auth/github/url", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/projects/:projectId/columns", columnRoutes);
app.use("/api/projects/:projectId", boardMetaRoutes);
app.use("/api/projects/:projectId/tasks", taskRoutes);
app.use("/api/projects/:projectId/github", githubRoutes);
app.use("/api/bounties", bountyRouter);
app.use("/api/calendar", calendarRoutes);
app.use("/api/projects/:projectId/channels", channelRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return errorHandler(err, req, res, next);
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "File too large." });
  }
  // Surface common Prisma / validation failures instead of opaque 500s
  if (err?.code === "P2021" || err?.code === "P2022") {
    console.error("[fs-knbn] Schema mismatch:", err.message);
    return res.status(500).json({
      success: false,
      message: "Database schema is out of date. Run prisma db push.",
    });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ success: false, message: "Duplicate record." });
  }
  if (err?.code === "P2003") {
    return res.status(400).json({ success: false, message: "Related record not found." });
  }
  console.error(err.stack || err);
  return res.status(500).json({
    success: false,
    message: isProd ? "Unexpected server error." : err.message || "Unexpected server error.",
  });
});

export default app;
