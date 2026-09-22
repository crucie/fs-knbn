import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createProjectSchema, inviteMemberSchema } from "../validations/project.validation.js";
import { createDefaultColumns } from "../db/bootstrapColumns.js";
import { shapeCard } from "../utils/cardHelpers.js";
import { boardTaskInclude } from "./task.controller.js";


const memberSelect = {
  role: true,
  user: { select: { id: true, username: true, email: true, avatarUrl: true } },
};

// POST /api/projects
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
    await createDefaultColumns(tx, project.id);
    return project;
  });

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Project created successfully."));
});

// GET /api/projects
export const getMyProjects = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        include: {
          members: { select: memberSelect },
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { select: memberSelect },
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
    myRole: membership.role,
    tasks: project.tasks.map(shapeCard),
  };

  return res
    .status(200)
    .json(new ApiResponse(200, shaped, "Project fetched successfully."));
});

// DELETE /api/projects/:projectId — Admin deletes project
export const deleteProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;

  try {
    await prisma.project.delete({ where: { id: projectId } });
  } catch (err) {
    if (err.code === "P2025") {
      throw new ApiError(404, "Project not found.");
    }
    throw err;
  }

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

  if (membership.role === "ADMIN") {
    const adminCount = await prisma.projectMember.count({
      where: { projectId, role: "ADMIN" },
    });
    if (adminCount <= 1) {
      throw new ApiError(
        400,
        "You are the only admin. Delete the project or promote another member first."
      );
    }
  }

  await prisma.projectMember.delete({
    where: { userId_projectId: { userId, projectId } },
  });

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

  const { username, email } = parsed.data;
  const { projectId } = req.params;

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
    data: { userId: targetUser.id, projectId, role: "MEMBER" },
    include: { user: { select: { id: true, username: true, email: true, avatarUrl: true } } },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, member, "Member invited successfully."));
});

// DELETE /api/projects/:projectId/members/:userId
export const removeMember = asyncHandler(async (req, res) => {
  const { projectId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  if (targetUserId === requesterId) {
    throw new ApiError(400, "Admins cannot remove themselves. Use leave project instead.");
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

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Member removed successfully."));
});
