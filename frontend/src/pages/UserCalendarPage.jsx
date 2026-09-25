import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Link2 } from "lucide-react";
import Navbar from "../components/Navbar";
import PrivateLinkCard from "../components/PrivateLinkCard";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../context/DialogContext";
import {
  COMMON_TIMEZONES,
  SLOT_MINUTES,
  WEEKDAY_LABELS,
  daysInMonth,
  mondayIndex,
  sameDay,
  startOfMonth,
  toDateStr,
  minsToLabel,
} from "../lib/calendarTime";

export default function UserCalendarPage() {
  const { user } = useAuth();
  const { alert, confirm } = useDialog();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [settings, setSettings] = useState(null);
  const [blockedDates, setBlockedDates] = useState([]);
  const [slots, setSlots] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [viewTz, setViewTz] = useState("");
  const [privateInvite, setPrivateInvite] = useState(null);
  const [refreshingPrivate, setRefreshingPrivate] = useState(false);

  const dateStr = toDateStr(selectedDay);
  const shareBase = `${window.location.origin}/book/${user?.username || ""}`;

  const loadSettings = useCallback(async () => {
    const { data } = await api.get("/calendar/settings");
    setSettings(data.data);
    setBlockedDates(data.data.blockedDates || []);
    setViewTz(data.data.timezone);
  }, []);

  const loadMonthEvents = useCallback(async () => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const { data } = await api.get("/calendar/events", {
      params: { from: from.toISOString(), to: to.toISOString() },
    });
    setEvents(data.data || []);
  }, [cursor]);

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    try {
      const { data } = await api.get("/calendar/slots", { params: { date: dateStr } });
      setSlots(data.data.slots || []);
      setPrivateInvite(data.data.privateInvite || null);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to load slots.");
    } finally {
      setLoadingSlots(false);
    }
  }, [dateStr, alert]);

  useEffect(() => {
    loadSettings().catch(console.error);
  }, [loadSettings]);

  useEffect(() => {
    loadMonthEvents().catch(console.error);
  }, [loadMonthEvents]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const total = daysInMonth(cursor);
    const pad = mondayIndex(first);
    const out = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let day = 1; day <= total; day++) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const bookedByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const d = new Date(ev.startAt);
      const key = toDateStr(d);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [events]);

  const isBlocked = blockedDates.includes(dateStr);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const dayLabel = selectedDay.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const today = new Date();

  const saveSettings = async (patch) => {
    if (!settings) return;
    setSavingSettings(true);
    const next = { ...settings, ...patch };
    try {
      const { data } = await api.patch("/calendar/settings", {
        timezone: next.timezone,
        dayStartMin: next.dayStartMin,
        dayEndMin: next.dayEndMin,
        weekdays: next.weekdays,
      });
      setSettings({ ...data.data, blockedDates });
      setViewTz(data.data.timezone);
      await loadSlots();
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleWeekday = (idx) => {
    if (!settings) return;
    const weekdays = [...settings.weekdays];
    weekdays[idx] = !weekdays[idx];
    saveSettings({ weekdays });
  };

  const toggleBlocked = async () => {
    const blocked = !isBlocked;
    try {
      const { data } = await api.post("/calendar/blocked-dates", { date: dateStr, blocked });
      setBlockedDates((prev) =>
        blocked ? [...new Set([...prev, dateStr])] : prev.filter((d) => d !== dateStr)
      );
      if (blocked && data.data.privateInvite) {
        setPrivateInvite(data.data.privateInvite);
        const url = `${window.location.origin}${data.data.privateInvite.path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch { /* ignore */ }
      } else {
        setPrivateInvite(null);
      }
      await loadSlots();
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to update day.");
    }
  };

  const refreshPrivateLink = async () => {
    setRefreshingPrivate(true);
    try {
      const { data } = await api.post("/calendar/private-invite", { date: dateStr });
      setPrivateInvite(data.data);
      const url = `${window.location.origin}${data.data.path}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch { /* ignore */ }
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to create private link.");
    } finally {
      setRefreshingPrivate(false);
    }
  };

  const copyShareLink = async (slug) => {
    const url = slug ? `${shareBase}/${slug}` : shareBase;
    try {
      await navigator.clipboard.writeText(url);
      await alert(`Copied:\n${url}`, { title: "Share link" });
    } catch {
      await alert(url, { title: "Share link" });
    }
  };

  const bookOwnSlot = async (slot) => {
    const ok = await confirm(`Block ${slot.label} as a 30‑min meeting hold?`, {
      title: "Hold slot",
      confirmLabel: "Hold",
    });
    if (!ok) return;
    try {
      await api.post("/calendar/events", {
        title: "Held meeting slot",
        startAt: slot.startAt,
        endAt: slot.endAt,
      });
      await loadSlots();
      await loadMonthEvents();
      await copyShareLink(slot.shareSlug);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to hold slot.");
    }
  };

  if (!settings) {
    return (
      <>
        <Navbar />
        <div className="page-body">
          <div className="skeleton-grid">
            <div className="skeleton-card" style={{ minHeight: 320, gridColumn: "1 / -1" }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="page-body meet-cal">
        <header className="meet-cal-header">
          <div>
            <h1>Calendar</h1>
            <p className="meet-cal-sub">30‑minute meetings · share your booking link</p>
          </div>
          <button type="button" className="btn btn-solid" onClick={() => copyShareLink()}>
            <Link2 size={15} /> Copy booking link
          </button>
        </header>

        <div className="meet-cal-settings">
          <div className="meet-cal-setting-row">
            <span className="label" style={{ margin: 0 }}>Available days</span>
            <div className="meet-weekday-toggles">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`meet-wd ${settings.weekdays[i] ? "on" : ""}`}
                  onClick={() => toggleWeekday(i)}
                  disabled={savingSettings}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="meet-cal-setting-row meet-cal-hours">
            <label className="field">
              <span className="label">From</span>
              <select
                className="select"
                value={settings.dayStartMin}
                onChange={(e) => saveSettings({ dayStartMin: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => h * 60).map((m) => (
                  <option key={m} value={m}>{minsToLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">To</span>
              <select
                className="select"
                value={settings.dayEndMin}
                onChange={(e) => saveSettings({ dayEndMin: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, h) => (h + 1) * 60).map((m) => (
                  <option key={m} value={m}>{minsToLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Your timezone</span>
              <select
                className="select"
                value={settings.timezone}
                onChange={(e) => saveSettings({ timezone: e.target.value })}
              >
                {[settings.timezone, ...COMMON_TIMEZONES.filter((t) => t !== settings.timezone)].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="meet-cal-layout">
          <section className="meet-cal-month">
            <div className="view-toolbar">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <h2 className="view-title">{monthLabel}</h2>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="cal-weekdays">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="cal-weekday">{w}</div>
              ))}
            </div>

            <div className="cal-grid meet-month-grid">
              {cells.map((date, i) => {
                if (!date) return <div key={`e-${i}`} className="cal-cell empty" />;
                const key = toDateStr(date);
                const wd = mondayIndex(date);
                const closed = !settings.weekdays[wd] || blockedDates.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`cal-cell meet-day-cell ${sameDay(date, today) ? "today" : ""} ${sameDay(date, selectedDay) ? "selected" : ""} ${closed ? "closed" : ""}`}
                    onClick={() => setSelectedDay(date)}
                  >
                    <span className="cal-daynum">{date.getDate()}</span>
                    {bookedByDay[key] > 0 && (
                      <span className="meet-day-count">
                        {bookedByDay[key]} booked
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="meet-cal-side">
            <div className="meet-side-top">
              <div>
                <h2 className="view-title">{dayLabel}</h2>
                <p className="meet-cal-sub" style={{ marginTop: 4 }}>
                  {SLOT_MINUTES}‑min slots
                </p>
              </div>
              <select
                className="select meet-tz-select"
                value={viewTz}
                onChange={(e) => setViewTz(e.target.value)}
                title="Display timezone"
              >
                {[viewTz || settings.timezone, ...COMMON_TIMEZONES]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((tz) => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                  ))}
              </select>
            </div>

            <div className="meet-side-actions">
              <button
                type="button"
                className={`btn btn-sm ${isBlocked ? "btn-solid" : ""}`}
                onClick={toggleBlocked}
              >
                {isBlocked ? "Unblock day" : "Block day"}
              </button>
            </div>

            {isBlocked && (
              privateInvite ? (
                <PrivateLinkCard
                  invite={privateInvite}
                  onRefresh={refreshPrivateLink}
                  refreshing={refreshingPrivate}
                />
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: "100%" }}
                  onClick={refreshPrivateLink}
                  disabled={refreshingPrivate}
                >
                  <Link2 size={13} /> Generate private link
                </button>
              )
            )}

            {loadingSlots ? (
              <div className="skeleton-card" style={{ minHeight: 120, margin: "0.5rem 0" }} />
            ) : !isBlocked && !settings.weekdays[mondayIndex(selectedDay)] ? (
              <p className="empty-state" style={{ padding: "1rem" }}>
                Weekday closed in settings.
              </p>
            ) : (
              <div className="meet-slot-list" data-lenis-prevent>
                {slots.length === 0 && (
                  <p className="empty-state" style={{ padding: "1rem" }}>
                    No open slots left.
                  </p>
                )}
                {slots.map((slot) => (
                  <div key={slot.startAt} className="meet-slot-row">
                    <button
                      type="button"
                      className="meet-slot-btn"
                      onClick={() => bookOwnSlot(slot)}
                    >
                      {slot.label}
                    </button>
                    {!isBlocked && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="Copy public slot link"
                        onClick={() => copyShareLink(slot.shareSlug)}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="view-footnote">
              {isBlocked
                ? "Blocked days stay private — share the private link (30 min)."
                : `Public: /book/${user.username}`}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
