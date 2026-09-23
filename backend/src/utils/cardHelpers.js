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

const userBrief = { select: { id: true, username: true, email: true, avatarUrl: true, displayName: true } };

export const cardInclude = {
  assignees: { include: { user: userBrief } },
  createdBy: { select: { id: true, username: true, displayName: true } },
  column: { select: { id: true, name: true, color: true, position: true, isLocked: true } },
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
  bounty: {
    include: {
      funder: { select: { id: true, username: true } },
      claimant: { select: { id: true, username: true } },
    },
  },
  mirrorOf: { select: { id: true, title: true, projectId: true } },
  mirrors: { select: { id: true, title: true, projectId: true } },
  _count: { select: { comments: true, attachments: true } },
};

export const boardTaskInclude = {
  assignees: { include: { user: userBrief } },
  labels: { include: { label: true } },
  checklists: {
    include: { items: { select: { id: true, completed: true } } },
  },
  bounty: { select: { id: true, amount: true, status: true, tokenSymbol: true } },
  _count: { select: { comments: true, attachments: true } },
};

export function shapeCard(task) {
  if (!task) return task;
  const labels = (task.labels || []).map((tl) => tl.label);
  const assignees = (task.assignees || [])
    .map((a) => a.user)
    .filter(Boolean);
  const checklists = task.checklists || [];
  let checklistDone = 0;
  let checklistTotal = 0;
  for (const cl of checklists) {
    for (const item of cl.items || []) {
      checklistTotal += 1;
      if (item.completed) checklistDone += 1;
    }
  }
  const bounty = task.bounty
    ? {
        ...task.bounty,
        amount: task.bounty.amount != null ? String(task.bounty.amount) : null,
      }
    : null;
  return {
    ...task,
    labels,
    assignees,
    // legacy single-assignee shape for older UI
    assignedTo: assignees[0] || null,
    assignedToId: assignees[0]?.id || null,
    bounty,
    checklistProgress: { done: checklistDone, total: checklistTotal },
    isMirror: !!task.mirrorOfId,
  };
}

export async function setTaskAssignees(taskId, userIds, tx = prisma) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  await tx.taskAssignee.deleteMany({ where: { taskId } });
  if (ids.length) {
    await tx.taskAssignee.createMany({
      data: ids.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
  }
  // keep legacy singular field in sync
  await tx.task.update({
    where: { id: taskId },
    data: { assignedToId: ids[0] || null },
  });
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

/** Role helpers aligned with PRODUCT_SPEC */
export const ROLE = {
  OWNER: "OWNER",
  MAINTAINER: "MAINTAINER",
  CONTRIBUTOR: "CONTRIBUTOR",
  VIEWER: "VIEWER",
};

export function isOwnerRole(role) {
  return role === "OWNER" || role === "ADMIN";
}

export function isMaintainerRole(role) {
  return isOwnerRole(role) || role === "MAINTAINER";
}

export function canMutateCards(role) {
  return isMaintainerRole(role) || role === "CONTRIBUTOR" || role === "MEMBER";
}

export function canManageProject(role) {
  return isMaintainerRole(role);
}
