import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  isProjectOwner,
  isProjectMaintainer,
  isProjectMember,
} from "../middlewares/prjAccess.middleware.js";
import {
  createProject,
  getMyProjects,
  getProject,
  deleteProject,
  leaveProject,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "../controllers/project.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", getMyProjects);
router.post("/", createProject);

router.get("/:projectId", getProject);
router.delete("/:projectId", isProjectOwner, deleteProject);
router.post("/:projectId/leave", isProjectMember, leaveProject);

router.post("/:projectId/members", isProjectMaintainer, inviteMember);
router.patch("/:projectId/members/:userId", isProjectMaintainer, updateMemberRole);
router.delete("/:projectId/members/:userId", isProjectMaintainer, removeMember);

export default router;
