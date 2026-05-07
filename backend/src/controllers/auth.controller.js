import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import { signToken } from "../utils/jwt.js";
import { signupSchema, loginSchema } from "../validations/auth.validation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// POST /api/auth/signup
export const signup = asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new ApiError(409, "Username already taken.");
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, password: hashed },
  });

  const token = signToken({ id: user.id, username: user.username });

  return res
    .status(201)
    .json(new ApiResponse(201, { token, user: { id: user.id, username: user.username } }, "User registered successfully."));
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const token = signToken({ id: user.id, username: user.username });

  return res
    .status(200)
    .json(new ApiResponse(200, { token, user: { id: user.id, username: user.username } }, "Login successful."));
});
