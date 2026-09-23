import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
});

export const createProjectSchema = z.object({
  title: z.string().min(1, "Title is required.").max(100),
  description: z.string().max(500).optional(),
  workspaceId: z.string().uuid().optional(),
});

export const inviteMemberSchema = z
  .object({
    username: z.string().min(1).optional(),
    email: z.string().email("Invalid email.").optional(),
    role: z.enum(["OWNER", "MAINTAINER", "CONTRIBUTOR", "VIEWER"]).optional(),
  })
  .refine((data) => data.username || data.email, {
    message: "Provide a username or email.",
  });

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "MAINTAINER", "CONTRIBUTOR", "VIEWER"]),
});
