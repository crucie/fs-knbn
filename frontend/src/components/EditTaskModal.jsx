import { useState } from "react";
import { X } from "lucide-react";
import api from "../lib/api";

export default function EditTaskModal({ projectId, task, members, columns, onClose, onUpdated }) {
  const [form, setForm] = useState({
    title: task.title || "",
    assignedToId: task.assignedTo?.id || "",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
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
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
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
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
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
          </div>

          <div className="field">
            <label className="label">Assign To</label>
            <select
              id="edit-task-assignee"
              className="select"
              value={form.assignedToId}
              onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}
            >
              <option value="">-- Unassigned --</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.username} [{m.role}]
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">Due Date</label>
            <input
              id="edit-task-due"
              className="input"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button id="edit-task-submit" type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? "Saving..." : "[ Save ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
