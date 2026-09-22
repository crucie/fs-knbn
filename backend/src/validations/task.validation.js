import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  columnId: z.string().uuid("Invalid column ID."),
  assignedToId: z.string().uuid("Invalid user ID.").optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  description: z.string().max(10000).optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().uuid("Invalid column ID."),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  assignedToId: z.union([z.string().uuid("Invalid user ID."), z.null()]).optional(),
  dueDate: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  columnId: z.string().uuid("Invalid column ID.").optional(),
});
