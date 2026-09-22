import { useMemo } from "react";

export default function DashboardView({ tasks, columns, members, onOpenTask }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const byColumn = columns.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      count: tasks.filter((t) => t.columnId === c.id).length,
    }));
    const overdue = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() < now
    );
    const dueSoon = tasks.filter((t) => {
      if (!t.dueDate) return false;
      const tms = new Date(t.dueDate).getTime();
      return tms >= now && tms <= now + 7 * 86400000;
    });
    const unassigned = tasks.filter((t) => !t.assignedToId && !t.assignedTo);
    const withDue = tasks.filter((t) => t.dueDate).length;
    const byAssignee = {};
    for (const t of tasks) {
      const key = t.assignedTo?.username || "Unassigned";
      byAssignee[key] = (byAssignee[key] || 0) + 1;
    }
    const assigneeRows = Object.entries(byAssignee)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const checklist = tasks.reduce(
      (acc, t) => {
        const p = t.checklistProgress || { done: 0, total: 0 };
        acc.done += p.done;
        acc.total += p.total;
        return acc;
      },
      { done: 0, total: 0 }
    );

    return {
      total: tasks.length,
      byColumn,
      overdue,
      dueSoon,
      unassigned,
      withDue,
      assigneeRows,
      checklist,
    };
  }, [tasks, columns]);

  const maxCol = Math.max(1, ...stats.byColumn.map((c) => c.count));

  return (
    <div className="view-dashboard">
      <div className="dash-kpis">
        <div className="dash-kpi">
          <span className="dash-kpi-label">Total cards</span>
          <span className="dash-kpi-value">{stats.total}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">With due date</span>
          <span className="dash-kpi-value">{stats.withDue}</span>
        </div>
        <div className="dash-kpi warn">
          <span className="dash-kpi-label">Overdue</span>
          <span className="dash-kpi-value">{stats.overdue.length}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Due in 7 days</span>
          <span className="dash-kpi-value">{stats.dueSoon.length}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Unassigned</span>
          <span className="dash-kpi-value">{stats.unassigned.length}</span>
        </div>
        <div className="dash-kpi">
          <span className="dash-kpi-label">Checklist items</span>
          <span className="dash-kpi-value">
            {stats.checklist.total
              ? `${stats.checklist.done}/${stats.checklist.total}`
              : "—"}
          </span>
        </div>
      </div>

      <div className="dash-grid">
        <section className="dash-panel">
          <h3 className="view-title">By column</h3>
          <div className="dash-bars">
            {stats.byColumn.map((c) => (
              <div key={c.id} className="dash-bar-row">
                <span className="dash-bar-label">{c.name}</span>
                <div className="dash-bar-track">
                  <div
                    className="dash-bar-fill"
                    style={{
                      width: `${(c.count / maxCol) * 100}%`,
                      background: c.color || "#888",
                    }}
                  />
                </div>
                <span className="dash-bar-count">{c.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-panel">
          <h3 className="view-title">By assignee</h3>
          <div className="dash-bars">
            {stats.assigneeRows.map((r) => (
              <div key={r.name} className="dash-bar-row">
                <span className="dash-bar-label">
                  {r.name === "Unassigned" ? r.name : `@${r.name}`}
                </span>
                <div className="dash-bar-track">
                  <div
                    className="dash-bar-fill"
                    style={{
                      width: `${(r.count / Math.max(1, stats.total)) * 100}%`,
                      background: "#aab4ff",
                    }}
                  />
                </div>
                <span className="dash-bar-count">{r.count}</span>
              </div>
            ))}
            {stats.assigneeRows.length === 0 && (
              <div className="empty-state" style={{ padding: "1rem" }}>No cards yet.</div>
            )}
          </div>
        </section>

        <section className="dash-panel">
          <h3 className="view-title">Overdue</h3>
          <ul className="dash-list">
            {stats.overdue.length === 0 && (
              <li className="view-footnote">None overdue.</li>
            )}
            {stats.overdue.slice(0, 12).map((t) => (
              <li key={t.id}>
                <button type="button" className="dash-link" onClick={() => onOpenTask(t)}>
                  {t.title}
                </button>
                <span className="view-footnote">
                  {new Date(t.dueDate).toLocaleDateString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="dash-panel">
          <h3 className="view-title">Due soon</h3>
          <ul className="dash-list">
            {stats.dueSoon.length === 0 && (
              <li className="view-footnote">Nothing due in the next 7 days.</li>
            )}
            {stats.dueSoon.slice(0, 12).map((t) => (
              <li key={t.id}>
                <button type="button" className="dash-link" onClick={() => onOpenTask(t)}>
                  {t.title}
                </button>
                <span className="view-footnote">
                  {new Date(t.dueDate).toLocaleDateString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
