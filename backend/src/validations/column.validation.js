import { z } from "zod";

export const createColumnSchema = z.object({
  name: z.string().min(1, "Column name is required.").max(60),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex like #88cc88.")
    .optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex like #88cc88.")
    .optional(),
}).refine((d) => d.name !== undefined || d.color !== undefined, {
  message: "Provide a name and/or color.",
});

export const reorderColumnsSchema = z.object({
  columnIds: z.array(z.string().uuid()).min(1, "columnIds required."),
});
