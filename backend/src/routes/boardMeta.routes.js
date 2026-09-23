import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { isProjectMaintainer, isProjectMember } from "../middlewares/prjAccess.middleware.js";
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
router.post("/labels", isProjectMaintainer, createLabel);
router.patch("/labels/:labelId", isProjectMaintainer, updateLabel);
router.delete("/labels/:labelId", isProjectMaintainer, deleteLabel);

router.get("/custom-fields", listCustomFields);
router.post("/custom-fields", isProjectMaintainer, createCustomField);
router.patch("/custom-fields/:fieldId", isProjectMaintainer, updateCustomField);
router.delete("/custom-fields/:fieldId", isProjectMaintainer, deleteCustomField);

export default router;
