/** Shared calendar time helpers (mirrors backend). */
export const SLOT_MINUTES = 30;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function minsToLabel(mins) {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

export function formatShareSlugFromParts(hour, minute, month, day, slotMinutes = SLOT_MINUTES) {
  return `${slotMinutes}min-${pad2(hour)}${pad2(minute)}-${MONTHS[month - 1]}-${day}`;
}

export function bookingPath(username, shareSlug) {
  return `/book/${encodeURIComponent(username)}/${encodeURIComponent(shareSlug)}`;
}

export function guestTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
