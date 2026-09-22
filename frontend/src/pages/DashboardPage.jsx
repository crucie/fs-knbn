import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Trash2, LogOut } from "lucide-react";
import Navbar from "../components/Navbar";
import CreateProjectModal from "../components/CreateProjectModal";
import api from "../lib/api";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    api.get("/projects")
      .then(({ data }) => setProjects(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreated = (project) => {
    setProjects((prev) => [
      { ...project, myRole: "ADMIN", _count: { tasks: 0 }, members: [] },
      ...prev,
    ]);
  };

  const handleDelete = async (e, projectId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project and all its tasks?")) return;
    try {
      await api.delete(`/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete project.");
    }
  };

  const handleLeave = async (e, projectId) => {
    e.stopPropagation();
    if (!window.confirm("Leave this project?")) return;
    try {
      await api.post(`/projects/${projectId}/leave`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to leave project.");
    }
  };

  return (
    <>
      <Navbar />
      <div className="page-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.35rem" }}>// Dashboard</h1>
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {projects.length} project{projects.length !== 1 ? "s" : ""} — select one to open the board
            </p>
          </div>
          <button
            id="new-project-btn"
            className="btn btn-solid"
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={15} />
            New Project
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem 0" }}>
            <div className="spinner" />
            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "var(--text-muted)" }}>
              Loading projects...
            </span>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            No projects yet. Create one to get started.
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div
                key={p.id}
                id={`project-card-${p.id}`}
                className="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/projects/${p.id}`)}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <FolderOpen size={20} strokeWidth={2} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span className={`tag ${p.myRole === "ADMIN" ? "tag-admin" : "tag-member"}`}>
                    {p.myRole}
                  </span>
                </div>

                <div className="project-card-title">{p.title}</div>

                {p.description && (
                  <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                    {p.description.slice(0, 80)}{p.description.length > 80 ? "…" : ""}
                  </p>
                )}

                <div className="project-card-meta" style={{ display: "flex", gap: "1rem", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", gap: "1rem" }}>
                    <span>{p._count?.tasks ?? 0} tasks</span>
                    <span>{p.members?.length ?? 0} members</span>
                  </span>
                  {p.myRole === "ADMIN" ? (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDelete(e, p.id)}
                      title="Delete project"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={(e) => handleLeave(e, p.id)}
                      title="Leave project"
                    >
                      <LogOut size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateProjectModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
