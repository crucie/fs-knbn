import crypto from "crypto";
import prisma from "../config/prisma.js";
import { encryptToken, decryptToken } from "../utils/tokenCrypto.js";

function appConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_APP_CLIENT_ID &&
      process.env.GITHUB_APP_CLIENT_SECRET
  );
}

/** Minimal JWT for GitHub App authentication (RS256). */
function appJwt() {
  const appId = process.env.GITHUB_APP_ID;
  let pem = process.env.GITHUB_APP_PRIVATE_KEY || "";
  pem = pem.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId })
  ).toString("base64url");
  const data = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  const sig = sign.sign(pem, "base64url");
  return `${data}.${sig}`;
}

async function ghFetch(url, { token, method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "fs-knbn",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || `GitHub API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export async function getInstallationToken(installationId) {
  if (!appConfigured()) {
    throw new Error("GitHub App is not configured on the server.");
  }
  const jwt = appJwt();
  const data = await ghFetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    { token: jwt, method: "POST", body: {} }
  );
  return data.token;
}

export function githubAppOAuthUrl({ state, redirectUri }) {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export function githubAppInstallUrl({ state }) {
  const base =
    process.env.GITHUB_APP_INSTALL_URL ||
    (process.env.GITHUB_APP_SLUG
      ? `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new`
      : null);
  if (!base) return null;
  const u = new URL(base);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeGithubAppCode(code) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_APP_CLIENT_ID,
      client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
      code,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth failed.");
  }
  return data;
}

export async function upsertGithubIdentity(userId, tokenPayload) {
  const me = await ghFetch("https://api.github.com/user", {
    token: tokenPayload.access_token,
  });
  const enc = encryptToken(tokenPayload.access_token);
  const refreshEnc = tokenPayload.refresh_token
    ? encryptToken(tokenPayload.refresh_token)
    : null;
  const expires = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000)
    : null;

  return prisma.githubIdentity.upsert({
    where: { userId },
    create: {
      userId,
      githubUserId: String(me.id),
      githubLogin: me.login,
      accessTokenEnc: enc,
      refreshTokenEnc: refreshEnc,
      tokenExpiresAt: expires,
    },
    update: {
      githubUserId: String(me.id),
      githubLogin: me.login,
      accessTokenEnc: enc,
      refreshTokenEnc: refreshEnc || undefined,
      tokenExpiresAt: expires,
    },
  });
}

export async function getUserGithubToken(userId) {
  const identity = await prisma.githubIdentity.findUnique({ where: { userId } });
  if (!identity) return null;
  return decryptToken(identity.accessTokenEnc);
}

export async function listInstallationRepos(installationId) {
  const token = await getInstallationToken(installationId);
  const data = await ghFetch(
    "https://api.github.com/installation/repositories?per_page=100",
    { token }
  );
  return (data.repositories || []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    owner: r.owner?.login,
    name: r.name,
    private: r.private,
  }));
}

export { appConfigured, ghFetch };
