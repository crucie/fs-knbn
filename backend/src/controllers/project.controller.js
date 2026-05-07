import prisma from "../config/prisma.js";
import { createProjectSchema, inviteMemberSchema } from "../validations/project.validation.js";

// POST /projects — Create project, auto-assign creator as ADMIN
export const createProject = async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { title, description } = parsed.data;
  const userId = req.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { title, description },
      });
      await tx.projectMember.create({
        data: { userId, projectId: project.id, role: "ADMIN" },
      });
      return project;
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create project." });
  }
};

// GET /projects — List only projects the user is a member of
export const getMyProjects = async (req, res) => {
  const userId = req.user.id;

  try {
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

    return res.status(200).json(projects);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch projects." });
  }
};

// GET /projects/:projectId — Get single project details
export const getProject = async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  try {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!membership) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this project." });
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

    if (!project) return res.status(404).json({ error: "Project not found." });

    return res.status(200).json({ ...project, myRole: membership.role });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch project." });
  }
};

// POST /projects/:projectId/members — Admin invites a user by username
export const inviteMember = async (req, res) => {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { username } = parsed.data;
  const { projectId } = req.params;

  try {
    const targetUser = await prisma.user.findUnique({ where: { username } });
    if (!targetUser) {
      return res.status(404).json({ error: `User "${username}" not found.` });
    }

    const existing = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: targetUser.id, projectId } },
    });
    if (existing) {
      return res.status(409).json({ error: "User is already a member of this project." });
    }

    const member = await prisma.projectMember.create({
      data: { userId: targetUser.id, projectId, role: "MEMBER" },
      include: { user: { select: { id: true, username: true } } },
    });

    return res.status(201).json(member);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to invite member." });
  }
};

// DELETE /projects/:projectId/members/:userId — Admin removes a member
export const removeMember = async (req, res) => {
  const { projectId, userId: targetUserId } = req.params;
  const requesterId = req.user.id;

  if (targetUserId === requesterId) {
    return res.status(400).json({ error: "Admins cannot remove themselves." });
  }

  try {
    await prisma.projectMember.delete({
      where: { userId_projectId: { userId: targetUserId, projectId } },
    });
    return res.status(200).json({ message: "Member removed." });
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Member not found." });
    }
    return res.status(500).json({ error: "Failed to remove member." });
  }
};
