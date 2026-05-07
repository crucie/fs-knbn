import prisma from "../config/prisma.js";
import { createTaskSchema, updateTaskStatusSchema } from "../validations/task.validation.js";

// POST /projects/:projectId/tasks — Admin creates a task
export const createTask = async (req, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { title, assignedToId, dueDate } = parsed.data;
  const { projectId } = req.params;
  const createdById = req.user.id;

  try {
    // If assigning to someone, verify they are a project member
    if (assignedToId) {
      const targetMembership = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: assignedToId, projectId } },
      });
      if (!targetMembership) {
        return res.status(400).json({ error: "Assigned user is not a member of this project." });
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

    return res.status(201).json(task);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create task." });
  }
};

// PATCH /projects/:projectId/tasks/:taskId/status — Update task status
// Admins can update any task; Members can only update their own assigned tasks
export const updateTaskStatus = async (req, res) => {
  const parsed = updateTaskStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { status } = parsed.data;
  const { projectId, taskId } = req.params;
  const userId = req.user.id;

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: "Task not found." });
    }

    // Check membership role
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    const isAdmin = membership?.role === "ADMIN";
    const isAssigned = task.assignedToId === userId;

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ error: "Forbidden: You can only update tasks assigned to you." });
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: {
        assignedTo: { select: { id: true, username: true } },
        createdBy: { select: { id: true, username: true } },
      },
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update task status." });
  }
};

// PATCH /projects/:projectId/tasks/:taskId — Admin updates task details
export const updateTask = async (req, res) => {
  const { projectId, taskId } = req.params;
  const { title, assignedToId, dueDate } = req.body;

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: "Task not found." });
    }

    if (assignedToId) {
      const targetMembership = await prisma.projectMember.findUnique({
        where: { userId_projectId: { userId: assignedToId, projectId } },
      });
      if (!targetMembership) {
        return res.status(400).json({ error: "Assigned user is not a member of this project." });
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

    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update task." });
  }
};

// DELETE /projects/:projectId/tasks/:taskId — Admin deletes a task
export const deleteTask = async (req, res) => {
  const { projectId, taskId } = req.params;

  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: "Task not found." });
    }

    await prisma.task.delete({ where: { id: taskId } });
    return res.status(200).json({ message: "Task deleted." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete task." });
  }
};
