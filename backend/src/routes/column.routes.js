import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "../controllers/column.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember);

router.post("/", isProjectAdmin, createColumn);
router.patch("/reorder", isProjectAdmin, reorderColumns);
router.patch("/:columnId", isProjectAdmin, updateColumn);
router.delete("/:columnId", isProjectAdmin, deleteColumn);

export default router;
