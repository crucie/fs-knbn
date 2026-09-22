import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Monday-based weekday index 0..6 */
function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function CalendarView({ tasks, onOpenTask }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = dayKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

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

  const label = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const today = new Date();

  return (
    <div className="view-calendar">
      <div className="view-toolbar">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          <ChevronLeft size={14} />
        </button>
        <h2 className="view-title">{label}</h2>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          <ChevronRight size={14} />
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setCursor(startOfMonth(new Date()))}>
          Today
        </button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`e-${i}`} className="cal-cell empty" />;
          }
          const items = byDay[dayKey(date)] || [];
          return (
            <div
              key={dayKey(date)}
              className={`cal-cell ${sameDay(date, today) ? "today" : ""}`}
            >
              <div className="cal-daynum">{date.getDate()}</div>
              <div className="cal-events">
                {items.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="cal-event"
                    style={{ borderLeftColor: t.column?.color || "#888" }}
                    onClick={() => onOpenTask(t)}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
                {items.length > 4 && (
                  <span className="cal-more">+{items.length - 4} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="view-footnote">
        Showing cards with due dates. Cards without a due date are hidden here.
      </p>
    </div>
  );
}
