import prisma from "../config/prisma.js";
import {
  getInstallationToken,
  ghFetch,
  appConfigured,
} from "./githubApp.service.js";

/**
 * Pull issues from GitHub → update mirrored fields only.
 * Never overwrite column/position/bounty.
 */
export async function syncProjectFromGithub(projectId) {
  if (!appConfigured()) {
    return { updated: 0, message: "GitHub App not configured." };
  }
  const conn = await prisma.githubConnection.findUnique({ where: { projectId } });
  if (!conn || !conn.syncIssues) {
    return { updated: 0, message: "No GitHub connection." };
  }

  const token = await getInstallationToken(conn.installationId);
  const since = conn.lastSyncedAt
    ? `?since=${encodeURIComponent(conn.lastSyncedAt.toISOString())}&state=all&per_page=100`
    : "?state=all&per_page=100";

  const issues = await ghFetch(
    `https://api.github.com/repos/${conn.repoOwner}/${conn.repoName}/issues${since}`,
    { token }
  );

  let updated = 0;
  const flags = [];

  const linkedTasks = await prisma.task.findMany({
    where: { projectId, externalLink: { not: null } },
    include: { bounty: true },
  });

  for (const issue of issues || []) {
    if (issue.pull_request) continue;
    const task = linkedTasks.find((t) => {
      const link = t.externalLink || {};
      return (
        Number(link.externalNumber) === Number(issue.number) ||
        String(link.externalId) === String(issue.id)
      );
    });
    if (!task) continue;

    const data = {
      title: issue.title,
      description: issue.body || task.description,
      externalLink: {
        ...(task.externalLink || {}),
        provider: "github",
        type: "issue",
        externalId: String(issue.id),
        externalNumber: issue.number,
        url: issue.html_url,
        lastSyncedAt: new Date().toISOString(),
        githubState: issue.state,
      },
    };

    if (
      issue.state === "closed" &&
      task.bounty &&
      !["RELEASED", "REFUNDED"].includes(task.bounty.status)
    ) {
      data.githubClosedPending = true;
      flags.push({
        taskId: task.id,
        bountyId: task.bounty.id,
        message: `Issue was closed on GitHub but bounty is still ${task.bounty.status} — resolve?`,
      });
    } else if (issue.state === "open") {
      data.githubClosedPending = false;
    }

    await prisma.task.update({ where: { id: task.id }, data });
    updated += 1;
  }

  await prisma.githubConnection.update({
    where: { id: conn.id },
    data: { lastSyncedAt: new Date() },
  });

  return { updated, flags };
}

export function startGithubSyncCron() {
  const ms = Number(process.env.GITHUB_SYNC_INTERVAL_MS || 10 * 60 * 1000);
  setInterval(async () => {
    try {
      const conns = await prisma.githubConnection.findMany({
        where: { syncIssues: true },
        select: { projectId: true },
      });
      for (const c of conns) {
        await syncProjectFromGithub(c.projectId).catch((err) => {
          console.warn("[github sync]", c.projectId, err.message);
        });
      }
    } catch (err) {
      console.warn("[github sync cron]", err.message);
    }
  }, ms).unref?.();
  console.log(`[fs-knbn] GitHub pull sync every ${Math.round(ms / 60000)}m`);
}
