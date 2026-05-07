import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, ArrowLeft, UserPlus, Trash2, Calendar, User } from "lucide-react";
import Navbar from "../components/Navbar";
import CreateTaskModal from "../components/CreateTaskModal";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const COLUMNS = [
  { id: "TODO",        label: "[ TODO ]",        colorClass: "tag-todo"   },
  { id: "IN_PROGRESS", label: "[ IN PROGRESS ]",  colorClass: "tag-inprog" },
  { id: "DONE",        label: "[ DONE ]",         colorClass: "tag-done"   },
];

// ── Task Card ──────────────────────────────────────────────
function TaskCard({ task, index, isAdmin, currentUserId, onStatusChange, onDelete }) {
  const isAssigned = task.assignedTo?.id === currentUserId;
  const canMove = isAdmin || isAssigned;

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null;

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canMove}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card ${snapshot.isDragging ? "dragging" : ""}`}
          id={`task-${task.id}`}
        >
          <div className="task-card-title">{task.title}</div>
          <div className="task-card-meta">
            {task.assignedTo && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <User size={9} />
                {task.assignedTo.username}
              </span>
            )}
            {task.dueDate && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <Calendar size={9} />
                {fmt(task.dueDate)}
              </span>
            )}
          </div>

          {isAdmin && (
            <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onDelete(task.id)}
                title="Delete task"
              >
                <Trash2 size={10} />
              </button>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

// ── Admin Sidebar ──────────────────────────────────────────
function AdminSidebar({ projectId, members, onMemberAdded, onMemberRemoved, currentUserId }) {
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteLoading(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/members`, { username: inviteUsername });
      onMemberAdded(data.data);
      setInviteUsername("");
    } catch (err) {
      setInviteError(err.response?.data?.message || "Failed to invite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = async (userId) => {
    if (!window.confirm("Remove this member?")) return;
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      onMemberRemoved(userId);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to remove.");
    }
  };

  return (
    <div className="sidebar">
      {/* Invite section */}
      <div>
        <p className="label" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <UserPlus size={11} /> Invite Member
        </p>
        <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input
            id="invite-username"
            className="input"
            placeholder="username"
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            required
          />
          {inviteError && <div className="error-msg">{inviteError}</div>}
          <button id="invite-submit" type="submit" className="btn" disabled={inviteLoading}>
            {inviteLoading ? "Inviting..." : "[ Invite ]"}
          </button>
        </form>
      </div>

      <hr className="divider" />

      {/* Member list */}
      <div>
        <p className="label" style={{ marginBottom: "0.75rem" }}>Team</p>
        {members.map((m) => (
          <div key={m.user.id} className="member-row">
            <div>
              <span style={{ display: "block" }}>{m.user.username}</span>
              <span className={`tag ${m.role === "ADMIN" ? "tag-admin" : "tag-member"}`}>{m.role}</span>
            </div>
            {m.user.id !== currentUserId && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleRemove(m.user.id)}
                title="Remove member"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Project / Kanban Page ──────────────────────────────────
export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const isAdmin = myRole === "ADMIN";

  // Fetch project data
  useEffect(() => {
    api.get(`/projects/${projectId}`)
      .then(({ data }) => {
        setProject(data.data);
        setTasks(data.data.tasks || []);
        setMembers(data.data.members || []);
        setMyRole(data.data.myRole);
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Group tasks by column
  const grouped = useCallback(() => {
    return COLUMNS.reduce((acc, col) => {
      acc[col.id] = tasks.filter((t) => t.status === col.id);
      return acc;
    }, {});
  }, [tasks]);

  // Drag end handler
  const onDragEnd = async ({ source, destination, draggableId }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.id === draggableId ? { ...t, status: newStatus } : t)
    );

    try {
      await api.patch(`/projects/${projectId}/tasks/${draggableId}/status`, { status: newStatus });
    } catch (err) {
      // Rollback
      setTasks((prev) =>
        prev.map((t) => t.id === draggableId ? { ...t, status: source.droppableId } : t)
      );
      alert(err.response?.data?.message || "Failed to update status.");
    }
  };

  const handleTaskCreated = (task) => setTasks((prev) => [task, ...prev]);

  const handleTaskDelete = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete.");
    }
  };

  const handleMemberAdded = (m) => setMembers((prev) => [...prev, m]);
  const handleMemberRemoved = (userId) => setMembers((prev) => prev.filter((m) => m.user.id !== userId));

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "3rem 1.5rem" }}>
          <div className="spinner" />
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "var(--text-muted)" }}>
            Loading board...
          </span>
        </div>
      </>
    );
  }

  const cols = grouped();

  return (
    <>
      <Navbar />
      <div className="project-layout">
        {/* Admin sidebar */}
        {isAdmin && (
          <AdminSidebar
            projectId={projectId}
            members={members}
            onMemberAdded={handleMemberAdded}
            onMemberRemoved={handleMemberRemoved}
            currentUserId={user.id}
          />
        )}

        {/* Main area */}
        <div className="project-main">
          {/* Board header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                id="back-btn"
                className="btn btn-sm"
                onClick={() => navigate("/")}
                style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <ArrowLeft size={11} /> Back
              </button>
              <div>
                <h1 style={{ fontSize: "0.95rem" }}>{project?.title}</h1>
                {project?.description && (
                  <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className={`tag ${isAdmin ? "tag-admin" : "tag-member"}`}>{myRole}</span>
              {isAdmin && (
                <button
                  id="new-task-btn"
                  className="btn btn-solid"
                  onClick={() => setShowTaskModal(true)}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Plus size={12} /> New Task
                </button>
              )}
            </div>
          </div>

          {/* Member chips for non-admin */}
          {!isAdmin && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              {members.map((m) => (
                <span key={m.user.id} className="tag tag-member">{m.user.username}</span>
              ))}
            </div>
          )}

          {/* Kanban board */}
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="kanban-board">
              {COLUMNS.map((col) => (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      className="kanban-col"
                      style={{
                        borderColor: snapshot.isDraggingOver ? "var(--border-hi)" : undefined,
                        transition: "border-color 80ms",
                      }}
                    >
                      <div className="kanban-col-header">
                        <span className={`tag ${col.colorClass}`} style={{ border: "none", padding: 0 }}>
                          {col.label}
                        </span>
                        <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "var(--text-muted)" }}>
                          {cols[col.id].length}
                        </span>
                      </div>

                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="kanban-col-body"
                      >
                        {cols[col.id].length === 0 && !snapshot.isDraggingOver && (
                          <div className="empty-state" style={{ fontSize: "0.6rem", padding: "1rem" }}>
                            empty
                          </div>
                        )}
                        {cols[col.id].map((task, index) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            index={index}
                            isAdmin={isAdmin}
                            currentUserId={user.id}
                            onStatusChange={() => {}}
                            onDelete={handleTaskDelete}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal
          projectId={projectId}
          members={members}
          onClose={() => setShowTaskModal(false)}
          onCreated={handleTaskCreated}
        />
      )}
    </>
  );
}
