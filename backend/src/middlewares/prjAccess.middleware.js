import prisma from "../config/prisma.js";

/**
 * Middleware: isProjectAdmin
 * Checks if the authenticated user is an ADMIN of the project in :projectId.
 * Must be used after `authenticate`.
 */
export const isProjectAdmin = async (req, res, next) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required." });
  }

  try {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!membership || membership.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Project Admin access required." });
    }

    req.membership = membership;
    next();
  } catch (err) {
    return res.status(500).json({ error: "Server error during authorization check." });
  }
};

/**
 * Middleware: isProjectMember
 * Checks if the authenticated user is at least a MEMBER of the project in :projectId.
 * Must be used after `authenticate`.
 */
export const isProjectMember = async (req, res, next) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  try {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!membership) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this project." });
    }

    req.membership = membership;
    next();
  } catch (err) {
    return res.status(500).json({ error: "Server error during authorization check." });
  }
};
