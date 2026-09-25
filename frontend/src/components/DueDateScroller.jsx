import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const ITEM_H = 40;
const PAD = 2;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toKey(y, m, day) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function parseDate(value, today) {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return { year: y, month: m - 1, day: d };
  }
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    day: today.getDate(),
  };
}

function parseTime(time, fallbackHour = 12, fallbackMin = 0) {
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    return { hour: h, minute: m };
  }
  return { hour: fallbackHour, minute: fallbackMin };
}

function clampFutureDate(y, m, d, today) {
  const max = daysInMonth(y, m);
  let day = Math.min(max, Math.max(1, d));
  let date = startOfDay(new Date(y, m, day));
  const t = startOfDay(today);
  if (date.getTime() < t.getTime()) {
    return {
      year: t.getFullYear(),
      month: t.getMonth(),
      day: t.getDate(),
    };
  }
  return { year: y, month: m, day };
}

function clampFutureTime(dateKey, hour, minute, now = new Date()) {
  const todayKey = toKey(now.getFullYear(), now.getMonth(), now.getDate());
  let h = Math.min(23, Math.max(0, hour));
  let min = Math.min(59, Math.max(0, minute));
  // snap minutes to 5
  min = Math.round(min / 5) * 5;
  if (min === 60) {
    min = 0;
    h = Math.min(23, h + 1);
  }
  if (dateKey === todayKey) {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let pick = h * 60 + min;
    if (pick <= nowMins) {
      pick = nowMins + 5;
      const snapped = Math.ceil(pick / 5) * 5;
      h = Math.floor(snapped / 60);
      min = snapped % 60;
      if (h > 23) {
        h = 23;
        min = 55;
      }
    }
  }
  return {
    hour: h,
    minute: min,
    label: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
  };
}

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  ariaLabel,
  large = false,
  format = (item) => String(item),
}) {
  const listRef = useRef(null);
  const skip = useRef(false);
  const timer = useRef(null);

  const scrollToIndex = useCallback((index, behavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: Math.max(0, index) * ITEM_H, behavior });
  }, []);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return undefined;
    }
    const t = setTimeout(() => scrollToIndex(selectedIndex, "auto"), 0);
    return () => clearTimeout(t);
  }, [selectedIndex, scrollToIndex]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dir = Math.sign(e.deltaY) || (e.deltaX ? Math.sign(e.deltaX) : 0);
      if (!dir) return;
      const next = Math.min(items.length - 1, Math.max(0, selectedIndex + dir));
      if (next === selectedIndex) {
        el.scrollTop = selectedIndex * ITEM_H;
        return;
      }
      skip.current = true;
      onSelect(next);
      scrollToIndex(next);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items.length, onSelect, scrollToIndex, selectedIndex]);

  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = listRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.min(items.length - 1, Math.max(0, idx));
      scrollToIndex(clamped);
      if (clamped !== selectedIndex) {
        skip.current = true;
        onSelect(clamped);
      }
    }, 60);
  };

  return (
    <div className={`due-wheel ${large ? "large" : ""}`}>
      <div className="due-wheel-frame" data-lenis-prevent>
        <div className="due-wheel-highlight" aria-hidden />
        <ul
          ref={listRef}
          className="due-wheel-list"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={0}
          onScroll={onScroll}
          data-lenis-prevent
        >
          {Array.from({ length: PAD }).map((_, i) => (
            <li key={`pad-t-${i}`} className="due-wheel-item spacer" aria-hidden />
          ))}
          {items.map((item, i) => (
            <li
              key={`${ariaLabel}-${typeof item === "object" ? item.key ?? i : item}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              className={`due-wheel-item ${i === selectedIndex ? "selected" : ""}`}
              onClick={() => {
                skip.current = true;
                onSelect(i);
                scrollToIndex(i);
              }}
            >
              {format(item)}
            </li>
          ))}
          {Array.from({ length: PAD }).map((_, i) => (
            <li key={`pad-b-${i}`} className="due-wheel-item spacer" aria-hidden />
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * value: "YYYY-MM-DD" or ""
 * time: "HH:mm" or "" (only used when advanced time is on)
 */
export default function DueDateScroller({
  value = "",
  time = "",
  onChange,
  id = "due-date-scroller",
}) {
  const now = useMemo(() => new Date(), []);
  const today = useMemo(() => startOfDay(now), [now]);
  const [showTime, setShowTime] = useState(Boolean(time));

  const parsed = parseDate(value || toKey(today.getFullYear(), today.getMonth(), today.getDate()), today);
  const hasDate = Boolean(value);

  const years = useMemo(() => {
    const y0 = today.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y0 + i);
  }, [today]);

  const year = years.includes(parsed.year) ? parsed.year : years[0];

  const months = useMemo(() => {
    const start = year === today.getFullYear() ? today.getMonth() : 0;
    return Array.from({ length: 12 - start }, (_, i) => {
      const m = start + i;
      return {
        m,
        key: m,
        label: new Date(2000, m, 1).toLocaleString(undefined, { month: "short" }),
      };
    });
  }, [year, today]);

  const month = months.some((x) => x.m === parsed.month)
    ? parsed.month
    : months[0]?.m ?? today.getMonth();

  const dayStart =
    year === today.getFullYear() && month === today.getMonth() ? today.getDate() : 1;
  const dim = daysInMonth(year, month);
  const dayItems = useMemo(
    () => Array.from({ length: dim - dayStart + 1 }, (_, i) => dayStart + i),
    [dim, dayStart]
  );
  const day = dayItems.includes(parsed.day) ? parsed.day : dayItems[0];

  const emitDate = (y, m, d, nextTime = time) => {
    const safe = clampFutureDate(y, m, d, today);
    const key = toKey(safe.year, safe.month, safe.day);
    let t = nextTime;
    if (showTime && t) {
      const clamped = clampFutureTime(key, ...t.split(":").map(Number), now);
      t = clamped.label;
    } else if (!showTime) {
      t = "";
    }
    onChange?.({ date: key, time: t });
  };

  const clear = () => {
    setShowTime(false);
    onChange?.({ date: "", time: "" });
  };

  const setQuick = (offsetDays) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offsetDays);
    emitDate(d.getFullYear(), d.getMonth(), d.getDate(), showTime ? time || "12:00" : "");
  };

  const yearIndex = Math.max(0, years.indexOf(year));
  const monthIndex = Math.max(0, months.findIndex((x) => x.m === month));
  const dayIndex = Math.max(0, dayItems.indexOf(day));

  const { hour, minute } = parseTime(time, 12, 0);
  const timeClamped = showTime
    ? clampFutureTime(value || toKey(year, month, day), hour, minute, now)
    : null;

  const hourItems = useMemo(() => {
    const dateKey = value || toKey(year, month, day);
    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
    const startH = dateKey === todayKey ? now.getHours() : 0;
    return Array.from({ length: 24 - startH }, (_, i) => startH + i);
  }, [value, year, month, day, today, now]);

  const minuteItems = useMemo(() => {
    const dateKey = value || toKey(year, month, day);
    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
    const h = timeClamped?.hour ?? 12;
    let start = 0;
    if (dateKey === todayKey && h === now.getHours()) {
      start = Math.ceil((now.getMinutes() + 1) / 5) * 5;
      if (start > 55) return [55];
    }
    const list = [];
    for (let m = start; m < 60; m += 5) list.push(m);
    return list.length ? list : [0];
  }, [value, year, month, day, today, now, timeClamped?.hour]);

  const hourIndex = Math.max(0, hourItems.indexOf(timeClamped?.hour ?? hourItems[0]));
  const minuteIndex = Math.max(0, minuteItems.indexOf(timeClamped?.minute ?? minuteItems[0]));

  return (
    <div className="due-scroller" id={id} data-lenis-prevent>
      <div className="due-scroller-quick">
        <button
          type="button"
          className={`due-chip ${!hasDate ? "active" : ""}`}
          onClick={clear}
        >
          None
        </button>
        <button type="button" className="due-chip" onClick={() => setQuick(0)}>
          Today
        </button>
        <button type="button" className="due-chip" onClick={() => setQuick(1)}>
          Tomorrow
        </button>
        <button type="button" className="due-chip" onClick={() => setQuick(7)}>
          +1 week
        </button>
      </div>

      {hasDate ? (
        <>
          <div className="due-wheels" data-lenis-prevent>
            <WheelColumn
              ariaLabel="Month"
              items={months}
              selectedIndex={monthIndex}
              format={(item) => item.label}
              onSelect={(i) => emitDate(year, months[i].m, day)}
            />
            <WheelColumn
              ariaLabel="Day"
              large
              items={dayItems}
              selectedIndex={dayIndex}
              format={(n) => String(n).padStart(2, "0")}
              onSelect={(i) => emitDate(year, month, dayItems[i])}
            />
            <WheelColumn
              ariaLabel="Year"
              items={years}
              selectedIndex={yearIndex}
              onSelect={(i) => emitDate(years[i], month, day)}
            />
          </div>

          <button
            type="button"
            className="due-advanced-toggle"
            onClick={() => {
              const next = !showTime;
              setShowTime(next);
              if (next) {
                const t = clampFutureTime(value, 12, 0, now);
                onChange?.({ date: value, time: t.label });
              } else {
                onChange?.({ date: value, time: "" });
              }
            }}
          >
            {showTime ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Advanced · time
          </button>

          {showTime && (
            <div className="due-wheels due-wheels-time" data-lenis-prevent>
              <WheelColumn
                ariaLabel="Hour"
                items={hourItems}
                selectedIndex={hourIndex}
                format={(n) => String(n).padStart(2, "0")}
                onSelect={(i) => {
                  const h = hourItems[i];
                  const t = clampFutureTime(value, h, timeClamped?.minute ?? 0, now);
                  onChange?.({ date: value, time: t.label });
                }}
              />
              <div className="due-time-sep" aria-hidden>
                :
              </div>
              <WheelColumn
                ariaLabel="Minute"
                items={minuteItems}
                selectedIndex={minuteIndex}
                format={(n) => String(n).padStart(2, "0")}
                onSelect={(i) => {
                  const m = minuteItems[i];
                  const t = clampFutureTime(value, timeClamped?.hour ?? hourItems[0], m, now);
                  onChange?.({ date: value, time: t.label });
                }}
              />
            </div>
          )}

          <p className="due-scroller-selected">
            Due{" "}
            {new Date(`${value}T${time || "12:00"}:00`).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              ...(time
                ? { hour: "2-digit", minute: "2-digit" }
                : {}),
            })}
          </p>
        </>
      ) : (
        <p className="due-scroller-selected muted">No due date</p>
      )}
    </div>
  );
}
