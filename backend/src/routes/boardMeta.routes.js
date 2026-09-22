import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectAdmin, isProjectMember } from "../middlewares/prjAccess.middleware.js";
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
} from "../controllers/card.controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(isProjectMember);

router.get("/labels", listLabels);
router.post("/labels", isProjectAdmin, createLabel);
router.patch("/labels/:labelId", isProjectAdmin, updateLabel);
router.delete("/labels/:labelId", isProjectAdmin, deleteLabel);

router.get("/custom-fields", listCustomFields);
router.post("/custom-fields", isProjectAdmin, createCustomField);
router.patch("/custom-fields/:fieldId", isProjectAdmin, updateCustomField);
router.delete("/custom-fields/:fieldId", isProjectAdmin, deleteCustomField);

export default router;
