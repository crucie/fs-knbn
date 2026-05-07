import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createProjectSchema, inviteMemberSchema } from "../validations/project.validation.js";

// POST /api/projects — Create project, auto-assign creator as ADMIN
export const createProject = asyncHandler(async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { title, description } = parsed.data;
  const userId = req.user.id;

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { title, description },
    });
    await tx.projectMember.create({
      data: { userId, projectId: project.id, role: "ADMIN" },
    });
    return project;
  });

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Project created successfully."));
});

// GET /api/projects — List only projects the user is a member of
export const getMyProjects = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          members: {
            select: { role: true, user: { select: { id: true, username: true } } },
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

  return res
    .status(200)
    .json(new ApiResponse(200, projects, "Projects fetched successfully."));
});

// GET /api/projects/:projectId — Get single project details
export const getProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!membership) {
    throw new ApiError(403, "Forbidden: You are not a member of this project.");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        select: { role: true, user: { select: { id: true, username: true } } },
      },
      tasks: {
        include: {
          assignedTo: { select: { id: true, username: true } },
          createdBy: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!project) {
    throw new ApiError(404, "Project not found.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { ...project, myRole: membership.role }, "Project fetched successfully."));
});

// POST /api/projects/:projectId/members — Admin invites a user by username
export const inviteMember = asyncHandler(async (req, res) => {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username } = parsed.data;
  const { projectId } = req.params;

  const targetUser = await prisma.user.findUnique({ where: { username } });
  if (!targetUser) {
    throw new ApiError(404, `User "${username}" not found.`);
  }

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: targetUser.id, projectId } },
  });
  if (existing) {
    throw new ApiError(409, "User is already a member of this project.");
  }

  const member = await prisma.projectMember.create({
    data: { userId: targetUser.id, projectId, role: "MEMBER" },
    include: { user: { select: { id: true, username: true } } },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, member, "Member invited successfully."));
});

// DELETE /api/projects/:projectId/members/:userId — Admin removes a member
export const removeMember = asyncHandler(async (req, res) => {
  const { projectId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  if (targetUserId === requesterId) {
    throw new ApiError(400, "Admins cannot remove themselves.");
  }

  try {
    await prisma.projectMember.delete({
      where: { userId_projectId: { userId: targetUserId, projectId } },
    });
  } catch (err) {
    // P2025 = record not found in Prisma
    if (err.code === "P2025") {
      throw new ApiError(404, "Member not found.");
    }
    throw err;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Member removed successfully."));
});
