import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen } from "lucide-react";
import Navbar from "../components/Navbar";
import CreateProjectModal from "../components/CreateProjectModal";
import { cachedGet, cachePeek, cacheInvalidate, prefetchProject } from "../lib/queryCache";
import api from "../lib/api";
import { isOwner } from "../lib/roles";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem("activeWorkspaceId") || "");
  const [projects, setProjects] = useState(() => {
    const hit = cachePeek("/projects");
    return hit?.data?.data || [];
  });
  const [loading, setLoading] = useState(() => !cachePeek("/projects"));
  const [showModal, setShowModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");

  useEffect(() => {
    let alive = true;
    api.get("/workspaces")
      .then(({ data }) => {
        if (!alive) return;
        const list = data.data || [];
        setWorkspaces(list);
        if (!workspaceId && list[0]) {
          setWorkspaceId(list[0].id);
          localStorage.setItem("activeWorkspaceId", list[0].id);
        }
      })
      .catch(console.error);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const load = workspaceId
      ? api.get(`/workspaces/${workspaceId}/projects`)
      : cachedGet("/projects");
    load
      .then(({ data }) => {
        if (alive) setProjects(data.data || []);
      })
      .catch(() =>
        api.get("/projects").then(({ data }) => {
          if (alive) setProjects(data.data || []);
        })
      )
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [workspaceId]);

  const handleCreated = (project) => {
    cacheInvalidate("/projects");
    setProjects((prev) => [
      { ...project, myRole: "OWNER", _count: { tasks: 0 }, members: [] },
      ...prev,
    ]);
  };

  const createWorkspace = async () => {
    if (!newWsName.trim()) return;
    try {
      const { data } = await api.post("/workspaces", { name: newWsName.trim() });
      setWorkspaces((prev) => [...prev, data.data]);
      setWorkspaceId(data.data.id);
      localStorage.setItem("activeWorkspaceId", data.data.id);
      setNewWsName("");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <Navbar />
      <div className="page-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.35rem" }}>// Dashboard</h1>
            <p style={{ fontFamily: "var(--font)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
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

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              localStorage.setItem("activeWorkspaceId", e.target.value);
            }}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <input
            className="input"
            style={{ maxWidth: 180 }}
            placeholder="New workspace"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
          />
          <button type="button" className="btn btn-sm" onClick={createWorkspace}>Add</button>
        </div>

        {loading && projects.length === 0 ? (
          <div className="skeleton-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">No projects yet. Create one to get started.</div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <div
                key={p.id}
                id={`project-card-${p.id}`}
                className="project-card"
                onClick={() => navigate(`/projects/${p.id}`)}
                onMouseEnter={() => prefetchProject(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/projects/${p.id}`)}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <FolderOpen size={20} strokeWidth={2} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span className={`tag ${isOwner(p.myRole) ? "tag-admin" : "tag-member"}`}>
                    {p.myRole}
                  </span>
                </div>
                <div className="project-card-title">{p.title}</div>
                {p.description && (
                  <p className="project-card-desc">
                    {p.description.slice(0, 80)}{p.description.length > 80 ? "…" : ""}
                  </p>
                )}
                <div className="project-card-meta" style={{ marginTop: "auto" }}>
                  <span style={{ display: "flex", gap: "1rem" }}>
                    <span>{p._count?.tasks ?? 0} tasks</span>
                    <span>{p.members?.length ?? 0} members</span>
                    {p.type === "GITHUB_LINKED" && <span>GitHub</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
          workspaces={workspaces}
          defaultWorkspaceId={workspaceId}
        />
      )}
    </>
  );
}
