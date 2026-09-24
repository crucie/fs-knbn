import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import {
  createChannelSchema,
  postMessageSchema,
  openDmSchema,
  reorderChannelsSchema,
  updateChannelSchema,
  voiceSignalSchema,
} from "../validations/channel.validation.js";
import { publishTeamEvent, subscribeTeamProject } from "../utils/teamBus.js";
import {
  cacheGet,
  cacheSet,
  cacheKeys,
  invalidateTeam,
  invalidateTeamChannels,
} from "../utils/cache.js";

const TEAM_TTL = Number(process.env.REDIS_TEAM_TTL_SECONDS || 300);

const authorSelect = {
  id: true,
  username: true,
  avatarUrl: true,
};

const memberUserSelect = {
  user: { select: authorSelect },
};

function slugifyName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 40);
}

function dmChannelName(userIdA, userIdB) {
  const [a, b] = [userIdA, userIdB].sort();
  return `dm-${a.slice(0, 8)}-${b.slice(0, 8)}`;
}

const DEFAULT_CHANNELS = [
  { name: "general", isDefault: true, position: 0 },
  { name: "socials", isDefault: true, position: 1 },
];

async function ensureDefaultChannels(projectId, userId) {
  for (const def of DEFAULT_CHANNELS) {
    const existing = await prisma.teamChannel.findFirst({
      where: { projectId, name: def.name, isDm: false },
    });
    if (existing) {
      if (!existing.isDefault) {
        await prisma.teamChannel.update({
          where: { id: existing.id },
          data: { isDefault: true, isPrivate: false },
        });
      }
      continue;
    }
    try {
      await prisma.teamChannel.create({
        data: {
          projectId,
          name: def.name,
          isPrivate: false,
          isDm: false,
          isDefault: true,
          position: def.position,
          createdById: userId || null,
        },
      });
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
}

async function nextChannelPosition(projectId) {
  const agg = await prisma.teamChannel.aggregate({
    where: { projectId, isDm: false },
    _max: { position: true },
  });
  return (agg._max.position ?? -1) + 1;
}

async function assertChannelAccess(channel, userId) {
  if (channel.isDm || channel.isPrivate) {
    const membership = await prisma.teamChannelMember.findUnique({
      where: {
        channelId_userId: { channelId: channel.id, userId },
      },
    });
    if (!membership) throw new ApiError(403, "You do not have access to this channel.");
  }
}

async function getChannelInProject(channelId, projectId) {
  const channel = await prisma.teamChannel.findFirst({
    where: { id: channelId, projectId },
  });
  if (!channel) throw new ApiError(404, "Channel not found.");
  return channel;
}

function shapeChannel(c, currentUserId) {
  const other =
    c.isDm && c.members
      ? c.members.map((m) => m.user).find((u) => u.id !== currentUserId) || null
      : null;

  return {
    id: c.id,
    name: c.name,
    type: c.type || "TEXT",
    icon: c.icon || null,
    isPrivate: c.isPrivate,
    isDm: c.isDm,
    isDefault: c.isDefault,
    position: c.position ?? 0,
    canvasDoc: c.canvasDoc ?? null,
    createdAt: c.createdAt,
    messageCount: c._count?.messages ?? 0,
    lastMessage: c.messages?.[0] || null,
    members: (c.members || []).map((m) => m.user),
    dmPeer: other,
  };
}

// GET /api/projects/:projectId/channels
export const listChannels = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  await ensureDefaultChannels(projectId, userId);

  const ck = cacheKeys.teamChannels(projectId, userId);
  const cached = await cacheGet(ck);
  if (cached) {
    // Warm message caches for visible channels in the background
    warmChannelMessages(projectId, cached).catch(() => {});
    return res
      .status(200)
      .json(new ApiResponse(200, cached, "Channels fetched."));
  }

  const channels = await prisma.teamChannel.findMany({
    where: {
      projectId,
      leftBy: { none: { userId } },
      OR: [
        { isDm: false, isPrivate: false },
        { isDm: false, isPrivate: true, members: { some: { userId } } },
        { isDm: true, members: { some: { userId } } },
      ],
    },
    orderBy: [{ isDm: "asc" }, { position: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
      members: { select: memberUserSelect },
    },
  });

  const shaped = channels.map((c) => shapeChannel(c, userId));
  await cacheSet(ck, shaped, TEAM_TTL);
  warmChannelMessages(projectId, shaped).catch(() => {});

  return res
    .status(200)
    .json(new ApiResponse(200, shaped, "Channels fetched."));
});

async function warmChannelMessages(projectId, channels) {
  const targets = (channels || []).filter((c) => !c.isDm).slice(0, 8);
  await Promise.all(
    targets.map(async (c) => {
      const mk = cacheKeys.teamMessages(c.id);
      if (await cacheGet(mk)) return;
      const messages = await prisma.teamMessage.findMany({
        where: { channelId: c.id },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: { author: { select: authorSelect } },
      });
      await cacheSet(mk, messages.reverse(), TEAM_TTL);
    })
  );
}
// POST /api/projects/:projectId/channels
export const createChannel = asyncHandler(async (req, res) => {
  const parsed = createChannelSchema.safeParse({
    ...req.body,
    name: req.body?.name ? slugifyName(req.body.name) : req.body?.name,
  });
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId } = req.params;
  const { name, isPrivate, memberIds, type, icon } = parsed.data;
  const userId = req.user.id;

  await ensureDefaultChannels(projectId, userId);

  if (DEFAULT_CHANNELS.some((d) => d.name === name)) {
    throw new ApiError(400, `#${name} is a default channel and already exists.`);
  }

  const uniqueMemberIds = [...new Set([userId, ...(memberIds || [])])];
  if (isPrivate) {
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId, userId: { in: uniqueMemberIds } },
      select: { userId: true },
    });
    if (projectMembers.length !== uniqueMemberIds.length) {
      throw new ApiError(400, "All private channel members must be on the project.");
    }
  }

  try {
    const position = await nextChannelPosition(projectId);
    const channel = await prisma.teamChannel.create({
      data: {
        projectId,
        name,
        type: type === "VOICE" ? "VOICE" : "TEXT",
        icon: icon || null,
        isPrivate: !!isPrivate,
        isDm: false,
        position,
        createdById: userId,
        ...(isPrivate
          ? {
              members: {
                create: uniqueMemberIds.map((id) => ({ userId: id })),
              },
            }
          : {}),
      },
      include: {
        _count: { select: { messages: true } },
        members: { select: memberUserSelect },
      },
    });

    const shaped = shapeChannel({ ...channel, messages: [] }, userId);
    await invalidateTeam(projectId);
    publishTeamEvent(projectId, {
      type: "channel.created",
      channelId: channel.id,
      channel: shaped,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, shaped, "Channel created."));
  } catch (err) {
    if (err.code === "P2002") {
      throw new ApiError(409, "A channel with that name already exists.");
    }
    throw err;
  }
});

