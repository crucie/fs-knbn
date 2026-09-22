import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin, isProjectMember } from "../middlewares/prjAccess.middleware.js";
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

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember);

router.post("/", isProjectAdmin, createTask);
router.get("/:taskId", getTask);
router.patch("/:taskId/move", moveTask);
router.patch("/:taskId", isProjectAdmin, updateTask);
router.delete("/:taskId", isProjectAdmin, deleteTask);

router.put("/:taskId/labels", isProjectAdmin, setTaskLabels);

router.post("/:taskId/checklists", isProjectAdmin, createChecklist);
router.patch("/:taskId/checklists/:checklistId", isProjectAdmin, updateChecklist);
router.delete("/:taskId/checklists/:checklistId", isProjectAdmin, deleteChecklist);
router.post("/:taskId/checklists/:checklistId/items", isProjectAdmin, addChecklistItem);
router.patch("/:taskId/checklists/:checklistId/items/:itemId", updateChecklistItem);
router.delete("/:taskId/checklists/:checklistId/items/:itemId", isProjectAdmin, deleteChecklistItem);

router.post("/:taskId/comments", createComment);
router.delete("/:taskId/comments/:commentId", deleteComment);

router.post(
  "/:taskId/attachments",
  isProjectAdmin,
  upload.single("file"),
  uploadAttachment
);
router.delete("/:taskId/attachments/:attachmentId", deleteAttachment);

router.put("/:taskId/custom-fields/:fieldId", isProjectAdmin, setCustomFieldValue);
router.post("/:taskId/mirror", isProjectAdmin, mirrorTask);

export default router;
