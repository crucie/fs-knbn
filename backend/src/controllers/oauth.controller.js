import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import prisma from "../config/prisma.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    usernameSet: user.usernameSet !== false,
    googleConnected: !!user.googleId,
    githubConnected: !!user.githubId,
    githubUsername: user.githubUsername ?? null,
  };
}

function authPayload(user) {
  const token = signToken({ id: user.id, username: user.username });
  return { token, user: publicUser(user) };
}

function frontendRedirect(path, params = {}) {
  const url = new URL(path, FRONTEND_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function signOAuthState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });
}

function readOAuthState(state) {
  try {
    return verifyToken(state);
  } catch {
    throw new ApiError(400, "Invalid or expired OAuth state.");
  }
}

async function tempUsernameFromHandle(handle, prefix) {
  const base = String(handle || "user")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 18) || "user";
  let candidate = `${prefix}_${base}`.slice(0, 30);
  let n = 0;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `${prefix}_${base}_${n}`.slice(0, 30);
  }
  return candidate;
}

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function githubConfigured() {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}


function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function googleCallbackUrl() {
  return (
    process.env.GOOGLE_CALLBACK_URL ||
    `${API_PUBLIC_URL}/api/auth/google/callback`
  );
}

export const oauthStatus = asyncHandler(async (_req, res) => {
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        github: githubConfigured(),
        google: googleConfigured(),
      },
      "OK"
    )
  );
});

async function upsertGoogleUser({ googleId, email, avatarUrl }) {
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId }, ...(email ? [{ email }] : [])],
    },
  });

  if (user) {
    return prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: user.googleId || googleId,
        email: user.email || email,
        avatarUrl: avatarUrl || user.avatarUrl,
      },
    });
  }

  const username = await tempUsernameFromHandle(
    (email || "user").split("@")[0],
    "g"
  );
  return prisma.user.create({
    data: {
      username,
      email,
      googleId,
      avatarUrl,
      usernameSet: false,
    },
  });
}

// GET /api/auth/google/url?mode=login|link
export const googleAuthUrl = asyncHandler(async (req, res) => {
  if (!googleConfigured()) {
    throw new ApiError(503, "Google OAuth is not configured (need CLIENT_ID + CLIENT_SECRET).");
  }
  const mode =
    req.oauthMode === "link" || req.query.mode === "link" ? "link" : "login";
  if (mode === "link" && !req.user?.id) {
    throw new ApiError(401, "Login required to connect Google.");
  }

  const state = signOAuthState({
    provider: "google",
    mode,
    userId: mode === "link" ? req.user.id : undefined,
  });

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl()
  );
  const url = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  return res.status(200).json(new ApiResponse(200, { url, mode }, "OK"));
});

export const googleCallback = asyncHandler(async (req, res) => {
  if (!googleConfigured()) {
    return res.redirect(frontendRedirect("/login", { error: "Google is not configured." }));
  }
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(frontendRedirect("/login", { error: String(error) }));
  }
  if (!code || !state) {
    return res.redirect(frontendRedirect("/login", { error: "Google auth cancelled." }));
  }

  let stateData;
  try {
    stateData = readOAuthState(String(state));
  } catch {
    return res.redirect(frontendRedirect("/login", { error: "Expired Google session." }));
  }

  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      googleCallbackUrl()
    );
    const { tokens } = await client.getToken(String(code));
    if (!tokens.id_token) {
      return res.redirect(frontendRedirect("/login", { error: "Google token exchange failed." }));
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return res.redirect(
        frontendRedirect("/login", { error: "Google account missing profile fields." })
      );
    }

    const googleId = payload.sub;
    const email = String(payload.email).toLowerCase();
    const avatarUrl = payload.picture || null;

    if (stateData.mode === "link") {
      if (!stateData.userId) {
        return res.redirect(
          frontendRedirect("/profile", { error: "Link session expired. Try again." })
        );
      }
      const taken = await prisma.user.findFirst({
        where: { googleId, NOT: { id: stateData.userId } },
      });
      if (taken) {
        const orphan =
          taken.usernameSet === false &&
          !taken.password &&
          !taken.githubId;
        if (orphan) {
          await prisma.user.delete({ where: { id: taken.id } }).catch(() => {});
        } else {
          return res.redirect(
            frontendRedirect("/profile", {
              error: "Google already linked to another account.",
            })
          );
        }
      }
      const emailTaken = await prisma.user.findFirst({
        where: { email, NOT: { id: stateData.userId } },
      });
      const updated = await prisma.user.update({
        where: { id: stateData.userId },
        data: {
          googleId,
          avatarUrl: avatarUrl || undefined,
          ...(!emailTaken ? { email } : {}),
        },
      });
      const { token } = authPayload(updated);
      return res.redirect(frontendRedirect("/profile", { linked: "google", token }));
    }

    const user = await upsertGoogleUser({ googleId, email, avatarUrl });
    const { token } = authPayload(user);
    return res.redirect(
      frontendRedirect("/auth/callback", {
        token,
        setup: user.usernameSet === false ? "1" : "0",
      })
    );
  } catch (err) {
    console.error("[google oauth]", err);
    return res.redirect(frontendRedirect("/login", { error: "Google sign-in failed." }));
  }
});

