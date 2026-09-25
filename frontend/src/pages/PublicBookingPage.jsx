import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "../lib/api";
import { useDialog } from "../context/DialogContext";
import {
  COMMON_TIMEZONES,
  SLOT_MINUTES,
  WEEKDAY_LABELS,
  bookingPath,
  daysInMonth,
  guestTimezone,
  mondayIndex,
  sameDay,
  startOfMonth,
  toDateStr,
} from "../lib/calendarTime";

export default function PublicBookingPage() {
  const { username, slotSlug, token: privateToken } = useParams();
  const navigate = useNavigate();
  const { alert } = useDialog();
  const isPrivate = Boolean(privateToken);

  const [profile, setProfile] = useState(null);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [slots, setSlots] = useState([]);
  const [guestTz, setGuestTz] = useState(guestTimezone);
  const [loading, setLoading] = useState(true);
  const [slotDetail, setSlotDetail] = useState(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState(null);
  const [privateMeta, setPrivateMeta] = useState(null);

  const loadMonth = useCallback(async () => {
    const { data } = await api.get(`/calendar/public/${username}/month`, {
      params: { year: cursor.getFullYear(), month: cursor.getMonth() + 1 },
    });
    setAvailableDates(data.data.availableDates || []);
  }, [username, cursor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isPrivate) {
          const { data } = await api.get(`/calendar/public/${username}/private/${privateToken}`);
          if (cancelled) return;
          setPrivateMeta(data.data);
          setProfile({
            username: data.data.username,
            timezone: data.data.timezone,
            slotMinutes: data.data.slotMinutes,
          });
          setSelectedDay(new Date(data.data.date + "T12:00:00"));
          setSlots(data.data.slots || []);
        } else {
          const { data } = await api.get(`/calendar/public/${username}`);
          if (!cancelled) setProfile(data.data);
        }
      } catch (err) {
        if (!cancelled) {
          await alert(err.response?.data?.message || "Calendar not found.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [username, alert, isPrivate, privateToken]);

  useEffect(() => {
    if (!profile || isPrivate) return;
    loadMonth().catch(console.error);
  }, [profile, loadMonth, isPrivate]);

  useEffect(() => {
    if (!slotSlug || !username || isPrivate) return;
    (async () => {
      try {
        const { data } = await api.get(`/calendar/public/${username}/slot/${slotSlug}`);
        setSlotDetail(data.data);
        setSelectedDay(new Date(data.data.date + "T12:00:00"));
      } catch (err) {
        await alert(err.response?.data?.message || "This link is invalid or expired.");
        navigate(`/book/${username}`, { replace: true });
      }
    })();
  }, [slotSlug, username, alert, navigate, isPrivate]);

  useEffect(() => {
    if (!selectedDay || slotSlug || isPrivate) return;
    const date = toDateStr(selectedDay);
    (async () => {
      try {
        const { data } = await api.get(`/calendar/public/${username}/slots`, {
          params: { date },
        });
        setSlots(data.data.slots || []);
      } catch {
        setSlots([]);
      }
    })();
  }, [selectedDay, username, slotSlug, isPrivate]);

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

  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const today = new Date();

  const pickSlot = (slot) => {
    if (isPrivate) {
      setSlotDetail({
        ...slot,
        timezone: privateMeta?.timezone || profile?.timezone,
        shareSlug: slot.shareSlug,
        date: privateMeta?.date,
      });
      return;
    }
    navigate(bookingPath(username, slot.shareSlug));
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    if (!slotDetail) return;
    setBooking(true);
    try {
      const { data } = await api.post(`/calendar/public/${username}/book`, {
        startAt: slotDetail.startAt,
        endAt: slotDetail.endAt,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestTz,
        shareSlug: slotDetail.shareSlug,
        ...(isPrivate ? { privateToken } : {}),
      });
      setDone(data.data);
    } catch (err) {
      await alert(err.response?.data?.message || "Could not book this slot.");
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <div className="page-center">
        <div className="skeleton-card" style={{ width: "min(420px, 92vw)", minHeight: 220 }} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-center">
        <div className="empty-state">Calendar not found.</div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="page-center">
        <div className="book-confirm card">
          <h1>Booked</h1>
          <p className="meet-cal-sub">
            {SLOT_MINUTES} min with @{done.hostUsername}
            {done.private ? " · private" : ""}
          </p>
          <p>
            {new Date(done.startAt).toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="meet-cal-sub">Confirmation will go to {done.guestEmail}.</p>
          {done.meetLink ? (
            <a className="btn btn-solid" href={done.meetLink} target="_blank" rel="noreferrer">
              Join Google Meet
            </a>
          ) : (
            <p className="view-footnote">
              Meet link + email invite will be attached once Google Meet is connected.
            </p>
          )}
        </div>
      </div>
    );
  }

  if ((slotSlug || isPrivate) && slotDetail) {
    return (
      <div className="page-center book-page">
        <div className="book-shell">
          <div className="book-host">
            <h1>@{profile.username}</h1>
            <p className="meet-cal-sub">
              {SLOT_MINUTES}‑minute meeting{isPrivate ? " · private invite" : ""}
            </p>
            <p className="book-when">
              {new Date(slotDetail.startAt).toLocaleString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="meet-cal-sub">{slotDetail.timezone || profile.timezone}</p>
            {isPrivate && privateMeta && (
              <p className="meet-private-hint">
                Link expires {new Date(privateMeta.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSlotDetail(null)}
            >
              Change time
            </button>
          </div>
          <form className="book-form" onSubmit={submitBooking}>
            <h2 className="view-title">Enter details</h2>
            <div className="field">
              <label className="label">Name</label>
              <input
                className="input"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label">Your timezone</label>
              <select className="select" value={guestTz} onChange={(e) => setGuestTz(e.target.value)}>
                {[guestTz, ...COMMON_TIMEZONES].filter((v, i, a) => a.indexOf(v) === i).map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-solid" disabled={booking}>
              {booking ? "Booking…" : "Schedule event"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* Private: only that day's slot list */
  if (isPrivate && privateMeta) {
    return (
      <div className="page-center book-page">
        <div className="book-shell">
          <div className="book-host">
            <h1>@{profile.username}</h1>
            <p className="meet-cal-sub">Private {SLOT_MINUTES}‑min meeting</p>
            <p className="book-when">
              {new Date(privateMeta.date + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p className="meet-private-hint">
              Expires {new Date(privateMeta.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="meet-cal-side" style={{ minHeight: 0 }}>
            <select
              className="select meet-tz-select"
              value={guestTz}
              onChange={(e) => setGuestTz(e.target.value)}
            >
              {[guestTz, privateMeta.timezone, ...COMMON_TIMEZONES]
                .filter((v, i, a) => a.indexOf(v) === i)
                .map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
            </select>
            <div className="meet-slot-list" data-lenis-prevent>
              {slots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  className="meet-slot-btn full"
                  onClick={() => pickSlot(slot)}
                >
                  {slot.label}
                </button>
              ))}
              {slots.length === 0 && (
                <p className="empty-state" style={{ padding: "1rem" }}>No times left.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center book-page">
      <div className="book-shell wide">
        <div className="book-host">
          <h1>@{profile.username}</h1>
          <p className="meet-cal-sub">{SLOT_MINUTES}‑minute meeting</p>
        </div>

        <div className="meet-cal-layout book-layout">
          <section className="meet-cal-month">
            <div className="view-toolbar">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <h2 className="view-title">
                {cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </h2>
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
                const open = availableSet.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!open}
                    className={`cal-cell meet-day-cell ${sameDay(date, today) ? "today" : ""} ${selectedDay && sameDay(date, selectedDay) ? "selected" : ""} ${!open ? "closed" : ""}`}
                    onClick={() => open && setSelectedDay(date)}
                  >
                    <span className="cal-daynum">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="meet-cal-side">
            {!selectedDay ? (
              <p className="empty-state" style={{ padding: "1rem" }}>
                Select a date
              </p>
            ) : (
              <>
                <div className="meet-side-top">
                  <h2 className="view-title">
                    {selectedDay.toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </h2>
                  <select
                    className="select meet-tz-select"
                    value={guestTz}
                    onChange={(e) => setGuestTz(e.target.value)}
                  >
                    {[guestTz, profile.timezone, ...COMMON_TIMEZONES]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((tz) => (
                        <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                      ))}
                  </select>
                </div>
                <div className="meet-slot-list" data-lenis-prevent>
                  {slots.length === 0 && (
                    <p className="empty-state" style={{ padding: "1rem" }}>No times left.</p>
                  )}
                  {slots.map((slot) => (
                    <button
                      key={slot.startAt}
                      type="button"
                      className="meet-slot-btn full"
                      onClick={() => pickSlot(slot)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
