import { z } from "zod";

const iso = z.string().datetime({ offset: true });

export const createEventSchema = z
  .object({
    title: z.string().min(1, "Title is required.").max(200),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value.")
      .optional(),
    allDay: z.boolean().optional(),
    startAt: iso,
    endAt: iso,
  })
  .refine((d) => new Date(d.endAt) > new Date(d.startAt), {
    message: "End time must be after start time.",
    path: ["endAt"],
  });

export const updateEventSchema = z
  .object({
    title: z.string().min(1, "Title is required.").max(200).optional(),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(300).optional().nullable(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value.")
      .optional(),
    allDay: z.boolean().optional(),
    startAt: iso.optional(),
    endAt: iso.optional(),
  })
  .refine(
    (d) => {
      if (d.startAt && d.endAt) return new Date(d.endAt) > new Date(d.startAt);
      return true;
    },
    { message: "End time must be after start time.", path: ["endAt"] }
  );

export const settingsSchema = z.object({
  timezone: z.string().min(1).max(80),
  dayStartMin: z.number().int().min(0).max(23 * 60),
  dayEndMin: z.number().int().min(30).max(24 * 60),
  weekdays: z.array(z.boolean()).length(7),
}).refine((d) => d.dayEndMin > d.dayStartMin, {
  message: "End of day must be after start.",
  path: ["dayEndMin"],
});

export const bookSchema = z.object({
  startAt: iso,
  endAt: iso,
  guestName: z.string().min(1, "Name is required.").max(120),
  guestEmail: z.string().email("Valid email required.").max(200),
  guestTz: z.string().min(1).max(80).optional(),
  shareSlug: z.string().max(80).optional(),
  privateToken: z.string().max(80).optional(),
});
