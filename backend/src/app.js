import express from "express";
import cors from "cors";
import { ApiError } from "./utils/ApiError.js";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes from "./routes/task.routes.js";

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "https://kanban.kshimate.space"];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);

// Nested task routes under projects
app.use("/api/projects/:projectId/tasks", taskRoutes);

// --- Health Check ---
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// --- 404 Fallback ---
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  }

  console.error(err.stack);
  return res.status(500).json({
    success: false,
    message: "Unexpected server error.",
  });
});

export default app;
