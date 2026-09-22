import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
} from "../validations/task.validation.js";
import {
  cardInclude,
  shapeCard,
  logActivity,
  syncMirrorsFromSource,
} from "../utils/cardHelpers.js";

const boardTaskInclude = {
  assignedTo: { select: { id: true, username: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, username: true } },
  column: { select: { id: true, name: true, color: true, position: true } },
  labels: { include: { label: true } },
  checklists: { include: { items: { select: { id: true, completed: true } } } },
  mirrorOf: { select: { id: true, title: true, projectId: true } },
  _count: { select: { comments: true, attachments: true } },
};

async function assertColumnInProject(columnId, projectId) {
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, projectId },
  });
  if (!column) {
    throw new ApiError(400, "Column does not belong to this project.");
  }
  return column;
}

export const createTask = asyncHandler(async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { title, assignedToId, dueDate, columnId, description } = parsed.data;
  const { projectId } = req.params;
  const createdById = req.user.id;

  await assertColumnInProject(columnId, projectId);

  if (assignedToId) {
    const targetMembership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: assignedToId, projectId } },
    });
    if (!targetMembership) {
      throw new ApiError(400, "Assigned user is not a member of this project.");
    }
  }

  const agg = await prisma.task.aggregate({
    where: { columnId },
    _max: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      projectId,
      columnId,
      createdById,
      assignedToId: assignedToId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      position: (agg._max.position ?? -1) + 1,
    },
    include: boardTaskInclude,
  });

  await logActivity({
    projectId,
    taskId: task.id,
    actorId: createdById,
    type: "card_created",
    meta: { title },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, shapeCard(task), "Task created successfully."));
});

export const moveTask = asyncHandler(async (req, res) => {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { columnId } = parsed.data;
  const { projectId, taskId } = req.params;
  const userId = req.user.id;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  await assertColumnInProject(columnId, projectId);

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  const isAdmin = membership?.role === "ADMIN";
  const isAssigned = task.assignedToId === userId;

  if (!isAdmin && !isAssigned) {
    throw new ApiError(403, "Forbidden: You can only move tasks assigned to you.");
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { columnId },
    include: boardTaskInclude,
  });

  await logActivity({
    projectId,
    taskId,
    actorId: userId,
    type: "card_moved",
    meta: { columnId },
  });

  return res.status(200).json(new ApiResponse(200, shapeCard(updated), "Task moved."));
});

export const updateTask = asyncHandler(async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, taskId } = req.params;
  const { title, assignedToId, dueDate, columnId, description } = parsed.data;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  if (columnId) {
    await assertColumnInProject(columnId, projectId);
  }

  if (assignedToId) {
    const targetMembership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: assignedToId, projectId } },
    });
    if (!targetMembership) {
      throw new ApiError(400, "Assigned user is not a member of this project.");
    }
  }

  const data = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(assignedToId !== undefined && { assignedToId }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    ...(columnId !== undefined && { columnId }),
  };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data,
    include: cardInclude,
  });

  if (!task.mirrorOfId) {
    await syncMirrorsFromSource(taskId, data);
  }

  await logActivity({
    projectId,
    taskId,
    actorId: req.user.id,
    type: "card_updated",
    meta: { fields: Object.keys(data) },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, shapeCard(updated), "Task updated successfully."));
});

export const deleteTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  await prisma.task.delete({ where: { id: taskId } });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Task deleted successfully."));
});

export { boardTaskInclude };
