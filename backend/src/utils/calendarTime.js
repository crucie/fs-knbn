const DEFAULT_WEEKDAYS = [true, true, true, true, true, false, false];
const SLOT_MINUTES = 30;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function defaultSettingsShape() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    slotMinutes: SLOT_MINUTES,
    dayStartMin: 540,
    dayEndMin: 1020,
    weekdays: [...DEFAULT_WEEKDAYS],
  };
}

export function normalizeWeekdays(raw) {
  if (!Array.isArray(raw) || raw.length !== 7) return [...DEFAULT_WEEKDAYS];
  return raw.map((v) => !!v);
}

/** Convert local wall time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(year, month, day, hour, minute, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(utcGuess))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asIfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return new Date(utcGuess - (asIfLocal - utcGuess));
}

export function getZonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

/** Monday=0 … Sunday=6 for a YYYY-MM-DD calendar day in timezone. */
export function weekdayIndexMon0(dateStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const noon = zonedLocalToUtc(y, m, d, 12, 0, timeZone);
  const wd = getZonedParts(noon, timeZone).weekday;
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatShareSlug(startAt, timeZone, slotMinutes = SLOT_MINUTES) {
  const p = getZonedParts(new Date(startAt), timeZone);
  const time = `${pad2(p.hour)}${pad2(p.minute)}`;
  const month = MONTHS[p.month - 1];
  return `${slotMinutes}min-${time}-${month}-${p.day}`;
}

export function parseShareSlug(slug) {
  const m = String(slug || "").match(/^(\d+)min-(\d{4})-([A-Za-z]{3})-(\d{1,2})$/i);
  if (!m) return null;
  const monthIdx = MONTHS.findIndex((x) => x.toLowerCase() === m[3].toLowerCase());
  if (monthIdx < 0) return null;
  const hh = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  if (hh > 23 || mm > 59) return null;
  return {
    slotMinutes: Number(m[1]),
    hour: hh,
    minute: mm,
    month: monthIdx + 1,
    day: Number(m[4]),
    monthLabel: MONTHS[monthIdx],
  };
}

export function buildSlotsForDay({
  dateStr,
  timezone,
  dayStartMin,
  dayEndMin,
  slotMinutes = SLOT_MINUTES,
  weekdays,
  blockedSet,
  busy,
  now = new Date(),
}) {
  if (blockedSet?.has(dateStr)) return [];
  const wd = weekdayIndexMon0(dateStr, timezone);
  if (!weekdays[wd]) return [];

  const [y, m, d] = dateStr.split("-").map(Number);
  const slots = [];
  for (let mins = dayStartMin; mins + slotMinutes <= dayEndMin; mins += slotMinutes) {
    const h = Math.floor(mins / 60);
    const mi = mins % 60;
    const startAt = zonedLocalToUtc(y, m, d, h, mi, timezone);
    const endAt = new Date(startAt.getTime() + slotMinutes * 60_000);
    if (startAt <= now) continue;
    const overlaps = (busy || []).some(
      (b) => startAt < new Date(b.endAt) && endAt > new Date(b.startAt)
    );
    if (overlaps) continue;
    slots.push({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      label: `${pad2(h)}:${pad2(mi)}`,
      shareSlug: formatShareSlug(startAt, timezone, slotMinutes),
    });
  }
  return slots;
}

export { SLOT_MINUTES, MONTHS, DEFAULT_WEEKDAYS };
