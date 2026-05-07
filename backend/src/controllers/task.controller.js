import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createTaskSchema, updateTaskStatusSchema } from "../validations/task.validation.js";

// POST /api/projects/:projectId/tasks — Admin creates a task
export const createTask = asyncHandler(async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { title, assignedToId, dueDate } = parsed.data;
  const { projectId } = req.params;
  const createdById = req.user.id;

  // If assigning to someone, verify they are a project member
  if (assignedToId) {
    const targetMembership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: assignedToId, projectId } },
    });
    if (!targetMembership) {
      throw new ApiError(400, "Assigned user is not a member of this project.");
    }
  }

  const task = await prisma.task.create({
    data: {
      title,
      projectId,
      createdById,
      assignedToId: assignedToId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
    include: {
      assignedTo: { select: { id: true, username: true } },
      createdBy: { select: { id: true, username: true } },
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, task, "Task created successfully."));
});

// PATCH /api/projects/:projectId/tasks/:taskId/status — Update task status
// Admins can update any task; Members can only update their own assigned tasks
export const updateTaskStatus = asyncHandler(async (req, res) => {
  const parsed = updateTaskStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { status } = parsed.data;
  const { projectId, taskId } = req.params;
  const userId = req.user.id;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });

  const isAdmin = membership?.role === "ADMIN";
  const isAssigned = task.assignedToId === userId;

  if (!isAdmin && !isAssigned) {
    throw new ApiError(403, "Forbidden: You can only update tasks assigned to you.");
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { status },
    include: {
      assignedTo: { select: { id: true, username: true } },
      createdBy: { select: { id: true, username: true } },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Task status updated."));
});

// PATCH /api/projects/:projectId/tasks/:taskId — Admin updates task details
export const updateTask = asyncHandler(async (req, res) => {
  const { projectId, taskId } = req.params;
  const { title, assignedToId, dueDate } = req.body;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.projectId !== projectId) {
    throw new ApiError(404, "Task not found.");
  }

  if (assignedToId) {
    const targetMembership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: assignedToId, projectId } },
    });
    if (!targetMembership) {
      throw new ApiError(400, "Assigned user is not a member of this project.");
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title && { title }),
      ...(assignedToId !== undefined && { assignedToId }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    },
    include: {
      assignedTo: { select: { id: true, username: true } },
      createdBy: { select: { id: true, username: true } },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Task updated successfully."));
});

// DELETE /api/projects/:projectId/tasks/:taskId — Admin deletes a task
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
