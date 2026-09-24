import prisma from "../config/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import crypto from "crypto";
import {
  createEventSchema,
  updateEventSchema,
  settingsSchema,
  bookSchema,
} from "../validations/calendar.validation.js";
import {
  buildSlotsForDay,
  defaultSettingsShape,
  formatShareSlug,
  normalizeWeekdays,
  parseShareSlug,
  SLOT_MINUTES,
  weekdayIndexMon0,
  zonedLocalToUtc,
  getZonedParts,
} from "../utils/calendarTime.js";

const PRIVATE_INVITE_TTL_MS = 30 * 60 * 1000;

async function getOrCreateSettings(userId) {
  const existing = await prisma.calendarSettings.findUnique({ where: { userId } });
  if (existing) {
    return {
      ...existing,
      weekdays: normalizeWeekdays(existing.weekdays),
      slotMinutes: SLOT_MINUTES,
    };
  }
  const defaults = defaultSettingsShape();
  const created = await prisma.calendarSettings.create({
    data: {
      userId,
      timezone: defaults.timezone,
      slotMinutes: SLOT_MINUTES,
      dayStartMin: defaults.dayStartMin,
      dayEndMin: defaults.dayEndMin,
      weekdays: defaults.weekdays,
    },
  });
  return { ...created, weekdays: normalizeWeekdays(created.weekdays), slotMinutes: SLOT_MINUTES };
}

async function findHostByUsername(username) {
  const raw = String(username || "").trim();
  const user = await prisma.user.findFirst({
    where: { username: { equals: raw, mode: "insensitive" } },
    select: { id: true, username: true, avatarUrl: true },
  });
  if (!user) throw new ApiError(404, "Calendar not found.");
  return user;
}

function dateRangeBusy(userId, from, to) {
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      startAt: { lte: to },
      endAt: { gte: from },
    },
    select: { startAt: true, endAt: true },
  });
}

async function createPrivateInvite(userId, date) {
  await prisma.calendarPrivateInvite.deleteMany({
    where: { userId, date },
  });
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + PRIVATE_INVITE_TTL_MS);
  const invite = await prisma.calendarPrivateInvite.create({
    data: { userId, date, token, expiresAt },
  });
  return invite;
}

async function assertValidPrivateInvite(username, token) {
  const host = await findHostByUsername(username);
  const invite = await prisma.calendarPrivateInvite.findFirst({
    where: { token, userId: host.id },
  });
  if (!invite) throw new ApiError(404, "Private link not found.");
  if (invite.expiresAt <= new Date()) {
    throw new ApiError(410, "This private link has expired (valid for 30 minutes).");
  }
  return { host, invite };
}

async function slotsForUserDay(userId, settings, dateStr, { ignoreBlocked = false } = {}) {
  const blocked = ignoreBlocked
    ? []
    : await prisma.calendarBlockedDate.findMany({ where: { userId } });
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = zonedLocalToUtc(y, m, d, 0, 0, settings.timezone);
  const dayEnd = zonedLocalToUtc(y, m, d, 23, 59, settings.timezone);
  const busy = await dateRangeBusy(userId, dayStart, dayEnd);
  return buildSlotsForDay({
    dateStr,
    timezone: settings.timezone,
    dayStartMin: settings.dayStartMin,
    dayEndMin: settings.dayEndMin,
    slotMinutes: SLOT_MINUTES,
    weekdays: ignoreBlocked
      ? [true, true, true, true, true, true, true]
      : settings.weekdays,
    blockedSet: new Set(blocked.map((b) => b.date)),
    busy,
  });
}

// ─── Owner: settings ───────────────────────────────────────────

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user.id);
  const blocked = await prisma.calendarBlockedDate.findMany({
    where: { userId: req.user.id },
    orderBy: { date: "asc" },
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      { ...settings, blockedDates: blocked.map((b) => b.date) },
      "Settings fetched."
    )
  );
});

export const updateSettings = asyncHandler(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }
  const data = parsed.data;
  const settings = await prisma.calendarSettings.upsert({
    where: { userId: req.user.id },
    create: {
      userId: req.user.id,
      timezone: data.timezone,
      slotMinutes: SLOT_MINUTES,
      dayStartMin: data.dayStartMin,
      dayEndMin: data.dayEndMin,
      weekdays: data.weekdays,
    },
    update: {
      timezone: data.timezone,
      slotMinutes: SLOT_MINUTES,
      dayStartMin: data.dayStartMin,
      dayEndMin: data.dayEndMin,
      weekdays: data.weekdays,
    },
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      { ...settings, weekdays: normalizeWeekdays(settings.weekdays), slotMinutes: SLOT_MINUTES },
      "Settings saved."
    )
  );
});

