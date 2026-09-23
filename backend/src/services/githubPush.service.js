import prisma from "../config/prisma.js";
import {
  getInstallationToken,
  getUserGithubToken,
  ghFetch,
  appConfigured,
} from "./githubApp.service.js";

async function connectionFor(projectId) {
  return prisma.githubConnection.findUnique({ where: { projectId } });
}

async function assigneeLogins(taskId) {
  const rows = await prisma.taskAssignee.findMany({
    where: { taskId },
    include: {
      user: { include: { githubIdentity: true } },
    },
  });
  return rows
    .map((r) => r.user?.githubIdentity?.githubLogin || r.user?.githubUsername)
    .filter(Boolean);
}

/**
 * Push card create/update to GitHub Issues (app → GitHub).
 */
export async function pushTaskToGithub(projectId, taskId, { create = false } = {}) {
  if (!appConfigured()) return null;
  const conn = await connectionFor(projectId);
  if (!conn || !conn.syncIssues) return null;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: { include: { user: true } } },
  });
  if (!task) return null;

  const token = await getInstallationToken(conn.installationId);
  const assignees = await assigneeLogins(taskId);
  const link = task.externalLink || null;

  if (create || !link?.externalNumber) {
    const issue = await ghFetch(
      `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues`,
      {
        token,
        method: "POST",
        body: {
          title: task.title,
          body: task.description || "",
          assignees: assignees.slice(0, 10),
        },
      }
    );
    const externalLink = {
      provider: "github",
      type: "issue",
      externalId: String(issue.id),
      externalNumber: issue.number,
      url: issue.html_url,
      lastSyncedAt: new Date().toISOString(),
    };
    await prisma.task.update({
      where: { id: taskId },
      data: { externalLink },
    });
    return externalLink;
  }

  await ghFetch(
    `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues/${link.externalNumber}`,
    {
      token,
      method: "PATCH",
      body: {
        title: task.title,
        body: task.description || "",
        assignees: assignees.slice(0, 10),
      },
    }
  );
  const externalLink = {
    ...link,
    lastSyncedAt: new Date().toISOString(),
  };
  await prisma.task.update({
    where: { id: taskId },
    data: { externalLink },
  });
  return externalLink;
}

export async function pushCommentToGithub(projectId, taskId, body, actorUserId) {
  if (!appConfigured()) return null;
  const conn = await connectionFor(projectId);
  if (!conn) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const num = task?.externalLink?.externalNumber;
  if (!num) return null;

  let token = await getUserGithubToken(actorUserId);
  if (!token) token = await getInstallationToken(conn.installationId);

  return ghFetch(
    `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues/${num}/comments`,
    { token, method: "POST", body: { body } }
  );
}

export async function closeGithubIssue(projectId, taskId, botNote) {
  if (!appConfigured()) return null;
  const conn = await connectionFor(projectId);
  if (!conn) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  const num = task?.externalLink?.externalNumber;
  if (!num) return null;
  const token = await getInstallationToken(conn.installationId);
  await ghFetch(
    `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues/${num}`,
    { token, method: "PATCH", body: { state: "closed" } }
  );
  if (botNote) {
    await ghFetch(
      `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues/${num}/comments`,
      { token, method: "POST", body: { body: botNote } }
    );
  }
  return true;
}

export async function setGithubAssignees(projectId, taskId) {
  return pushTaskToGithub(projectId, taskId, { create: false });
}
