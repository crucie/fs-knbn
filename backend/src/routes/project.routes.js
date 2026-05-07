import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin } from "../middlewares/prjAccess.middleware.js";
import {
  createProject,
  getMyProjects,
  getProject,
  inviteMember,
  removeMember,
} from "../controllers/project.controller.js";

const router = Router();

// All project routes require authentication
router.use(authenticate);

// GET  /api/projects        — List all projects the user belongs to
// POST /api/projects        — Create a new project (any authenticated user)
router.get("/", getMyProjects);
router.post("/", createProject);

// GET /api/projects/:projectId — Get single project (membership verified inside controller)
router.get("/:projectId", getProject);

// POST   /api/projects/:projectId/members         — Invite user (Admin only)
// DELETE /api/projects/:projectId/members/:userId — Remove member (Admin only)
router.post("/:projectId/members", isProjectAdmin, inviteMember);
router.delete("/:projectId/members/:userId", isProjectAdmin, removeMember);

export default router;
