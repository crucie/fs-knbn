import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createProjectSchema, inviteMemberSchema, updateMemberRoleSchema } from "../validations/project.validation.js";
import { createDefaultColumns } from "../db/bootstrapColumns.js";
import { shapeCard, isOwnerRole } from "../utils/cardHelpers.js";
import { boardTaskInclude } from "./task.controller.js";
import { ensurePersonalWorkspace } from "./workspace.controller.js";
import {
  cacheGet,
  cacheSet,
  cacheKeys,
  invalidateProject,
  invalidateUserProjects,
} from "../utils/cache.js";

const memberSelect = {
  role: true,
  user: { select: { id: true, username: true, email: true, avatarUrl: true, displayName: true } },
};

async function projectMemberIds(projectId) {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// POST /api/projects
export const createProject = asyncHandler(async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { title, description, workspaceId } = parsed.data;
  const userId = req.user.id;

  let wsId = workspaceId;
  if (wsId) {
    const ws = await prisma.workspace.findUnique({ where: { id: wsId } });
    if (!ws) throw new ApiError(404, "Workspace not found.");
    const allowed =
      ws.ownerId === userId ||
      (await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: wsId } },
      }));
    if (!allowed) throw new ApiError(403, "Forbidden: not a workspace member.");
  } else {
    const personal = await ensurePersonalWorkspace(userId);
    wsId = personal.id;
  }

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        title,
        description,
        workspaceId: wsId,
        createdById: userId,
        type: "GENERIC",
      },
    });
    await tx.projectMember.create({
      data: { userId, projectId: project.id, role: "OWNER" },
    });
    await createDefaultColumns(tx, project.id);
    return project;
  });

  await invalidateUserProjects(userId);

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Project created successfully."));
});

// GET /api/projects
export const getMyProjects = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ck = cacheKeys.userProjects(userId);
  const cached = await cacheGet(ck);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res
      .status(200)
      .json(new ApiResponse(200, cached, "Projects fetched successfully."));
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          members: { select: memberSelect },
          workspace: { select: { id: true, name: true } },
          githubConnection: {
            select: { id: true, repoOwner: true, repoName: true, lastSyncedAt: true },
          },
          _count: { select: { tasks: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const projects = memberships.map((m) => ({
    ...m.project,
    myRole: m.role,
  }));

  await cacheSet(ck, projects, 30);
  res.setHeader("X-Cache", "MISS");

  return res
    .status(200)
    .json(new ApiResponse(200, projects, "Projects fetched successfully."));
});

// GET /api/projects/:projectId
export const getProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!membership) {
    throw new ApiError(403, "Forbidden: You are not a member of this project.");
  }

  const ck = cacheKeys.project(projectId);
  const cached = await cacheGet(ck);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(
      new ApiResponse(
        200,
        { ...cached, myRole: membership.role },
        "Project fetched successfully."
      )
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { select: memberSelect },
      workspace: { select: { id: true, name: true } },
      githubConnection: true,
      columns: { orderBy: { position: "asc" } },
      labels: { orderBy: { name: "asc" } },
      customFields: { orderBy: { position: "asc" } },
      tasks: {
        include: boardTaskInclude,
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!project) {
    throw new ApiError(404, "Project not found.");
  }

  const shaped = {
    ...project,
    tasks: project.tasks.map(shapeCard),
  };

  await cacheSet(ck, shaped, 20);
  res.setHeader("X-Cache", "MISS");

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...shaped, myRole: membership.role },
      "Project fetched successfully."
    )
  );
});

// DELETE /api/projects/:projectId — Admin deletes project
export const deleteProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const memberIds = await projectMemberIds(projectId);

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (err) {
    if (err.code === "P2025") {
      throw new ApiError(404, "Project not found.");
    }
    throw err;
  }

  await invalidateProject(projectId, memberIds);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Project deleted successfully."));
});

// POST /api/projects/:projectId/leave — Member leaves (admins must transfer or delete)
export const leaveProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!membership) {
    throw new ApiError(404, "You are not a member of this project.");
  }

  if (isOwnerRole(membership.role)) {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: { in: ["OWNER", "ADMIN"] } },
    });
    if (ownerCount <= 1) {
      throw new ApiError(
        400,
        "You are the only owner. Delete the project or promote another member first."
      );
    }
  }

  await prisma.projectMember.delete({
    where: { userId_projectId: { userId, projectId } },
  });

  await invalidateProject(projectId, [userId]);
  await invalidateUserProjects(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Left project successfully."));
});

// POST /api/projects/:projectId/members — Invite by username or email
export const inviteMember = asyncHandler(async (req, res) => {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username, email, role: inviteRole } = parsed.data;
  const { projectId } = req.params;
  const role = inviteRole && inviteRole !== "OWNER" ? inviteRole : "CONTRIBUTOR";

  let targetUser = null;
  if (email) {
    targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!targetUser) {
      throw new ApiError(404, `User with email "${email}" not found.`);
    }
  } else {
    const handle = (username || "").replace(/^@+/, "");
    targetUser = await prisma.user.findUnique({ where: { username: handle } });
    if (!targetUser) {
      throw new ApiError(404, `User "@${handle}" not found.`);
    }
  }

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: targetUser.id, projectId } },
  });
  if (existing) {
    throw new ApiError(409, "User is already a member of this project.");
  }

  const member = await prisma.projectMember.create({
    data: { userId: targetUser.id, projectId, role },
    include: { user: { select: { id: true, username: true, email: true, avatarUrl: true } } },
  });

  const memberIds = await projectMemberIds(projectId);
  await invalidateProject(projectId, memberIds);

  return res
    .status(201)
    .json(new ApiResponse(201, member, "Member invited successfully."));
});

// PATCH /api/projects/:projectId/members/:userId — Update member role
export const updateMemberRole = asyncHandler(async (req, res) => {
  const parsed = updateMemberRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, userId: targetUserId } = req.params;
  const { role } = parsed.data;
  const requesterId = req.user.id;

  if (targetUserId === requesterId) {
    throw new ApiError(400, "You cannot change your own role.");
  }

  const target = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: targetUserId, projectId } },
  });
  if (!target) {
    throw new ApiError(404, "Member not found.");
  }

  if (isOwnerRole(target.role) && !isOwnerRole(role)) {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: { in: ["OWNER", "ADMIN"] } },
    });
    if (ownerCount <= 1) {
      throw new ApiError(400, "Cannot demote the last owner.");
    }
  }

  const member = await prisma.projectMember.update({
    where: { userId_projectId: { userId: targetUserId, projectId } },
    data: { role },
    select: memberSelect,
  });

  const memberIds = await projectMemberIds(projectId);
  await invalidateProject(projectId, memberIds);

  return res
    .status(200)
    .json(new ApiResponse(200, member, "Member role updated."));
});

// DELETE /api/projects/:projectId/members/:userId
export const removeMember = asyncHandler(async (req, res) => {
  const { projectId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  if (targetUserId === requesterId) {
    throw new ApiError(400, "Owners cannot remove themselves. Use leave project instead.");
  }

  try {
    await prisma.projectMember.delete({
      where: { userId_projectId: { userId: targetUserId, projectId } },
    });
  } catch (err) {
    if (err.code === "P2025") {
      throw new ApiError(404, "Member not found.");
    }
    throw err;
  }

  const memberIds = await projectMemberIds(projectId);
  await invalidateProject(projectId, [...memberIds, targetUserId]);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Member removed successfully."));
});
