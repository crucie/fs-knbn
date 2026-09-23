import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { z } from "zod";
import {
  appConfigured,
  githubAppInstallUrl,
  githubAppOAuthUrl,
  exchangeGithubAppCode,
  upsertGithubIdentity,
  listInstallationRepos,
} from "../services/githubApp.service.js";
import { syncProjectFromGithub } from "../services/githubSync.service.js";
import { invalidateProject } from "../utils/cache.js";

const connectSchema = z.object({
  installationId: z.union([z.string(), z.number()]),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  code: z.string().optional(),
});

// GET /api/projects/:projectId/github/status
export const githubStatus = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const conn = await prisma.githubConnection.findUnique({ where: { projectId } });
  const identity = await prisma.githubIdentity.findUnique({
    where: { userId: req.user.id },
    select: { githubLogin: true, githubUserId: true },
  });
  return res.status(200).json(
    new ApiResponse(200, {
      configured: appConfigured(),
      connection: conn,
      identity,
      installUrl: githubAppInstallUrl({ state: projectId }),
    })
  );
});

// GET /api/projects/:projectId/github/oauth-url
export const githubOAuthUrl = asyncHandler(async (req, res) => {
  if (!appConfigured()) throw new ApiError(503, "GitHub App not configured.");
  const apiPublic = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
  const redirectUri =
    process.env.GITHUB_APP_CALLBACK_URL ||
    `${apiPublic}/api/auth/github-app/callback`;
  const url = githubAppOAuthUrl({
    state: `project:${req.params.projectId}`,
    redirectUri,
  });
  return res.status(200).json(new ApiResponse(200, { url }, "OAuth URL."));
});

// POST /api/projects/:projectId/github/connect
export const connectGithub = asyncHandler(async (req, res) => {
  if (!appConfigured()) throw new ApiError(503, "GitHub App not configured.");
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);

  const { projectId } = req.params;
  const installationId = String(parsed.data.installationId);

  if (parsed.data.code) {
    const tokens = await exchangeGithubAppCode(parsed.data.code);
    await upsertGithubIdentity(req.user.id, tokens);
  }

  // Validate repo is on the installation
  try {
    const repos = await listInstallationRepos(installationId);
    const ok = repos.some(
      (r) =>
        r.owner?.toLowerCase() === parsed.data.repoOwner.toLowerCase() &&
        r.name?.toLowerCase() === parsed.data.repoName.toLowerCase()
    );
    if (!ok && repos.length) {
      // soft warn — still allow if list fails permissions
      console.warn("[github] repo not listed on installation; connecting anyway");
    }
  } catch (err) {
    console.warn("[github] list repos:", err.message);
  }

  const conn = await prisma.githubConnection.upsert({
    where: { projectId },
    create: {
      projectId,
      installationId,
      repoOwner: parsed.data.repoOwner,
      repoName: parsed.data.repoName,
      syncIssues: true,
    },
    update: {
      installationId,
      repoOwner: parsed.data.repoOwner,
      repoName: parsed.data.repoName,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { type: "GITHUB_LINKED" },
  });

  await invalidateProject(projectId);
  return res.status(200).json(new ApiResponse(200, conn, "GitHub connected."));
});

// POST /api/projects/:projectId/github/sync
export const syncGithub = asyncHandler(async (req, res) => {
  const result = await syncProjectFromGithub(req.params.projectId);
  await invalidateProject(req.params.projectId);
  return res.status(200).json(new ApiResponse(200, result, "Sync complete."));
});

// DELETE /api/projects/:projectId/github
export const disconnectGithub = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await prisma.githubConnection.deleteMany({ where: { projectId } });
  await prisma.project.update({
    where: { id: projectId },
    data: { type: "GENERIC" },
  });
  await invalidateProject(projectId);
  return res.status(200).json(new ApiResponse(200, null, "GitHub disconnected."));
});

// POST /api/auth/github-app/identity — link GithubIdentity with code
export const linkGithubAppIdentity = asyncHandler(async (req, res) => {
  if (!appConfigured()) throw new ApiError(503, "GitHub App not configured.");
  const code = req.body?.code;
  if (!code) throw new ApiError(400, "code is required.");
  const tokens = await exchangeGithubAppCode(code);
  const identity = await upsertGithubIdentity(req.user.id, tokens);
  return res.status(200).json(
    new ApiResponse(
      200,
      { githubLogin: identity.githubLogin, githubUserId: identity.githubUserId },
      "GitHub App identity linked."
    )
  );
});
