import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import prisma from "../config/prisma.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import {
  signupSchema,
  loginSchema,
  googleAuthSchema,
  usernameSchema,
} from "../validations/auth.validation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    avatarUrl: user.avatarUrl ?? null,
    walletAddress: user.walletAddress ?? null,
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

async function assertUsernameAvailable(username, excludeUserId) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== excludeUserId) {
    throw new ApiError(409, "Username already taken.");
  }
}

async function tempUsernameFromEmail(email) {
  const base = (email.split("@")[0] || "user")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 20) || "user";

  let candidate = `tmp_${base}`.slice(0, 30);
  let n = 0;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    n += 1;
    candidate = `tmp_${base}_${n}`.slice(0, 30);
  }
  return candidate;
}

// POST /api/auth/signup
export const signup = asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username, password } = parsed.data;
  await assertUsernameAvailable(username);

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, password: hashed, usernameSet: true },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, authPayload(user), "User registered successfully."));
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.password) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new ApiError(401, "Invalid credentials.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, authPayload(user), "Login successful."));
});

// POST /api/auth/google  body: { idToken, mode?: "login"|"link" }
export const googleAuth = asyncHandler(async (req, res) => {
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(500, "Google Sign-In is not configured.");
  }

  const mode = parsed.data.mode === "link" ? "link" : "login";

  const client = new OAuth2Client(clientId);
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: clientId,
    });
  } catch {
    throw new ApiError(401, "Invalid Google token.");
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new ApiError(401, "Google account is missing required profile fields.");
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const avatarUrl = payload.picture || null;

  if (mode === "link") {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new ApiError(401, "Login required to connect Google.");
    }
    let linkUserId;
    try {
      linkUserId = verifyToken(authHeader.split(" ")[1]).id;
    } catch {
      throw new ApiError(401, "Login required to connect Google.");
    }

    const taken = await prisma.user.findFirst({
      where: { googleId, NOT: { id: linkUserId } },
    });
    if (taken) {
      throw new ApiError(409, "Google already linked to another account.");
    }
    const emailTaken = await prisma.user.findFirst({
      where: { email, NOT: { id: linkUserId } },
    });

    const user = await prisma.user.update({
      where: { id: linkUserId },
      data: {
        googleId,
        avatarUrl: avatarUrl || undefined,
        ...(!emailTaken ? { email } : {}),
      },
    });

    return res.status(200).json(
      new ApiResponse(200, { ...authPayload(user), linked: true }, "Google connected.")
    );
  }

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId }, { email }],
    },
  });

  let isNew = false;
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: user.googleId || googleId,
        email: user.email || email,
        avatarUrl: avatarUrl || user.avatarUrl,
      },
    });
  } else {
    isNew = true;
    const username = await tempUsernameFromEmail(email);
    user = await prisma.user.create({
      data: {
        username,
        email,
        googleId,
        avatarUrl,
        usernameSet: false,
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { ...authPayload(user), isNew },
      "Google login successful."
    )
  );
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  return res.status(200).json(new ApiResponse(200, publicUser(user), "OK"));
});

// PATCH /api/auth/username — set or change unique username
export const setUsername = asyncHandler(async (req, res) => {
  const parsed = usernameSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const existingUser = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!existingUser) {
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  const { username } = parsed.data;
  await assertUsernameAvailable(username, req.user.id);

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { username, usernameSet: true },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, authPayload(user), "Username updated."));
});

// PATCH /api/auth/profile — displayName + walletAddress
export const updateProfile = asyncHandler(async (req, res) => {
  const displayName =
    req.body?.displayName != null ? String(req.body.displayName).trim().slice(0, 80) : undefined;
  const walletAddress =
    req.body?.walletAddress != null
      ? String(req.body.walletAddress).trim().slice(0, 128) || null
      : undefined;

  const data = {};
  if (displayName !== undefined) data.displayName = displayName || null;
  if (walletAddress !== undefined) data.walletAddress = walletAddress;

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
  });
  return res.status(200).json(new ApiResponse(200, publicUser(user), "Profile updated."));
});

// GET /api/auth/username-available?username=
export const checkUsername = asyncHandler(async (req, res) => {
  const username = String(req.query.username || "").trim();
  if (username.length < 3) {
    return res.status(200).json(
      new ApiResponse(200, { available: false, reason: "Too short" }, "OK")
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  const available = !existing || existing.id === req.user?.id;

  return res
    .status(200)
    .json(new ApiResponse(200, { available }, available ? "Available" : "Taken"));
});
