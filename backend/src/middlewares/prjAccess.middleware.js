import prisma from "../config/prisma.js";
import { isOwnerRole, isMaintainerRole, canMutateCards } from "../utils/cardHelpers.js";

async function loadMembership(req) {
  const { projectId } = req.params;
  const userId = req.user.id;
  if (!projectId) {
    return { error: { status: 400, message: "Project ID is required." } };
  }
  try {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });
    if (!membership) {
      return { error: { status: 403, message: "Forbidden: You are not a member of this project." } };
    }
    return { membership };
  } catch {
    return { error: { status: 500, message: "Server error during authorization check." } };
  }
}

/** OWNER only (also accepts legacy ADMIN during transition). */
export const isProjectOwner = async (req, res, next) => {
  const { membership, error } = await loadMembership(req);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!isOwnerRole(membership.role)) {
    return res.status(403).json({ error: "Forbidden: Project owner access required." });
  }
  req.membership = membership;
  next();
};

/** @deprecated alias — prefer isProjectOwner */
export const isProjectAdmin = isProjectOwner;

/** OWNER or MAINTAINER */
export const isProjectMaintainer = async (req, res, next) => {
  const { membership, error } = await loadMembership(req);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!isMaintainerRole(membership.role)) {
    return res.status(403).json({ error: "Forbidden: Maintainer access required." });
  }
  req.membership = membership;
  next();
};

/** Any member including VIEWER (read). */
export const isProjectMember = async (req, res, next) => {
  const { membership, error } = await loadMembership(req);
  if (error) return res.status(error.status).json({ error: error.message });
  req.membership = membership;
  next();
};

/** Contributor+ (not VIEWER) — create/edit/move cards, comment, claim. */
export const canEditCards = async (req, res, next) => {
  const { membership, error } = await loadMembership(req);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!canMutateCards(membership.role)) {
    return res.status(403).json({ error: "Forbidden: Contributors and above can edit cards." });
  }
  req.membership = membership;
  next();
};
