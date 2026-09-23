import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectMaintainer, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "../controllers/column.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember);

router.post("/", isProjectMaintainer, createColumn);
router.patch("/reorder", isProjectMaintainer, reorderColumns);
router.patch("/:columnId", isProjectMaintainer, updateColumn);
router.delete("/:columnId", isProjectMaintainer, deleteColumn);

export default router;