// POST /api/projects/:projectId/channels/dm — open or get DM with a teammate
export const openDm = asyncHandler(async (req, res) => {
  const parsed = openDmSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId } = req.params;
  const peerId = parsed.data.userId;
  const userId = req.user.id;

  if (peerId === userId) {
    throw new ApiError(400, "Cannot DM yourself.");
  }

  const peerOnProject = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId: peerId, projectId } },
  });
  if (!peerOnProject) {
    throw new ApiError(400, "User is not a member of this project.");
  }

  const name = dmChannelName(userId, peerId);
  let channel = await prisma.teamChannel.findFirst({
    where: { projectId, name, isDm: true },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
      members: { select: memberUserSelect },
    },
  });

  if (!channel) {
    channel = await prisma.teamChannel.create({
      data: {
        projectId,
        name,
        isDm: true,
        isPrivate: true,
        createdById: userId,
        members: {
          create: [{ userId }, { userId: peerId }],
        },
      },
      include: {
        _count: { select: { messages: true } },
        members: { select: memberUserSelect },
      },
    });
    const shaped = shapeChannel({ ...channel, messages: [] }, userId);
    await invalidateTeam(projectId);
    publishTeamEvent(projectId, {
      type: "channel.created",
      channelId: channel.id,
      channel: shaped,
    });
    return res.status(200).json(new ApiResponse(200, shaped, "DM ready."));
  }

  const shaped = shapeChannel(channel, userId);
  return res.status(200).json(new ApiResponse(200, shaped, "DM ready."));
});

