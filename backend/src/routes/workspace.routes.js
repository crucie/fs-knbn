import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  listWorkspaces,
  createWorkspace,
  listWorkspaceProjects,
} from "../controllers/workspace.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", listWorkspaces);
router.post("/", createWorkspace);
router.get("/:workspaceId/projects", listWorkspaceProjects);

export default router;
