import prisma from "../config/prisma.js";

export async function logActivity({ projectId, taskId, actorId, type, meta }) {
  try {
    await prisma.activity.create({
      data: {
        projectId,
        taskId: taskId || null,
        actorId,
        type,
        meta: meta ?? undefined,
      },
    });
  } catch (err) {
    console.error("[activity]", err.message);
  }
}

export const cardInclude = {
  assignedTo: { select: { id: true, username: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, username: true } },
  column: { select: { id: true, name: true, color: true, position: true } },
  labels: { include: { label: true } },
  checklists: {
    orderBy: { position: "asc" },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          assignedTo: { select: { id: true, username: true } },
        },
      },
    },
  },
  comments: {
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true } } },
  },
  attachments: {
    orderBy: { createdAt: "desc" },
    include: { uploader: { select: { id: true, username: true } } },
  },
  customFieldValues: { include: { field: true } },
  mirrorOf: { select: { id: true, title: true, projectId: true } },
  mirrors: { select: { id: true, title: true, projectId: true } },
  _count: { select: { comments: true, attachments: true } },
};

export function shapeCard(task) {
  if (!task) return task;
  const labels = (task.labels || []).map((tl) => tl.label);
  const checklists = task.checklists || [];
  let checklistDone = 0;
  let checklistTotal = 0;
  for (const cl of checklists) {
    for (const item of cl.items || []) {
      checklistTotal += 1;
      if (item.completed) checklistDone += 1;
    }
  }
  return {
    ...task,
    labels,
    checklistProgress: { done: checklistDone, total: checklistTotal },
    isMirror: !!task.mirrorOfId,
  };
}

export async function syncMirrorsFromSource(sourceTaskId, data) {
  const mirrors = await prisma.task.findMany({ where: { mirrorOfId: sourceTaskId } });
  if (!mirrors.length) return;
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.dueDate !== undefined) payload.dueDate = data.dueDate;
  if (Object.keys(payload).length === 0) return;
  await prisma.task.updateMany({
    where: { mirrorOfId: sourceTaskId },
    data: payload,
  });
}