export const setBlockedDate = asyncHandler(async (req, res) => {
  const date = String(req.body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "date must be YYYY-MM-DD.");
  }
  const blocked = !!req.body.blocked;
  let privateInvite = null;

  if (blocked) {
    await prisma.calendarBlockedDate.upsert({
      where: { userId_date: { userId: req.user.id, date } },
      create: { userId: req.user.id, date },
      update: {},
    });
    privateInvite = await createPrivateInvite(req.user.id, date);
  } else {
    await prisma.calendarBlockedDate.deleteMany({
      where: { userId: req.user.id, date },
    });
    await prisma.calendarPrivateInvite.deleteMany({
      where: { userId: req.user.id, date },
    });
  }

  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { username: true },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date,
        blocked,
        privateInvite: privateInvite
          ? {
              token: privateInvite.token,
              date: privateInvite.date,
              expiresAt: privateInvite.expiresAt,
              path: `/book/${me.username}/private/${privateInvite.token}`,
            }
          : null,
      },
      blocked ? "Day blocked. Private link valid for 30 minutes." : "Day unblocked."
    )
  );
});

export const refreshPrivateInvite = asyncHandler(async (req, res) => {
  const date = String(req.body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "date must be YYYY-MM-DD.");
  }
  const blocked = await prisma.calendarBlockedDate.findFirst({
    where: { userId: req.user.id, date },
  });
  if (!blocked) {
    throw new ApiError(400, "Block this day first to create a private invite.");
  }
  const invite = await createPrivateInvite(req.user.id, date);
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { username: true },
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        token: invite.token,
        date: invite.date,
        expiresAt: invite.expiresAt,
        path: `/book/${me.username}/private/${invite.token}`,
      },
      "Private link refreshed (valid 30 minutes)."
    )
  );
});

// ─── Owner: slots for a day (preview) ──────────────────────────

export const getOwnerDaySlots = asyncHandler(async (req, res) => {
  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "date must be YYYY-MM-DD.");
  }
  const settings = await getOrCreateSettings(req.user.id);
  // Owner always sees slot grid (blocked days still usable via private invite)
  const slots = await slotsForUserDay(req.user.id, settings, date, {
    ignoreBlocked: true,
  });
  const invite = await prisma.calendarPrivateInvite.findFirst({
    where: {
      userId: req.user.id,
      date,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { username: true },
  });
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date,
        settings,
        slots,
        privateInvite: invite
          ? {
              token: invite.token,
              expiresAt: invite.expiresAt,
              path: `/book/${me.username}/private/${invite.token}`,
            }
          : null,
      },
      "Slots fetched."
    )
  );
});

// ─── Events CRUD (owner) ───────────────────────────────────────

export const listEvents = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { from, to } = req.query;

  const where = { userId };
  if (from || to) {
    const rangeStart = from ? new Date(from) : null;
    const rangeEnd = to ? new Date(to) : null;
    if ((from && Number.isNaN(rangeStart.getTime())) || (to && Number.isNaN(rangeEnd.getTime()))) {
      throw new ApiError(400, "Invalid from/to date.");
    }
    where.AND = [];
    if (rangeEnd) where.AND.push({ startAt: { lte: rangeEnd } });
    if (rangeStart) where.AND.push({ endAt: { gte: rangeStart } });
  }

  const events = await prisma.calendarEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, events, "Events fetched successfully."));
});

export const createEvent = asyncHandler(async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const data = parsed.data;
  const settings = await getOrCreateSettings(req.user.id);
  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  const event = await prisma.calendarEvent.create({
    data: {
      userId: req.user.id,
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      color: data.color || "#61bd4f",
      allDay: data.allDay ?? false,
      kind: "EVENT",
      startAt,
      endAt,
      shareSlug: formatShareSlug(startAt, settings.timezone, SLOT_MINUTES),
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, event, "Event created successfully."));
});

export const updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, userId: req.user.id },
  });
  if (!existing) {
    throw new ApiError(404, "Event not found.");
  }

  const data = parsed.data;
  const startAt = data.startAt ? new Date(data.startAt) : existing.startAt;
  const endAt = data.endAt ? new Date(data.endAt) : existing.endAt;
  if (endAt <= startAt) {
    throw new ApiError(400, "End time must be after start time.");
  }

  const settings = await getOrCreateSettings(req.user.id);
  const event = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.allDay !== undefined && { allDay: data.allDay }),
      ...(data.startAt !== undefined && { startAt }),
      ...(data.endAt !== undefined && { endAt }),
      shareSlug: formatShareSlug(startAt, settings.timezone, SLOT_MINUTES),
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, event, "Event updated successfully."));
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, userId: req.user.id },
  });
  if (!existing) {
    throw new ApiError(404, "Event not found.");
  }

  await prisma.calendarEvent.delete({ where: { id: eventId } });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Event deleted successfully."));
});

