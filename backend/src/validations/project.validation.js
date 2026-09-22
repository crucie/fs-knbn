import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(1, "Title is required.").max(100),
  description: z.string().max(500).optional(),
});

export const inviteMemberSchema = z
  .object({
    username: z.string().min(1).optional(),
    email: z.string().email("Invalid email.").optional(),
  })
  .refine((data) => data.username || data.email, {
    message: "Provide a username or email.",
  });
