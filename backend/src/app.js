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
import { UPLOAD_DIR } from "./controllers/card.controller.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "https://knbn.kshimate.space"];

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts. Try again later." },
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/projects/:projectId/columns", columnRoutes);
app.use("/api/projects/:projectId", boardMetaRoutes);
app.use("/api/projects/:projectId/tasks", taskRoutes);

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
  console.error(err.stack);
  return res.status(500).json({
    success: false,
    message: "Unexpected server error.",
  });
});

export default app;
