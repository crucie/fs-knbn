import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAY_MS = 86400000;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function TimelineView({ tasks, columns, onOpenTask }) {
  const [rangeStart, setRangeStart] = useState(() => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 7);
    return d;
  });
  const days = 42;

  const rangeEnd = useMemo(() => addDays(rangeStart, days - 1), [rangeStart, days]);

  const dayHeaders = useMemo(() => {
    return Array.from({ length: days }, (_, i) => addDays(rangeStart, i));
  }, [rangeStart, days]);

  const rows = useMemo(() => {
    return tasks
      .filter((t) => t.dueDate || t.createdAt)
      .map((t) => {
        const end = startOfDay(new Date(t.dueDate || t.createdAt));
        const start = t.dueDate
          ? addDays(end, -Math.min(5, Math.max(1, 3)))
          : startOfDay(new Date(t.createdAt));
        return { task: t, start, end };
      })
      .sort((a, b) => a.start - b.start);
  }, [tasks]);

  const today = startOfDay(new Date());

  const barStyle = (start, end) => {
    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime() + DAY_MS;
    const s = Math.max(start.getTime(), rs);
    const e = Math.min(end.getTime() + DAY_MS, re);
    if (e <= rs || s >= re) return null;
    const left = ((s - rs) / (re - rs)) * 100;
    const width = Math.max(((e - s) / (re - rs)) * 100, 1.2);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <div className="view-timeline">
      <div className="view-toolbar">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setRangeStart(addDays(rangeStart, -14))}
        >
          <ChevronLeft size={14} />
        </button>
        <h2 className="view-title">
          {rangeStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          {" — "}
          {rangeEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </h2>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setRangeStart(addDays(rangeStart, 14))}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const d = startOfDay(new Date());
            d.setDate(d.getDate() - 7);
            setRangeStart(d);
          }}
        >
          This window
        </button>
      </div>

      <div className="timeline-scroll">
        <div className="timeline-header">
          <div className="timeline-label-col">Card</div>
          <div className="timeline-track-head">
            {dayHeaders.map((d) => (
              <div
                key={d.toISOString()}
                className={`timeline-dayhead ${d.getTime() === today.getTime() ? "today" : ""}`}
              >
                <span>{d.getDate()}</span>
                <small>{d.toLocaleDateString("en-GB", { weekday: "narrow" })}</small>
              </div>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">No dated cards to show on the timeline.</div>
        ) : (
          rows.map(({ task, start, end }) => {
            const style = barStyle(start, end);
            const col = columns.find((c) => c.id === task.columnId);
            return (
              <div key={task.id} className="timeline-row">
                <button
                  type="button"
                  className="timeline-label-col timeline-card-name"
                  onClick={() => onOpenTask(task)}
                >
                  {task.title}
                </button>
                <div className="timeline-track">
                  {style && (
                    <button
                      type="button"
                      className="timeline-bar"
                      style={{
                        ...style,
                        background: col?.color || "#888888",
                      }}
                      onClick={() => onOpenTask(task)}
                      title={`${task.title} · ${col?.name || ""}`}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="view-footnote">
        Bars use due date (or created date if no due). Length is a short span ending on that day.
      </p>
    </div>
  );
}
