import { z } from "zod";

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, "Channel name is required.")
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, numbers, hyphens, or underscores."),
  isPrivate: z.boolean().optional().default(false),
  memberIds: z.array(z.string().uuid()).optional().default([]),
  type: z.enum(["TEXT", "VOICE"]).optional().default("TEXT"),
  icon: z.string().max(16).nullable().optional(),
});

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, numbers, hyphens, or underscores.")
    .optional(),
  icon: z.string().max(16).nullable().optional(),
  isPrivate: z.boolean().optional(),
  canvasDoc: z.any().optional(),
});

export const openDmSchema = z.object({
  userId: z.string().uuid("Invalid user id."),
});

export const postMessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty.").max(4000),
});

export const reorderChannelsSchema = z.object({
  channelIds: z.array(z.string().uuid()).min(1, "channelIds required."),
});

export const voiceSignalSchema = z.object({
  kind: z.enum(["join", "leave", "offer", "answer", "ice", "speaking"]),
  toUserId: z.string().uuid().optional(),
  payload: z.any().optional(),
});
