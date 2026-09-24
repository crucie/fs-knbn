import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  createBounty,
  fundBounty,
  claimBounty,
  submitBounty,
  approveBounty,
  requestChanges,
  disputeBounty,
  getBounty,
  myLedger,
} from "../controllers/bounty.controller.js";
import { isProjectMember, isProjectMaintainer } from "../middlewares/prjAccess.middleware.js";

const bountyRouter = Router();
bountyRouter.use(authenticate);
bountyRouter.get("/ledger/me", myLedger);
bountyRouter.get("/:id", getBounty);
bountyRouter.post("/:id/fund", fundBounty);
bountyRouter.post("/:id/claim", claimBounty);
bountyRouter.post("/:id/submit", submitBounty);
bountyRouter.post("/:id/approve", approveBounty);
bountyRouter.post("/:id/request-changes", requestChanges);
bountyRouter.post("/:id/dispute", disputeBounty);

const taskBountyRouter = Router({ mergeParams: true });
taskBountyRouter.use(authenticate, isProjectMember);
taskBountyRouter.post("/", isProjectMaintainer, createBounty);

export { bountyRouter, taskBountyRouter };