// GET /api/auth/github/url?mode=login|link  (or req.oauthMode = "link")
export const githubAuthUrl = asyncHandler(async (req, res) => {
  if (!githubConfigured()) {
    throw new ApiError(503, "GitHub OAuth is not configured.");
  }
  const mode =
    req.oauthMode === "link" || req.query.mode === "link" ? "link" : "login";
  if (mode === "link" && !req.user?.id) {
    throw new ApiError(401, "Login required to connect GitHub.");
  }

  const state = signOAuthState({
    provider: "github",
    mode,
    userId: mode === "link" ? req.user.id : undefined,
  });
  const callback =
    process.env.GITHUB_CALLBACK_URL || `${API_PUBLIC_URL}/api/auth/github/callback`;
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);

  return res.status(200).json(new ApiResponse(200, { url: url.toString(), mode }, "OK"));
});

export const githubCallback = asyncHandler(async (req, res) => {
  if (!githubConfigured()) {
    return res.redirect(frontendRedirect("/login", { error: "GitHub is not configured." }));
  }
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(frontendRedirect("/login", { error: String(error) }));
  }
  if (!code || !state) {
    return res.redirect(frontendRedirect("/login", { error: "GitHub auth cancelled." }));
  }

  let stateData;
  try {
    stateData = readOAuthState(String(state));
  } catch {
    return res.redirect(frontendRedirect("/login", { error: "Expired GitHub session." }));
  }

  const callback =
    process.env.GITHUB_CALLBACK_URL || `${API_PUBLIC_URL}/api/auth/github/callback`;

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callback,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    return res.redirect(frontendRedirect("/login", { error: "GitHub token exchange failed." }));
  }

  const ghRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "fs-knbn",
    },
  });
  const gh = await ghRes.json();
  if (!gh?.id) {
    return res.redirect(frontendRedirect("/login", { error: "Could not read GitHub profile." }));
  }

  const githubId = String(gh.id);
  const githubUsername = gh.login || null;
  const avatarUrl = gh.avatar_url || null;
  let email = gh.email ? String(gh.email).toLowerCase() : null;
  if (!email) {
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "fs-knbn",
        },
      });
      const emails = await emailsRes.json();
      if (Array.isArray(emails)) {
        const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (primary?.email) email = String(primary.email).toLowerCase();
      }
    } catch {
      /* optional */
    }
  }

  try {
    if (stateData.mode === "link") {
      if (!stateData.userId) {
        return res.redirect(frontendRedirect("/profile", { error: "Link session expired. Try again." }));
      }
      const taken = await prisma.user.findFirst({
        where: { githubId, NOT: { id: stateData.userId } },
      });
      if (taken) {
        // Orphan from a previous mistaken "login" connect — merge into current user
        const orphan =
          taken.usernameSet === false &&
          !taken.password &&
          !taken.googleId;
        if (orphan) {
          await prisma.user.update({
            where: { id: taken.id },
            data: { githubId: null, githubUsername: null, email: null },
          });
          await prisma.user.delete({ where: { id: taken.id } }).catch(() => {});
        } else {
          return res.redirect(
            frontendRedirect("/profile", { error: "GitHub already linked to another account." })
          );
        }
      }
      const emailTaken =
        email &&
        (await prisma.user.findFirst({
          where: { email, NOT: { id: stateData.userId } },
        }));
      const updated = await prisma.user.update({
        where: { id: stateData.userId },
        data: {
          githubId,
          githubUsername,
          avatarUrl: avatarUrl || undefined,
          ...(!emailTaken && email ? { email } : {}),
        },
      });
      const { token } = authPayload(updated);
      return res.redirect(
        frontendRedirect("/profile", { linked: "github", token })
      );
    }

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ githubId }, ...(email ? [{ email }] : [])],
      },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId,
          githubUsername,
          avatarUrl: avatarUrl || user.avatarUrl,
          email: user.email || email,
          // never flip an existing account back to unset username
        },
      });
    } else {
      const username = await tempUsernameFromHandle(githubUsername, "gh");
      user = await prisma.user.create({
        data: {
          username,
          githubId,
          githubUsername,
          email,
          avatarUrl,
          usernameSet: false,
        },
      });
    }

    const { token } = authPayload(user);
    return res.redirect(
      frontendRedirect("/auth/callback", {
        token,
        setup: user.usernameSet === false ? "1" : "0",
      })
    );
  } catch (err) {
    console.error("[github oauth]", err);
    return res.redirect(frontendRedirect("/login", { error: "GitHub sign-in failed." }));
  }
});

export const unlinkGithub = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.githubId) {
    throw new ApiError(400, "GitHub is not connected.");
  }
  if (!user.password && !user.googleId) {
    throw new ApiError(400, "Connect another login method before unlinking GitHub.");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { githubId: null, githubUsername: null },
  });
  return res.status(200).json(new ApiResponse(200, publicUser(updated), "GitHub disconnected."));
});

export { publicUser, authPayload };
