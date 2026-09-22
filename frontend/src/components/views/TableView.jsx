import { useMemo, useState } from "react";

export default function TableView({ tasks, columns, onOpenTask }) {
  const [sortKey, setSortKey] = useState("dueDate");
  const [sortDir, setSortDir] = useState("asc");
  const [filterColumn, setFilterColumn] = useState("");
  const [query, setQuery] = useState("");

  const colName = (id) => columns.find((c) => c.id === id)?.name || "—";

  const rows = useMemo(() => {
    let list = [...tasks];
    if (filterColumn) list = list.filter((t) => t.columnId === filterColumn);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.assignedTo?.username || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let av;
      let bv;
      if (sortKey === "title") {
        av = a.title.toLowerCase();
        bv = b.title.toLowerCase();
      } else if (sortKey === "column") {
        av = colName(a.columnId).toLowerCase();
        bv = colName(b.columnId).toLowerCase();
      } else if (sortKey === "assignee") {
        av = (a.assignedTo?.username || "").toLowerCase();
        bv = (b.assignedTo?.username || "").toLowerCase();
      } else {
        av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [tasks, columns, sortKey, sortDir, filterColumn, query]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="view-table">
      <div className="view-toolbar">
        <input
          className="input"
          placeholder="Search title or assignee…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select
          className="select"
          value={filterColumn}
          onChange={(e) => setFilterColumn(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          <option value="">All columns</option>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="view-footnote" style={{ margin: 0 }}>{rows.length} cards</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort("title")}>Title {sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("column")}>Column {sortKey === "column" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("assignee")}>Assignee {sortKey === "assignee" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("dueDate")}>Due {sortKey === "dueDate" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th>Labels</th>
              <th>Checklist</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state" style={{ border: "none" }}>No cards match.</td>
              </tr>
            ) : (
              rows.map((t) => {
                const progress = t.checklistProgress || { done: 0, total: 0 };
                return (
                  <tr key={t.id} onClick={() => onOpenTask(t)} className="table-row-click">
                    <td className="table-title">{t.title}</td>
                    <td>
                      <span className="table-col-pill" style={{ borderColor: t.column?.color || "#888" }}>
                        {colName(t.columnId)}
                      </span>
                    </td>
                    <td>{t.assignedTo?.username ? `@${t.assignedTo.username}` : "—"}</td>
                    <td>{fmt(t.dueDate)}</td>
                    <td>
                      <div className="task-label-row" style={{ margin: 0 }}>
                        {(t.labels || []).map((l) => (
                          <span key={l.id} className="task-label-dot" style={{ background: l.color, minWidth: 24 }} title={l.name} />
                        ))}
                      </div>
                    </td>
                    <td>{progress.total ? `${progress.done}/${progress.total}` : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
