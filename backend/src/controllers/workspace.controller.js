import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createWorkspaceSchema } from "../validations/project.validation.js";

/** Ensure user has a personal workspace; return it. */
export async function ensurePersonalWorkspace(userId) {
  let ws = await prisma.workspace.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });
  if (!ws) {
    ws = await prisma.workspace.create({
      data: {
        name: "Personal",
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
  }
  return ws;
}

// GET /api/workspaces
export const listWorkspaces = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await ensurePersonalWorkspace(userId);

  const owned = await prisma.workspace.findMany({
    where: { ownerId: userId },
    include: {
      _count: { select: { projects: true, members: true } },
      members: {
        where: { userId },
        select: { role: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const memberOf = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { ownerId: { not: userId } } },
    include: {
      workspace: {
        include: {
          _count: { select: { projects: true, members: true } },
        },
      },
    },
  });

  const list = [
    ...owned.map((w) => ({
      ...w,
      myRole: w.members[0]?.role || "OWNER",
      members: undefined,
    })),
    ...memberOf.map((m) => ({
      ...m.workspace,
      myRole: m.role,
    })),
  ];

  return res.status(200).json(new ApiResponse(200, list, "Workspaces fetched."));
});

// POST /api/workspaces
export const createWorkspace = asyncHandler(async (req, res) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const ws = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      ownerId: req.user.id,
      members: { create: { userId: req.user.id, role: "OWNER" } },
    },
    include: { _count: { select: { projects: true, members: true } } },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, { ...ws, myRole: "OWNER" }, "Workspace created."));
});

// GET /api/workspaces/:workspaceId/projects
export const listWorkspaceProjects = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.id;

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new ApiError(404, "Workspace not found.");

  const isOwner = ws.ownerId === userId;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!isOwner && !membership) {
    throw new ApiError(403, "Forbidden: not a workspace member.");
  }

  const projects = await prisma.project.findMany({
    where: {
      workspaceId,
      members: { some: { userId } },
    },
    include: {
      members: {
        select: {
          role: true,
          user: { select: { id: true, username: true, email: true, avatarUrl: true } },
        },
      },
      _count: { select: { tasks: true } },
      githubConnection: { select: { id: true, repoOwner: true, repoName: true, lastSyncedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const shaped = projects.map((p) => {
    const mine = p.members.find((m) => m.user.id === userId);
    return { ...p, myRole: mine?.role || null };
  });

  return res.status(200).json(new ApiResponse(200, shaped, "Projects fetched."));
});
