import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  createProject,
  getMyProjects,
  getProject,
  deleteProject,
  leaveProject,
  inviteMember,
  removeMember,
} from "../controllers/project.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getMyProjects);
router.post("/", createProject);

router.get("/:projectId", getProject);
router.delete("/:projectId", isProjectAdmin, deleteProject);
router.post("/:projectId/leave", isProjectMember, leaveProject);

router.post("/:projectId/members", isProjectAdmin, inviteMember);
router.delete("/:projectId/members/:userId", isProjectAdmin, removeMember);

export default router;
