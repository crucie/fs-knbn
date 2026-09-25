import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import api from "../lib/api";
import DueDateScroller from "./DueDateScroller";

export default function CreateTaskModal({
  projectId,
  members,
  columns,
  defaultColumnId,
  onClose,
  onCreated,
}) {
  const columnId = defaultColumnId || columns[0]?.id || "";
  const columnName = columns.find((c) => c.id === columnId)?.name;
  const [form, setForm] = useState({
    title: "",
    assignedToId: "",
    dueDate: "",
    dueTime: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!columnId) {
      setError("No column selected.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        columnId,
        ...(form.assignedToId && { assignedToId: form.assignedToId }),
        ...(form.dueDate && {
          dueDate: new Date(
            `${form.dueDate}T${form.dueTime || "12:00"}:00`
          ).toISOString(),
        }),
      };
      const { data } = await api.post(`/projects/${projectId}/tasks`, payload);
      onCreated(data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-due" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>// New Task{columnName ? ` · ${columnName}` : ""}</span>
          <button className="btn btn-sm" onClick={onClose} id="close-create-task">
            <X size={12} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="field">
            <label className="label">Task Title *</label>
            <input
              id="task-title"
              className="input"
              placeholder="Implement feature X"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label">Assign To</label>
            <div className="select-wrap">
              <select
                id="task-assignee"
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
            <label className="label" htmlFor="task-due">Due Date</label>
            <DueDateScroller
              id="task-due"
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
            <button id="create-task-submit" type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? "Creating..." : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