// ─── Public booking ────────────────────────────────────────────

export const getPublicProfile = asyncHandler(async (req, res) => {
  const host = await findHostByUsername(req.params.username);
  const settings = await getOrCreateSettings(host.id);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username: host.username,
        avatarUrl: host.avatarUrl,
        timezone: settings.timezone,
        slotMinutes: SLOT_MINUTES,
        dayStartMin: settings.dayStartMin,
        dayEndMin: settings.dayEndMin,
        weekdays: settings.weekdays,
      },
      "OK"
    )
  );
});

export const getPublicMonth = asyncHandler(async (req, res) => {
  const host = await findHostByUsername(req.params.username);
  const settings = await getOrCreateSettings(host.id);
  const year = Number(req.query.year);
  const month = Number(req.query.month); // 1-12
  if (!year || !month || month < 1 || month > 12) {
    throw new ApiError(400, "year and month (1-12) required.");
  }

  const blocked = await prisma.calendarBlockedDate.findMany({
    where: { userId: host.id },
  });
  const blockedSet = new Set(blocked.map((b) => b.date));
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = zonedLocalToUtc(year, month, 1, 0, 0, settings.timezone);
  const to = zonedLocalToUtc(year, month, daysInMonth, 23, 59, settings.timezone);
  const busy = await dateRangeBusy(host.id, from, to);

  const availableDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const slots = buildSlotsForDay({
      dateStr,
      timezone: settings.timezone,
      dayStartMin: settings.dayStartMin,
      dayEndMin: settings.dayEndMin,
      slotMinutes: SLOT_MINUTES,
      weekdays: settings.weekdays,
      blockedSet,
      busy,
    });
    if (slots.length > 0) availableDates.push(dateStr);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username: host.username,
        timezone: settings.timezone,
        slotMinutes: SLOT_MINUTES,
        availableDates,
        weekdays: settings.weekdays,
      },
      "OK"
    )
  );
});

export const getPublicDaySlots = asyncHandler(async (req, res) => {
  const host = await findHostByUsername(req.params.username);
  const settings = await getOrCreateSettings(host.id);
  const date = String(req.query.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "date must be YYYY-MM-DD.");
  }

  const blocked = await prisma.calendarBlockedDate.findMany({
    where: { userId: host.id },
  });
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = zonedLocalToUtc(y, m, d, 0, 0, settings.timezone);
  const dayEnd = zonedLocalToUtc(y, m, d, 23, 59, settings.timezone);
  const busy = await dateRangeBusy(host.id, dayStart, dayEnd);
  const slots = buildSlotsForDay({
    dateStr: date,
    timezone: settings.timezone,
    dayStartMin: settings.dayStartMin,
    dayEndMin: settings.dayEndMin,
    slotMinutes: SLOT_MINUTES,
    weekdays: settings.weekdays,
    blockedSet: new Set(blocked.map((b) => b.date)),
    busy,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username: host.username,
        timezone: settings.timezone,
        slotMinutes: SLOT_MINUTES,
        date,
        slots,
      },
      "OK"
    )
  );
});

