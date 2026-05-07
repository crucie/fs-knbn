import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Clock } from "lucide-react";
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
    setProjects((prev) => [{ ...project, myRole: "ADMIN", _count: { tasks: 0 }, members: [] }, ...prev]);
  };

  return (
    <>
      <Navbar />
      <div className="page-body">
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>// Dashboard</h1>
            <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "var(--text-muted)" }}>
              {projects.length} project{projects.length !== 1 ? "s" : ""} — select one to open the board
            </p>
          </div>
          <button
            id="new-project-btn"
            className="btn btn-solid"
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={12} />
            New Project
          </button>
        </div>

        {/* Project grid */}
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
                  <FolderOpen size={16} strokeWidth={2} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span className={`tag ${p.myRole === "ADMIN" ? "tag-admin" : "tag-member"}`}>
                    {p.myRole}
                  </span>
                </div>

                <div className="project-card-title">{p.title}</div>

                {p.description && (
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
                    {p.description.slice(0, 80)}{p.description.length > 80 ? "…" : ""}
                  </p>
                )}

                <div className="project-card-meta" style={{ display: "flex", gap: "1rem", marginTop: "auto" }}>
                  <span>{p._count?.tasks ?? 0} tasks</span>
                  <span>{p.members?.length ?? 0} members</span>
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
