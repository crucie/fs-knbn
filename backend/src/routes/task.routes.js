import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  createTask,
  updateTaskStatus,
  updateTask,
  deleteTask,
} from "../controllers/task.controller.js";

// All task routes are nested under /api/projects/:projectId/tasks
const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember); // All task routes require at least project membership

// POST   /api/projects/:projectId/tasks               — Admin creates a task
router.post("/", isProjectAdmin, createTask);

// PATCH  /api/projects/:projectId/tasks/:taskId/status — Admin OR assigned member updates status
router.patch("/:taskId/status", updateTaskStatus);

// PATCH  /api/projects/:projectId/tasks/:taskId       — Admin updates task details
router.patch("/:taskId", isProjectAdmin, updateTask);

// DELETE /api/projects/:projectId/tasks/:taskId       — Admin deletes task
router.delete("/:taskId", isProjectAdmin, deleteTask);

export default router;