export const getPublicSlot = asyncHandler(async (req, res) => {
  const host = await findHostByUsername(req.params.username);
  const settings = await getOrCreateSettings(host.id);
  const slug = req.params.slotSlug;
  const parsed = parseShareSlug(slug);
  if (!parsed || parsed.slotMinutes !== SLOT_MINUTES) {
    throw new ApiError(400, "Invalid meeting link.");
  }

  // Year: prefer query, else current/next occurrence of month-day
  let year = Number(req.query.year) || new Date().getFullYear();
  let startAt = zonedLocalToUtc(
    year,
    parsed.month,
    parsed.day,
    parsed.hour,
    parsed.minute,
    settings.timezone
  );
  if (startAt < new Date() && !req.query.year) {
    year += 1;
    startAt = zonedLocalToUtc(
      year,
      parsed.month,
      parsed.day,
      parsed.hour,
      parsed.minute,
      settings.timezone
    );
  }
  const endAt = new Date(startAt.getTime() + SLOT_MINUTES * 60_000);
  const dateStr = `${year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;

  const blocked = await prisma.calendarBlockedDate.findFirst({
    where: { userId: host.id, date: dateStr },
  });
  if (blocked) throw new ApiError(409, "This day is not available.");

  const wd = settings.weekdays;
  if (!wd[weekdayIndexMon0(dateStr, settings.timezone)]) {
    throw new ApiError(409, "This day is not available.");
  }

  const busy = await dateRangeBusy(host.id, startAt, endAt);
  const overlaps = busy.some(
    (b) => startAt < new Date(b.endAt) && endAt > new Date(b.startAt)
  );
  if (overlaps || startAt <= new Date()) {
    throw new ApiError(409, "This slot is no longer available.");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username: host.username,
        avatarUrl: host.avatarUrl,
        timezone: settings.timezone,
        slotMinutes: SLOT_MINUTES,
        shareSlug: slug,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        date: dateStr,
        label: `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`,
      },
      "OK"
    )
  );
});

export const createPublicBooking = asyncHandler(async (req, res) => {
  const host = await findHostByUsername(req.params.username);
  const settings = await getOrCreateSettings(host.id);
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  const duration = (endAt - startAt) / 60_000;
  if (duration !== SLOT_MINUTES) {
    throw new ApiError(400, "Meetings are fixed at 30 minutes.");
  }
  if (startAt <= new Date()) {
    throw new ApiError(400, "Cannot book a past slot.");
  }

  const z = getZonedParts(startAt, settings.timezone);
  const ownerDate = `${z.year}-${String(z.month).padStart(2, "0")}-${String(z.day).padStart(2, "0")}`;
  let viaPrivate = false;

  if (parsed.data.privateToken) {
    const invite = await prisma.calendarPrivateInvite.findFirst({
      where: { token: parsed.data.privateToken, userId: host.id },
    });
    if (!invite) throw new ApiError(404, "Private link not found.");
    if (invite.expiresAt <= new Date()) {
      throw new ApiError(410, "This private link has expired (valid for 30 minutes).");
    }
    if (invite.date !== ownerDate) {
      throw new ApiError(400, "Slot does not match this private invite day.");
    }
    viaPrivate = true;
  } else {
    const blocked = await prisma.calendarBlockedDate.findFirst({
      where: { userId: host.id, date: ownerDate },
    });
    if (blocked) {
      throw new ApiError(409, "This day is not publicly available.");
    }
    if (!settings.weekdays[weekdayIndexMon0(ownerDate, settings.timezone)]) {
      throw new ApiError(409, "This day is not available.");
    }
  }

  const shareSlug =
    parsed.data.shareSlug ||
    formatShareSlug(startAt, settings.timezone, SLOT_MINUTES);

  const busy = await dateRangeBusy(host.id, startAt, endAt);
  const overlaps = busy.some(
    (b) => startAt < new Date(b.endAt) && endAt > new Date(b.startAt)
  );
  if (overlaps) {
    throw new ApiError(409, "This slot was just taken.");
  }

  const event = await prisma.calendarEvent.create({
    data: {
      userId: host.id,
      title: `Meeting with ${parsed.data.guestName}`,
      description: viaPrivate
        ? `Private booking.\nGuest: ${parsed.data.guestEmail}`
        : `Booked via share link.\nGuest: ${parsed.data.guestEmail}`,
      kind: "BOOKING",
      guestName: parsed.data.guestName,
      guestEmail: parsed.data.guestEmail,
      guestTz: parsed.data.guestTz || null,
      shareSlug,
      meetLink: null,
      color: viaPrivate ? "#c377e0" : "#0079bf",
      startAt,
      endAt,
    },
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        id: event.id,
        startAt: event.startAt,
        endAt: event.endAt,
        shareSlug: event.shareSlug,
        meetLink: event.meetLink,
        hostUsername: host.username,
        guestEmail: event.guestEmail,
        private: viaPrivate,
      },
      "Meeting booked."
    )
  );
});

export const getPrivateInvite = asyncHandler(async (req, res) => {
  const { host, invite } = await assertValidPrivateInvite(
    req.params.username,
    req.params.token
  );
  const settings = await getOrCreateSettings(host.id);
  const slots = await slotsForUserDay(host.id, settings, invite.date, {
    ignoreBlocked: true,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        username: host.username,
        avatarUrl: host.avatarUrl,
        timezone: settings.timezone,
        slotMinutes: SLOT_MINUTES,
        date: invite.date,
        expiresAt: invite.expiresAt,
        private: true,
        slots,
      },
      "OK"
    )
  );
});
