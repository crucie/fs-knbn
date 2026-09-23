import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  isProjectMaintainer,
  isProjectMember,
  canEditCards,
} from "../middlewares/prjAccess.middleware.js";
import {
  createTask,
  moveTask,
  updateTask,
  deleteTask,
} from "../controllers/task.controller.js";
import {
  getTask,
  setTaskLabels,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  createComment,
  deleteComment,
  upload,
  uploadAttachment,
  deleteAttachment,
  setCustomFieldValue,
  mirrorTask,
} from "../controllers/card.controller.js";
import { createBounty } from "../controllers/bounty.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember);

router.post("/", canEditCards, createTask);
router.get("/:taskId", getTask);
router.patch("/:taskId/move", canEditCards, moveTask);
router.patch("/:taskId", canEditCards, updateTask);
router.delete("/:taskId", canEditCards, deleteTask);

router.put("/:taskId/labels", canEditCards, setTaskLabels);

router.post("/:taskId/checklists", canEditCards, createChecklist);
router.patch("/:taskId/checklists/:checklistId", canEditCards, updateChecklist);
router.delete("/:taskId/checklists/:checklistId", canEditCards, deleteChecklist);
router.post("/:taskId/checklists/:checklistId/items", canEditCards, addChecklistItem);
router.patch("/:taskId/checklists/:checklistId/items/:itemId", canEditCards, updateChecklistItem);
router.delete("/:taskId/checklists/:checklistId/items/:itemId", canEditCards, deleteChecklistItem);

router.post("/:taskId/comments", canEditCards, createComment);
router.delete("/:taskId/comments/:commentId", canEditCards, deleteComment);

router.post(
  "/:taskId/attachments",
  canEditCards,
  upload.single("file"),
  uploadAttachment
);
router.delete("/:taskId/attachments/:attachmentId", canEditCards, deleteAttachment);

router.put("/:taskId/custom-fields/:fieldId", canEditCards, setCustomFieldValue);
router.post("/:taskId/mirror", isProjectMaintainer, mirrorTask);

router.post("/:taskId/bounty", isProjectMaintainer, createBounty);

export default router;
