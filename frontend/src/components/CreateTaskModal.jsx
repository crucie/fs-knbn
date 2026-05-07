import { useState } from "react";
import { X } from "lucide-react";
import api from "../lib/api";

export default function CreateTaskModal({ projectId, members, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", assignedToId: "", dueDate: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        ...(form.assignedToId && { assignedToId: form.assignedToId }),
        ...(form.dueDate && { dueDate: new Date(form.dueDate).toISOString() }),
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
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>// New Task</span>
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
            <select
              id="task-assignee"
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
              id="task-due"
              className="input"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button id="create-task-submit" type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? "Creating..." : "[ Add Task ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
