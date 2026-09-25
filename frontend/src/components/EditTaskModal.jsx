import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import api from "../lib/api";
import DueDateScroller from "./DueDateScroller";

function splitDue(iso) {
  if (!iso) return { dueDate: "", dueTime: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dueDate: "", dueTime: "" };
  const dueDate = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  // Noon was the old date-only default — treat as no time
  const exactNoon = d.getHours() === 12 && d.getMinutes() === 0 && d.getSeconds() === 0;
  if (exactNoon) return { dueDate, dueTime: "" };
  return {
    dueDate,
    dueTime: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

export default function EditTaskModal({ projectId, task, members, columns, onClose, onUpdated }) {
  const initial = splitDue(task.dueDate);
  const [form, setForm] = useState({
    title: task.title || "",
    assignedToId: task.assignedTo?.id || "",
    dueDate: initial.dueDate,
    dueTime: initial.dueTime,
    columnId: task.columnId || task.column?.id || columns[0]?.id || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        assignedToId: form.assignedToId || null,
        dueDate: form.dueDate
          ? new Date(`${form.dueDate}T${form.dueTime || "12:00"}:00`).toISOString()
          : null,
        columnId: form.columnId,
      };
      const { data } = await api.patch(`/projects/${projectId}/tasks/${task.id}`, payload);
      onUpdated(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-due" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>// Edit Task</span>
          <button className="btn btn-sm" onClick={onClose} id="close-edit-task">
            <X size={12} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="field">
            <label className="label">Task Title *</label>
            <input
              id="edit-task-title"
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label">Column</label>
            <div className="select-wrap">
              <select
                id="edit-task-column"
                className="select"
                value={form.columnId}
                onChange={(e) => setForm((f) => ({ ...f, columnId: e.target.value }))}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown size={16} className="select-chevron" aria-hidden />
            </div>
          </div>

          <div className="field">
            <label className="label">Assign To</label>
            <div className="select-wrap">
              <select
                id="edit-task-assignee"
                className="select"
                value={form.assignedToId}
                onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.username} [{m.role}]
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="select-chevron" aria-hidden />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="edit-task-due">Due Date</label>
            <DueDateScroller
              id="edit-task-due"
              value={form.dueDate}
              time={form.dueTime}
              onChange={({ date, time }) =>
                setForm((f) => ({ ...f, dueDate: date, dueTime: time || "" }))
              }
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button id="edit-task-submit" type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
