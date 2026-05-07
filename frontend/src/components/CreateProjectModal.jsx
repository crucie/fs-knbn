import { useState } from "react";
import { X } from "lucide-react";
import api from "../lib/api";

export default function CreateProjectModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/projects", form);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create project.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>// New Project</span>
          <button className="btn btn-sm" onClick={onClose} id="close-create-project">
            <X size={12} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="field">
            <label className="label">Project Title *</label>
            <input
              id="project-title"
              className="input"
              placeholder="My Project"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label">Description</label>
            <textarea
              id="project-description"
              className="input"
              placeholder="What's this project about?"
              rows={3}
              style={{ resize: "vertical" }}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button id="create-project-submit" type="submit" className="btn btn-solid" disabled={loading}>
              {loading ? "Creating..." : "[ Create ]"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
