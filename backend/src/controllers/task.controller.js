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
  boardTaskInclude,
  shapeCard,
  setTaskAssignees,
  logActivity,
  syncMirrorsFromSource,
  canMutateCards,
} from "../utils/cardHelpers.js";
import { invalidateProject } from "../utils/cache.js";
import { pushTaskToGithub } from "../services/githubPush.service.js";

async function assertColumnInProject(columnId, projectId) {
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, projectId },
  });
  if (!column) {
    throw new ApiError(400, "Column does not belong to this project.");
  }
  return column;
}

async function resolveAssigneeIds(projectId, { assignedToId, assigneeIds }) {
  let ids = assigneeIds;
  if (!ids && assignedToId) ids = [assignedToId];
  if (assignedToId === null && !assigneeIds) ids = [];
  if (!ids) return null;
  for (const uid of ids) {
    const m = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: uid, projectId } },
    });
    if (!m) throw new ApiError(400, "Assigned user is not a member of this project.");
  }
  return ids;
}

export const createTask = asyncHandler(async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { title, dueDate, columnId, description, pushToGithub } = parsed.data;
  const { projectId } = req.params;
  const createdById = req.user.id;

  await assertColumnInProject(columnId, projectId);
  const assigneeIds = (await resolveAssigneeIds(projectId, parsed.data)) || [];

  const agg = await prisma.task.aggregate({
    where: { columnId },
    _max: { position: true },
  });

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title,
        description: description || null,
        projectId,
        columnId,
        createdById,
        dueDate: dueDate ? new Date(dueDate) : null,
        position: (agg._max.position ?? -1) + 1,
      },
    });
    if (assigneeIds.length) {
      await setTaskAssignees(created.id, assigneeIds, tx);
    }
    return tx.task.findUnique({
      where: { id: created.id },
      include: boardTaskInclude,
    });
  });

  await logActivity({
    projectId,
    taskId: task.id,
    actorId: createdById,
    type: "card_created",
    meta: { title },
  });

  if (pushToGithub) {
    try {
      await pushTaskToGithub(projectId, task.id, { create: true });
    } catch (err) {
      console.warn("[github push]", err.message);
    }
  }

  await invalidateProject(projectId);

  const fresh = await prisma.task.findUnique({
    where: { id: task.id },
    include: boardTaskInclude,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, shapeCard(fresh), "Task created successfully."));
});

export const moveTask = asyncHandler(async (req, res) => {
  const parsed = moveTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { columnId } = parsed.data;
  const { projectId, taskId } = req.params;
  const userId = req.user.id;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  await assertColumnInProject(columnId, projectId);

  const membership = req.membership;
  if (!canMutateCards(membership?.role)) {
    throw new ApiError(403, "Forbidden: viewers cannot move tasks.");
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

  await invalidateProject(projectId);
  return res.status(200).json(new ApiResponse(200, shapeCard(updated), "Task moved."));
});

export const updateTask = asyncHandler(async (req, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, taskId } = req.params;
  const { title, dueDate, columnId, description, pushToGithub } = parsed.data;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  if (columnId) {
    await assertColumnInProject(columnId, projectId);
  }

  const assigneeIds = await resolveAssigneeIds(projectId, parsed.data);

  const data = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    ...(columnId !== undefined && { columnId }),
  };

  const updated = await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data });
    if (assigneeIds) {
      await setTaskAssignees(taskId, assigneeIds, tx);
    }
    return tx.task.findUnique({ where: { id: taskId }, include: cardInclude });
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

  if (pushToGithub || task.externalLink) {
    try {
      await pushTaskToGithub(projectId, taskId, { create: !task.externalLink });
    } catch (err) {
      console.warn("[github push]", err.message);
    }
  }

  await invalidateProject(projectId);

  const fresh = await prisma.task.findUnique({
    where: { id: taskId },
    include: cardInclude,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, shapeCard(fresh), "Task updated successfully."));
});

export const deleteTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  await prisma.task.delete({ where: { id: taskId } });
  await invalidateProject(projectId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Task deleted successfully."));
});

export { boardTaskInclude };
