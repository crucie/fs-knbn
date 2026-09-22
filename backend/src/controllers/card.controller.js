import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { logActivity, cardInclude, shapeCard, syncMirrorsFromSource } from "../utils/cardHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, "../../uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 250 * 1024 * 1024);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
});

async function getTaskOrThrow(projectId, taskId) {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId } });
  if (!task) throw new ApiError(404, "Task not found.");
  return task;
}

async function loadCard(projectId, taskId) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    include: cardInclude,
  });
  if (!task) throw new ApiError(404, "Task not found.");
  return shapeCard(task);
}

// GET /api/projects/:projectId/tasks/:taskId
export const getTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const card = await loadCard(projectId, taskId);
  const activities = await prisma.activity.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { id: true, username: true, avatarUrl: true } } },
  });
  return res.status(200).json(new ApiResponse(200, { ...card, activities }, "OK"));
});

// --- Labels (project-level) ---
export const listLabels = asyncHandler(async (req, res) => {
  const labels = await prisma.label.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { name: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, labels, "OK"));
});

export const createLabel = asyncHandler(async (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Label name is required.");
  const label = await prisma.label.create({
    data: {
      projectId: req.params.projectId,
      name: name.trim(),
      color: color || "#61bd4f",
    },
  });
  return res.status(201).json(new ApiResponse(201, label, "Label created."));
});

export const updateLabel = asyncHandler(async (req, res) => {
  const { labelId, projectId } = req.params;
  const existing = await prisma.label.findFirst({ where: { id: labelId, projectId } });
  if (!existing) throw new ApiError(404, "Label not found.");
  const updated = await prisma.label.update({
    where: { id: labelId },
    data: {
      ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
      ...(req.body.color !== undefined && { color: req.body.color }),
    },
  });
  return res.status(200).json(new ApiResponse(200, updated, "Label updated."));
});

export const deleteLabel = asyncHandler(async (req, res) => {
  const { labelId, projectId } = req.params;
  const existing = await prisma.label.findFirst({ where: { id: labelId, projectId } });
  if (!existing) throw new ApiError(404, "Label not found.");
  await prisma.label.delete({ where: { id: labelId } });
  return res.status(200).json(new ApiResponse(200, null, "Label deleted."));
});

export const setTaskLabels = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const labelIds = Array.isArray(req.body.labelIds) ? req.body.labelIds : [];
  await getTaskOrThrow(projectId, taskId);

  const valid = await prisma.label.findMany({
    where: { projectId, id: { in: labelIds } },
  });
  const validIds = valid.map((l) => l.id);

  await prisma.$transaction([
    prisma.taskLabel.deleteMany({ where: { taskId } }),
    ...validIds.map((labelId) =>
      prisma.taskLabel.create({ data: { taskId, labelId } })
    ),
  ]);

  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "labels_updated",
    meta: { labelIds: validIds },
  });

  const card = await loadCard(projectId, taskId);
  return res.status(200).json(new ApiResponse(200, card, "Labels updated."));
});

// --- Checklists ---
export const createChecklist = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const title = (req.body.title || "Checklist").trim();
  const agg = await prisma.checklist.aggregate({
    where: { taskId },
    _max: { position: true },
  });
  const checklist = await prisma.checklist.create({
    data: { taskId, title, position: (agg._max.position ?? -1) + 1 },
    include: { items: true },
  });
  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "checklist_added",
    meta: { title },
  });
  return res.status(201).json(new ApiResponse(201, checklist, "Checklist created."));
});