// DELETE /api/projects/:projectId/channels/:channelId
export const deleteChannel = asyncHandler(async (req, res) => {
  const { projectId, channelId } = req.params;
  const channel = await getChannelInProject(channelId, projectId);
  if (channel.isDefault) {
    throw new ApiError(400, "Cannot delete a default channel.");
  }
  if (channel.isDm) {
    throw new ApiError(400, "Cannot delete a direct message thread.");
  }
  await prisma.teamChannel.delete({ where: { id: channelId } });
  await invalidateTeam(projectId, [channelId]);
  publishTeamEvent(projectId, { type: "channel.deleted", channelId });
  return res.status(200).json(new ApiResponse(200, null, "Channel deleted."));
});

// PATCH /api/projects/:projectId/channels/:channelId
export const updateChannel = asyncHandler(async (req, res) => {
  const parsed = updateChannelSchema.safeParse({
    ...req.body,
    name: req.body?.name ? slugifyName(req.body.name) : req.body?.name,
  });
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, channelId } = req.params;
  const channel = await getChannelInProject(channelId, projectId);
  if (channel.isDm) throw new ApiError(400, "Cannot edit a direct message.");

  const wantsMeta =
    parsed.data.name != null || parsed.data.icon !== undefined;
  if (wantsMeta) {
    const role = req.membership?.role;
    if (role !== "ADMIN" && role !== "MAINTAINER") {
      throw new ApiError(403, "Only admins and maintainers can edit channel settings.");
    }
  }

  const data = {};
  if (parsed.data.name != null) {
    if (channel.isDefault && parsed.data.name !== channel.name) {
      throw new ApiError(400, "Cannot rename a default channel.");
    }
    data.name = parsed.data.name;
  }
  if (parsed.data.icon !== undefined) data.icon = parsed.data.icon;
  if (parsed.data.canvasDoc !== undefined) data.canvasDoc = parsed.data.canvasDoc;

  try {
    const updated = await prisma.teamChannel.update({
      where: { id: channelId },
      data,
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true },
        },
        members: { select: memberUserSelect },
      },
    });
    await invalidateTeamChannels(projectId);
    const shaped = shapeChannel(updated, req.user.id);
    publishTeamEvent(projectId, {
      type: "channel.updated",
      channelId,
      channel: shaped,
    });
    return res.status(200).json(new ApiResponse(200, shaped, "Channel updated."));
  } catch (err) {
    if (err.code === "P2002") {
      throw new ApiError(409, "A channel with that name already exists.");
    }
    throw err;
  }
});

// POST leave channel
export const leaveChannel = asyncHandler(async (req, res) => {
  const { projectId, channelId } = req.params;
  const userId = req.user.id;
  const channel = await getChannelInProject(channelId, projectId);

  if (channel.isDm) throw new ApiError(400, "Cannot leave a direct message.");
  if (channel.isDefault) throw new ApiError(400, "Cannot leave a default channel.");

  if (channel.isPrivate) {
    await prisma.teamChannelMember.deleteMany({
      where: { channelId, userId },
    });
  } else {
    await prisma.teamChannelLeft.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId },
      update: { leftAt: new Date() },
    });
  }

  await invalidateTeamChannels(projectId);
  publishTeamEvent(projectId, {
    type: "channel.left",
    channelId,
    userId,
  });

  return res.status(200).json(new ApiResponse(200, null, "Left channel."));
});

