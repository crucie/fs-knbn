import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  assignedToId: z.string().uuid("Invalid user ID.").optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"], {
    errorMap: () => ({ message: "Status must be TODO, IN_PROGRESS, or DONE." }),
  }),
});