export const updateChecklist = asyncHandler(async (req, res) => {
  const { projectId, taskId, checklistId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const cl = await prisma.checklist.findFirst({ where: { id: checklistId, taskId } });
  if (!cl) throw new ApiError(404, "Checklist not found.");
  const updated = await prisma.checklist.update({
    where: { id: checklistId },
    data: { ...(req.body.title !== undefined && { title: String(req.body.title).trim() }) },
    include: { items: { orderBy: { position: "asc" }, include: { assignedTo: { select: { id: true, username: true } } } } },
  });
  return res.status(200).json(new ApiResponse(200, updated, "Checklist updated."));
});

export const deleteChecklist = asyncHandler(async (req, res) => {
  const { projectId, taskId, checklistId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const cl = await prisma.checklist.findFirst({ where: { id: checklistId, taskId } });
  if (!cl) throw new ApiError(404, "Checklist not found.");
  await prisma.checklist.delete({ where: { id: checklistId } });
  return res.status(200).json(new ApiResponse(200, null, "Checklist deleted."));
});

export const addChecklistItem = asyncHandler(async (req, res) => {
  const { projectId, taskId, checklistId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const cl = await prisma.checklist.findFirst({ where: { id: checklistId, taskId } });
  if (!cl) throw new ApiError(404, "Checklist not found.");
  const title = String(req.body.title || "").trim();
  if (!title) throw new ApiError(400, "Item title is required.");

  const agg = await prisma.checklistItem.aggregate({
    where: { checklistId },
    _max: { position: true },
  });

  const item = await prisma.checklistItem.create({
    data: {
      checklistId,
      title,
      position: (agg._max.position ?? -1) + 1,
      assignedToId: req.body.assignedToId || null,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    },
    include: { assignedTo: { select: { id: true, username: true } } },
  });
  return res.status(201).json(new ApiResponse(201, item, "Item added."));
});

export const updateChecklistItem = asyncHandler(async (req, res) => {
  const { projectId, taskId, checklistId, itemId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklistId },
    include: { checklist: true },
  });
  if (!item || item.checklist.taskId !== taskId) {
    throw new ApiError(404, "Checklist item not found.");
  }

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      ...(req.body.title !== undefined && { title: String(req.body.title).trim() }),
      ...(req.body.completed !== undefined && { completed: !!req.body.completed }),
      ...(req.body.assignedToId !== undefined && { assignedToId: req.body.assignedToId || null }),
      ...(req.body.dueDate !== undefined && {
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      }),
    },
    include: { assignedTo: { select: { id: true, username: true } } },
  });
  return res.status(200).json(new ApiResponse(200, updated, "Item updated."));
});

export const deleteChecklistItem = asyncHandler(async (req, res) => {
  const { projectId, taskId, checklistId, itemId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, checklistId },
    include: { checklist: true },
  });
  if (!item || item.checklist.taskId !== taskId) {
    throw new ApiError(404, "Checklist item not found.");
  }
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return res.status(200).json(new ApiResponse(200, null, "Item deleted."));
});

// --- Comments ---
export const createComment = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const body = String(req.body.body || "").trim();
  if (!body) throw new ApiError(400, "Comment body is required.");
  const comment = await prisma.comment.create({
    data: { taskId, authorId: req.user.id, body },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  });
  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "comment_added",
  });
  return res.status(201).json(new ApiResponse(201, comment, "Comment added."));
});

export const deleteComment = asyncHandler(async (req, res) => {
  const { projectId, taskId, commentId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const comment = await prisma.comment.findFirst({ where: { id: commentId, taskId } });
  if (!comment) throw new ApiError(404, "Comment not found.");

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: req.user.id, projectId } },
  });
  if (comment.authorId !== req.user.id && membership?.role !== "ADMIN") {
    throw new ApiError(403, "Forbidden.");
  }
  await prisma.comment.delete({ where: { id: commentId } });
  return res.status(200).json(new ApiResponse(200, null, "Comment deleted."));
});

// --- Attachments ---
export const uploadAttachment = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  if (!req.file) throw new ApiError(400, "No file uploaded.");

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      uploaderId: req.user.id,
      filename: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
    include: { uploader: { select: { id: true, username: true } } },
  });

  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "attachment_added",
    meta: { filename: attachment.filename },
  });

  return res.status(201).json(new ApiResponse(201, attachment, "Uploaded."));
});

export const deleteAttachment = asyncHandler(async (req, res) => {
  const { projectId, taskId, attachmentId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const att = await prisma.attachment.findFirst({ where: { id: attachmentId, taskId } });
  if (!att) throw new ApiError(404, "Attachment not found.");

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: req.user.id, projectId } },
  });
  if (att.uploaderId !== req.user.id && membership?.role !== "ADMIN") {
    throw new ApiError(403, "Forbidden.");
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(att.url));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await prisma.attachment.delete({ where: { id: attachmentId } });
  return res.status(200).json(new ApiResponse(200, null, "Attachment deleted."));
});

