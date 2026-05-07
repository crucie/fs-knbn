import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import projectRoutes from "./routes/project.routes.js";
import taskRoutes from "./routes/task.routes.js";

const app = express();

// --- Middleware ---
app.use(cors({
  origin: [
    "https://localhost:5173",
    "https://kanban.kshimate.space"
  ]
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
  console.error(err.stack);
  res.status(500).json({ error: "Unexpected server error." });
});

export default app;
