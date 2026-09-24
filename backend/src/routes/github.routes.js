import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectMaintainer, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  githubStatus,
  githubOAuthUrl,
  connectGithub,
  syncGithub,
  disconnectGithub,
} from "../controllers/github.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate, isProjectMember);
router.get("/status", githubStatus);
router.get("/oauth-url", isProjectMaintainer, githubOAuthUrl);
router.post("/connect", isProjectMaintainer, connectGithub);
router.post("/sync", isProjectMaintainer, syncGithub);
router.delete("/", isProjectMaintainer, disconnectGithub);

export default router;