// --- Custom fields (project) ---
export const listCustomFields = asyncHandler(async (req, res) => {
  const fields = await prisma.customField.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { position: "asc" },
  });
  return res.status(200).json(new ApiResponse(200, fields, "OK"));
});

export const createCustomField = asyncHandler(async (req, res) => {
  const { name, type, options } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Field name is required.");
  const allowed = ["TEXT", "NUMBER", "DROPDOWN", "DATE", "CHECKBOX"];
  const fieldType = allowed.includes(type) ? type : "TEXT";
  const agg = await prisma.customField.aggregate({
    where: { projectId: req.params.projectId },
    _max: { position: true },
  });
  const field = await prisma.customField.create({
    data: {
      projectId: req.params.projectId,
      name: name.trim(),
      type: fieldType,
      options: options ?? undefined,
      position: (agg._max.position ?? -1) + 1,
    },
  });
  return res.status(201).json(new ApiResponse(201, field, "Field created."));
});

export const updateCustomField = asyncHandler(async (req, res) => {
  const { projectId, fieldId } = req.params;
  const existing = await prisma.customField.findFirst({ where: { id: fieldId, projectId } });
  if (!existing) throw new ApiError(404, "Field not found.");
  const updated = await prisma.customField.update({
    where: { id: fieldId },
    data: {
      ...(req.body.name !== undefined && { name: String(req.body.name).trim() }),
      ...(req.body.type !== undefined && { type: req.body.type }),
      ...(req.body.options !== undefined && { options: req.body.options }),
    },
  });
  return res.status(200).json(new ApiResponse(200, updated, "Field updated."));
});

export const deleteCustomField = asyncHandler(async (req, res) => {
  const { projectId, fieldId } = req.params;
  const existing = await prisma.customField.findFirst({ where: { id: fieldId, projectId } });
  if (!existing) throw new ApiError(404, "Field not found.");
  await prisma.customField.delete({ where: { id: fieldId } });
  return res.status(200).json(new ApiResponse(200, null, "Field deleted."));
});

export const setCustomFieldValue = asyncHandler(async (req, res) => {
  const { projectId, taskId, fieldId } = req.params;
  await getTaskOrThrow(projectId, taskId);
  const field = await prisma.customField.findFirst({ where: { id: fieldId, projectId } });
  if (!field) throw new ApiError(404, "Field not found.");

  const record = await prisma.customFieldValue.upsert({
    where: { taskId_fieldId: { taskId, fieldId } },
    create: { taskId, fieldId, value: req.body.value ?? null },
    update: { value: req.body.value ?? null },
    include: { field: true },
  });
  return res.status(200).json(new ApiResponse(200, record, "Value saved."));
});

// --- Mirror ---
export const mirrorTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const { targetProjectId, targetColumnId } = req.body;
  if (!targetProjectId || !targetColumnId) {
    throw new ApiError(400, "targetProjectId and targetColumnId are required.");
  }

  const source = await prisma.task.findFirst({
    where: { id: taskId, projectId },
    include: { labels: true },
  });
  if (!source) throw new ApiError(404, "Task not found.");
  if (source.mirrorOfId) throw new ApiError(400, "Cannot mirror a mirror card.");

  const membership = await prisma.projectMember.findUnique({
    where: {
      userId_projectId: { userId: req.user.id, projectId: targetProjectId },
    },
  });
  if (!membership || membership.role !== "ADMIN") {
    throw new ApiError(403, "Admin access required on target project.");
  }

  const column = await prisma.boardColumn.findFirst({
    where: { id: targetColumnId, projectId: targetProjectId },
  });
  if (!column) throw new ApiError(400, "Target column not found.");

  const mirror = await prisma.task.create({
    data: {
      title: source.title,
      description: source.description,
      dueDate: source.dueDate,
      projectId: targetProjectId,
      columnId: targetColumnId,
      createdById: req.user.id,
      assignedToId: null,
      mirrorOfId: source.id,
      position: 0,
    },
    include: cardInclude,
  });

  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "card_mirrored",
    meta: { mirrorId: mirror.id, targetProjectId },
  });

  return res.status(201).json(new ApiResponse(201, shapeCard(mirror), "Mirror created."));
});

export { loadCard, getTaskOrThrow, syncMirrorsFromSource };