// Voice signaling (WebRTC) via team bus
export const voiceSignal = asyncHandler(async (req, res) => {
  const parsed = voiceSignalSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, channelId } = req.params;
  const channel = await getChannelInProject(channelId, projectId);
  if (channel.type !== "VOICE") {
    throw new ApiError(400, "Not a voice channel.");
  }
  await assertChannelAccess(channel, req.user.id);

  publishTeamEvent(projectId, {
    type: "voice.signal",
    channelId,
    fromUserId: req.user.id,
    fromUsername: req.user.username,
    ...parsed.data,
  });

  return res.status(200).json(new ApiResponse(200, null, "Signaled."));
});

// PATCH /api/projects/:projectId/channels/reorder
export const reorderChannels = asyncHandler(async (req, res) => {
  const parsed = reorderChannelsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId } = req.params;
  const { channelIds } = parsed.data;

  const existing = await prisma.teamChannel.findMany({
    where: { projectId, isDm: false, id: { in: channelIds } },
    select: { id: true },
  });
  if (existing.length !== channelIds.length) {
    throw new ApiError(400, "One or more channels are invalid.");
  }

  await prisma.$transaction(
    channelIds.map((id, index) =>
      prisma.teamChannel.update({
        where: { id },
        data: { position: index },
      })
    )
  );

  await invalidateTeamChannels(projectId);
  publishTeamEvent(projectId, { type: "channel.reordered", channelIds });

  return res.status(200).json(new ApiResponse(200, { channelIds }, "Channels reordered."));
});

// GET messages
export const listMessages = asyncHandler(async (req, res) => {
  const { projectId, channelId } = req.params;
  const channel = await getChannelInProject(channelId, projectId);
  await assertChannelAccess(channel, req.user.id);

  const limit = Math.min(Number(req.query.limit) || 80, 200);
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const useCache = !before;

  if (useCache) {
    const cached = await cacheGet(cacheKeys.teamMessages(channelId));
    if (cached) {
      return res
        .status(200)
        .json(new ApiResponse(200, cached, "Messages fetched."));
    }
  }

  const messages = await prisma.teamMessage.findMany({
    where: {
      channelId,
      ...(before && !Number.isNaN(before.getTime())
        ? { createdAt: { lt: before } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { author: { select: authorSelect } },
  });

  const ordered = messages.reverse();
  if (useCache) {
    await cacheSet(cacheKeys.teamMessages(channelId), ordered, TEAM_TTL);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, ordered, "Messages fetched."));
});

// POST message
export const postMessage = asyncHandler(async (req, res) => {
  const parsed = postMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const { projectId, channelId } = req.params;
  const channel = await getChannelInProject(channelId, projectId);
  await assertChannelAccess(channel, req.user.id);

  const message = await prisma.teamMessage.create({
    data: {
      channelId,
      body: parsed.data.body.trim(),
      authorId: req.user.id,
    },
    include: { author: { select: authorSelect } },
  });

  // Patch Redis message cache immediately (no wait for next GET)
  const mk = cacheKeys.teamMessages(channelId);
  const prev = (await cacheGet(mk)) || [];
  await cacheSet(mk, [...prev, message].slice(-80), TEAM_TTL);
  await invalidateTeamChannels(projectId);

  publishTeamEvent(projectId, {
    type: "message.created",
    channelId,
    message,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, message, "Message posted."));
});

// GET /api/projects/:projectId/channels/stream — SSE live feed (server-push "webhook")
export const teamLiveStream = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send("ready", { projectId, ok: true });

  const canReceive = async (payload) => {
    if (!payload?.channelId) return true;
    if (payload.type === "channel.deleted") return true;
    const channel = await prisma.teamChannel.findFirst({
      where: { id: payload.channelId, projectId },
      select: { isPrivate: true, isDm: true },
    });
    if (!channel) return false;
    if (!channel.isPrivate && !channel.isDm) return true;
    const membership = await prisma.teamChannelMember.findUnique({
      where: { channelId_userId: { channelId: payload.channelId, userId } },
    });
    return !!membership;
  };

  const unsubscribe = subscribeTeamProject(projectId, (payload) => {
    Promise.resolve(canReceive(payload))
      .then((ok) => {
        if (ok) send("team", payload);
      })
      .catch(() => {});
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
