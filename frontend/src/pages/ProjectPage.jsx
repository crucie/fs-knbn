import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Plus, ArrowLeft, Trash2, Calendar, User, LogOut, PanelLeftOpen,
  MessageSquare, Paperclip, CheckSquare, Copy,
} from "lucide-react";
import Navbar from "../components/Navbar";
import CreateTaskModal from "../components/CreateTaskModal";
import CardDetailModal from "../components/CardDetailModal";
import ProjectSidebar from "../components/ProjectSidebar";
import TeamView from "../components/TeamView";
import ColorPicker from "../components/ColorPicker";
import CalendarView from "../components/views/CalendarView";
import TableView from "../components/views/TableView";
import TimelineView from "../components/views/TimelineView";
import DashboardView from "../components/views/DashboardView";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../context/DialogContext";
import { cachedGet, cachePeek, cacheInvalidate, prefetchTeam } from "../lib/queryCache";
import { isOwner, isMaintainer, canEditCards } from "../lib/roles";
import GithubPanel from "../components/GithubPanel";

function fmtDate(iso) {
  return iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    : null;
}

function TaskCardFace({ task, canEdit, onOpen, onDelete, interactive = true }) {
  const progress = task.checklistProgress || { done: 0, total: 0 };

  return (
    <>
      {(task.labels || []).length > 0 && (
        <div className="task-label-row">
          {task.labels.map((l) => (
            <span key={l.id} className="task-label-dot" style={{ background: l.color }} title={l.name} />
          ))}
        </div>
      )}
      <div className="task-card-row">
        <div className="task-card-title">
          {task.isMirror && <Copy size={12} className="task-mirror-icon" />}
          {task.title}
        </div>
        {interactive && canEdit && (
          <div className="task-card-actions">
            <button
              type="button"
              className="btn btn-sm btn-danger task-card-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(task.id);
              }}
              title="Delete task"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
      {task.bounty && task.bounty.status !== "DRAFT" && (
        <div className="task-bounty-chip">
          {task.bounty.amount} {task.bounty.tokenSymbol} · {task.bounty.status}
        </div>
      )}
      {task.githubClosedPending && (
        <div className="task-bounty-chip warn">GitHub closed — bounty pending</div>
      )}
      {(task.assignedTo || task.dueDate || progress.total > 0 || task._count?.comments > 0 || task._count?.attachments > 0) && (
        <div className="task-card-meta">
          {task.assignedTo && (
            <span>
              <User size={12} />
              {task.assignedTo.username}
            </span>
          )}
          {task.dueDate && (
            <span>
              <Calendar size={12} />
              {fmtDate(task.dueDate)}
            </span>
          )}
          {progress.total > 0 && (
            <span>
              <CheckSquare size={12} />
              {progress.done}/{progress.total}
            </span>
          )}
          {task._count?.comments > 0 && (
            <span>
              <MessageSquare size={12} />
              {task._count.comments}
            </span>
          )}
          {task._count?.attachments > 0 && (
            <span>
              <Paperclip size={12} />
              {task._count.attachments}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function TaskCard({ task, index, canEdit, currentUserId, onOpen, onDelete }) {
  const isAssigned =
    task.assignedTo?.id === currentUserId ||
    (task.assignees || []).some((a) => a.id === currentUserId);
  const canMove = canEdit || isAssigned;

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canMove}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card ${snapshot.isDragging ? "dragging is-source" : ""}`}
          id={`task-${task.id}`}
          onClick={() => !snapshot.isDragging && onOpen(task)}
          style={provided.draggableProps.style}
        >
          <TaskCardFace
            task={task}
            canEdit={canEdit}
            onOpen={onOpen}
            onDelete={onDelete}
            interactive={!snapshot.isDragging}
          />
        </div>
      )}
    </Draggable>
  );
}

const COL_WIDTH_MIN = 200;
const COL_WIDTH_MAX = 460;
const COL_WIDTH_DEFAULT = 250;

function loadColWidths(projectId) {
  try {
    const raw = localStorage.getItem(`colWidths:${projectId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hexToRgb(hex) {
  const h = (hex || "#888888").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 136, g: 136, b: 136 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function columnHeaderStyle(color) {
  const { r, g, b } = hexToRgb(color);
  const solid = `rgb(${r}, ${g}, ${b})`;
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.22)`,
    backgroundImage: `
      radial-gradient(circle at 1px 1px, rgba(255,255,255,0.16) 1px, transparent 0),
      linear-gradient(135deg,
        rgba(${r}, ${g}, ${b}, 0.72) 0%,
        rgba(${r}, ${g}, ${b}, 0.28) 48%,
        rgba(${r}, ${g}, ${b}, 0.12) 100%)
    `,
    backgroundSize: "9px 9px, 100% 100%",
    borderBottomColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
    boxShadow: `inset 0 -1px 0 rgba(${r}, ${g}, ${b}, 0.2)`,
    "--col-accent": solid,
  };
}

function ColumnHeader({
  column,
  taskCount,
  canManage,
  canDelete,
  onRename,
  onColor,
  onDelete,
  dragHandleProps,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const commitRename = async () => {
    const trimmed = name.trim();
    setEditing(false);
    if (!trimmed || trimmed === column.name) {
      setName(column.name);
      return;
    }
    await onRename(column.id, trimmed);
  };

  return (
    <div
      className={`kanban-col-header ${canManage ? "is-draggable" : ""}`}
      style={columnHeaderStyle(column.color)}
      {...(canManage ? dragHandleProps : {})}
    >
      <div className="kanban-col-header-inner">
        {editing && canManage ? (
          <input
            className="input col-rename-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(column.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="col-title-btn"
            onClick={() => canManage && setEditing(true)}
            title={canManage ? "Click to rename" : undefined}
          >
            {column.name}
          </button>
        )}
        <span className="col-count">{taskCount}</span>
      </div>

      {canManage && (
        <div className="col-actions">
          <ColorPicker
            value={column.color || "#888888"}
            onChange={(hex) => onColor(column.id, hex)}
            title="Column color"
          />
          {canDelete && (
            <button
              type="button"
              className="btn btn-sm btn-icon btn-icon-danger"
              onClick={() => onDelete(column.id)}
              title="Delete column"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { alert, confirm } = useDialog();

  const [project, setProject] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data || null);
  const [tasks, setTasks] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.tasks || []);
  const [columns, setColumns] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.columns || []);
  const [members, setMembers] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.members || []);
  const [myRole, setMyRole] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.myRole || null);
  const [loading, setLoading] = useState(() => !cachePeek(`/projects/${projectId}`));
  const [createColumnId, setCreateColumnId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [projectLabels, setProjectLabels] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.labels || []);
  const [customFields, setCustomFields] = useState(() => cachePeek(`/projects/${projectId}`)?.data?.data?.customFields || []);
  const [allProjects, setAllProjects] = useState(() => cachePeek("/projects")?.data?.data || []);
  const [boardView, setBoardViewState] = useState("board");
  const [teamMounted, setTeamMounted] = useState(false);
  const [colWidths, setColWidths] = useState(() => loadColWidths(projectId));

  const setBoardView = (view) => {
    setBoardViewState(view);
    if (view === "team") setTeamMounted(true);
    try {
      localStorage.setItem(`boardView:${projectId}`, view);
    } catch {
      /* ignore */
    }
  };

  const startColResize = (e, columnId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[columnId] || COL_WIDTH_DEFAULT;

    const onMove = (ev) => {
      const nextW = Math.min(
        COL_WIDTH_MAX,
        Math.max(COL_WIDTH_MIN, startW + (ev.clientX - startX))
      );
      setColWidths((prev) => ({ ...prev, [columnId]: nextW }));
    };

    const onUp = (ev) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const nextW = Math.min(
        COL_WIDTH_MAX,
        Math.max(COL_WIDTH_MIN, startW + (ev.clientX - startX))
      );
      setColWidths((prev) => {
        const next = { ...prev, [columnId]: nextW };
        try {
          localStorage.setItem(`colWidths:${projectId}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      document.body.classList.remove("col-resizing");
    };

    document.body.classList.add("col-resizing");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    try {
      const v = localStorage.getItem(`boardView:${projectId}`) || "board";
      setBoardViewState(v);
      if (v === "team") setTeamMounted(true);
    } catch {
      setBoardViewState("board");
    }
    setColWidths(loadColWidths(projectId));
    setTeamMounted(false);
  }, [projectId]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const canEdit = canEditCards(myRole);
  const canMaintain = isMaintainer(myRole);
  const owner = isOwner(myRole);
  const isAdmin = owner; // legacy alias for delete-project UI

  const renderTaskClone = useCallback(
    (provided, _snapshot, rubric) => {
      const task = tasks.find((t) => t.id === rubric.draggableId);
      if (!task) return null;
      return (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="task-card dragging task-card-clone"
          style={provided.draggableProps.style}
        >
          <TaskCardFace task={task} canEdit={canEdit} interactive={false} />
        </div>
      );
    },
    [tasks, canEdit]
  );

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    let alive = true;
    const apply = (data) => {
      if (!alive || !data) return;
      setProject(data);
      setTasks(data.tasks || []);
      setColumns(data.columns || []);
      setMembers(data.members || []);
      setMyRole(data.myRole);
      setProjectLabels(data.labels || []);
      setCustomFields(data.customFields || []);
      setLoading(false);
    };

    cachedGet(`/projects/${projectId}`)
      .then(({ data }) => {
        apply(data.data);
        prefetchTeam(projectId);
      })
      .catch(() => {
        if (alive) navigate("/");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    cachedGet("/projects")
      .then(({ data }) => {
        if (alive) setAllProjects(data.data || []);
      })
      .catch(() => {});

    // Warm team data immediately so opening Team has no wait
    prefetchTeam(projectId);

    return () => {
      alive = false;
    };
  }, [projectId, navigate]);

  const grouped = useCallback(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = tasks.filter((t) => t.columnId === col.id);
      return acc;
    }, {});
  }, [tasks, columns]);

  const onDragStart = () => {
    document.body.classList.add("board-dragging");
  };

  const onDragEnd = async ({ source, destination, draggableId, type }) => {
    document.body.classList.remove("board-dragging");
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (type === "COLUMN") {
      const next = Array.from(columns);
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      await persistOrder(next);
      return;
    }

    const newColumnId = destination.droppableId;
    const prevColumnId = source.droppableId;

    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, columnId: newColumnId } : t))
    );

    try {
      await api.patch(`/projects/${projectId}/tasks/${draggableId}/move`, { columnId: newColumnId });
    } catch (err) {
      setTasks((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, columnId: prevColumnId } : t))
      );
      await alert(err.response?.data?.message || "Failed to move task.");
    }
  };

  const handleTaskCreated = (task) => setTasks((prev) => [task, ...prev]);
  const handleTaskUpdated = (task) =>
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));

  const handleTaskDelete = async (taskId) => {
    const ok = await confirm("Delete this task?", {
      title: "Delete task",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to delete.");
    }
  };

  const handleRenameColumn = async (columnId, name) => {
    try {
      const { data } = await api.patch(`/projects/${projectId}/columns/${columnId}`, { name });
      setColumns((prev) => prev.map((c) => (c.id === columnId ? data.data : c)));
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to rename column.");
    }
  };

  const handleColorColumn = async (columnId, color) => {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, color } : c)));
    try {
      const { data } = await api.patch(`/projects/${projectId}/columns/${columnId}`, { color });
      setColumns((prev) => prev.map((c) => (c.id === columnId ? data.data : c)));
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to update color.");
    }
  };

  const handleDeleteColumn = async (columnId) => {
    const ok = await confirm("Delete this column? Tasks will move to another column.", {
      title: "Delete column",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/columns/${columnId}`);
      const { data } = await api.get(`/projects/${projectId}`);
      setColumns(data.data.columns || []);
      setTasks(data.data.tasks || []);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to delete column.");
    }
  };

  const persistOrder = async (nextColumns) => {
    setColumns(nextColumns);
    try {
      const { data } = await api.patch(`/projects/${projectId}/columns/reorder`, {
        columnIds: nextColumns.map((c) => c.id),
      });
      setColumns(data.data);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to reorder columns.");
      const { data } = await api.get(`/projects/${projectId}`);
      setColumns(data.data.columns || []);
    }
  };

  const handleAddColumn = async (e) => {
    e.preventDefault();
    const name = newColumnName.trim();
    if (!name) return;
    try {
      const { data } = await api.post(`/projects/${projectId}/columns`, { name });
      setColumns((prev) => [...prev, data.data]);
      setNewColumnName("");
      setAddingColumn(false);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to add column.");
    }
  };

  const handleDeleteProject = async () => {
    const ok = await confirm("Delete this project and all its tasks? This cannot be undone.", {
      title: "Delete project",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}`);
      navigate("/");
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to delete project.");
    }
  };

  const handleLeaveProject = async () => {
    const ok = await confirm("Leave this project?", {
      title: "Leave project",
      confirmLabel: "Leave",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/projects/${projectId}/leave`);
      navigate("/");
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to leave project.");
    }
  };

  if (loading && !project) {
    return (
      <>
        <Navbar />
        <div className="project-main" style={{ paddingTop: "1.25rem" }}>
          <div className="skeleton-board">
            <div className="skeleton-col" />
            <div className="skeleton-col" />
            <div className="skeleton-col" />
          </div>
        </div>
      </>
    );
  }

  if (!project) {
    return null;
  }

  const cols = grouped();

  return (
    <>
      <Navbar />
      <div className="project-layout">
        <ProjectSidebar
          activeView={boardView}
          onViewChange={setBoardView}
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className={`project-main ${boardView === "team" ? "project-main-team" : ""}`}>
          {boardView !== "team" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-sm sidebar-open-mobile"
                onClick={() => setMobileSidebarOpen(true)}
                title="Open project menu"
              >
                <PanelLeftOpen size={15} /> Menu
              </button>
              <button
                id="back-btn"
                type="button"
                className="btn btn-sm btn-icon"
                onClick={() => navigate("/")}
                title="Back to dashboard"
                aria-label="Back to dashboard"
              >
                <ArrowLeft size={15} />
              </button>
              <div>
                <h1 style={{ fontSize: "1.25rem" }}>{project?.title}</h1>
                {project?.description && (
                  <p style={{ fontFamily: "var(--font)", fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div className="project-toolbar-actions">
              <span className={`tag ${owner ? "tag-admin" : "tag-member"}`}>{myRole}</span>
              {owner ? (
                <button
                  id="delete-project-btn"
                  type="button"
                  className="btn btn-sm btn-danger btn-icon btn-icon-danger"
                  onClick={handleDeleteProject}
                  title="Delete project"
                  aria-label="Delete project"
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <button
                  id="leave-project-btn"
                  type="button"
                  className="btn btn-sm"
                  onClick={handleLeaveProject}
                  title="Leave project"
                >
                  <LogOut size={14} /> Leave
                </button>
              )}
            </div>
          </div>
          )}

          {boardView === "board" && (
            <GithubPanel
              projectId={projectId}
              canManage={canMaintain}
              onChanged={() => {
                cacheInvalidate(`/projects/${projectId}`);
                cachedGet(`/projects/${projectId}`).then(({ data }) => {
                  setProject(data.data);
                  setTasks(data.data.tasks || []);
                });
              }}
            />
          )}

          {(boardView === "team" || teamMounted) && (
            <div className={boardView === "team" ? "team-host" : "team-host team-host-hidden"} hidden={boardView !== "team"}>
              <TeamView
                projectId={projectId}
                members={members}
                isAdmin={owner}
                isMaintainer={canMaintain}
                currentUserId={user.id}
                currentUsername={user.username}
                onMemberAdded={(m) => setMembers((prev) => [...prev, m])}
                onMemberRemoved={(userId) => setMembers((prev) => prev.filter((m) => m.user.id !== userId))}
                onMemberUpdated={(updated) =>
                  setMembers((prev) =>
                    prev.map((m) => (m.user.id === updated.user.id ? updated : m))
                  )
                }
              />
            </div>
          )}

          {boardView === "calendar" && (
            <CalendarView tasks={tasks} onOpenTask={setEditingTask} />
          )}
          {boardView === "table" && (
            <TableView
              tasks={tasks}
              columns={columns}
              onOpenTask={setEditingTask}
            />
          )}
          {boardView === "timeline" && (
            <TimelineView
              tasks={tasks}
              columns={columns}
              onOpenTask={setEditingTask}
            />
          )}
          {boardView === "dashboard" && (
            <DashboardView
              tasks={tasks}
              columns={columns}
              members={members}
              onOpenTask={setEditingTask}
            />
          )}

          {boardView === "board" && (
          <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <Droppable droppableId="board" direction="horizontal" type="COLUMN">
              {(boardProvided) => (
                <div
                  className="kanban-board"
                  ref={boardProvided.innerRef}
                  {...boardProvided.droppableProps}
                >
                  {columns.map((col, colIndex) => {
                    const colWidth = colWidths[col.id] || COL_WIDTH_DEFAULT;
                    return (
                    <Draggable
                      key={col.id}
                      draggableId={`column:${col.id}`}
                      index={colIndex}
                      isDragDisabled={!canMaintain}
                    >
                      {(colProvided, colSnapshot) => (
                        <div
                          ref={colProvided.innerRef}
                          {...colProvided.draggableProps}
                          className={`kanban-col ${colSnapshot.isDragging ? "kanban-col-dragging" : ""}`}
                          style={{
                            ...colProvided.draggableProps.style,
                            width: colWidth,
                            minWidth: colWidth,
                            maxWidth: colWidth,
                            flex: `0 0 ${colWidth}px`,
                            zIndex: colSnapshot.isDragging ? 50 : undefined,
                          }}
                        >
                          <ColumnHeader
                            column={col}
                            taskCount={(cols[col.id] || []).length}
                            canManage={canMaintain}
                            canDelete={columns.length > 1}
                            onRename={handleRenameColumn}
                            onColor={handleColorColumn}
                            onDelete={handleDeleteColumn}
                            dragHandleProps={colProvided.dragHandleProps}
                          />

                          <Droppable
                            droppableId={col.id}
                            type="TASK"
                            renderClone={renderTaskClone}
                            getContainerForClone={() => document.body}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className="kanban-col-body"
                                style={{
                                  borderColor: snapshot.isDraggingOver ? col.color : undefined,
                                  boxShadow: snapshot.isDraggingOver
                                    ? `inset 0 0 0 1px ${col.color}`
                                    : undefined,
                                }}
                              >
                                {(cols[col.id] || []).length === 0 && !snapshot.isDraggingOver && (
                                  <div className="col-empty">Empty</div>
                                )}
                                {(cols[col.id] || []).map((task, index) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    index={index}
                                    canEdit={canEdit}
                                    currentUserId={user.id}
                                    onOpen={setEditingTask}
                                    onDelete={handleTaskDelete}
                                  />
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>

                          {canEdit && (
                            <button
                              type="button"
                              className="btn col-add-task"
                              onClick={() => setCreateColumnId(col.id)}
                            >
                              <Plus size={15} /> Add task
                            </button>
                          )}

                          <div
                            className="col-resize-handle"
                            onPointerDown={(e) => startColResize(e, col.id)}
                            title="Drag to resize column"
                            role="separator"
                            aria-orientation="vertical"
                          />
                        </div>
                      )}
                    </Draggable>
                    );
                  })}
                  {boardProvided.placeholder}

                  {isAdmin && (
                    <div className="kanban-add-col">
                      {addingColumn ? (
                        <form onSubmit={handleAddColumn} className="kanban-add-col-form">
                          <input
                            className="input"
                            placeholder="Column name"
                            value={newColumnName}
                            onChange={(e) => setNewColumnName(e.target.value)}
                            autoFocus
                            required
                          />
                          <button type="submit" className="btn btn-solid">Add</button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => { setAddingColumn(false); setNewColumnName(""); }}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="btn kanban-add-col-btn"
                          onClick={() => setAddingColumn(true)}
                        >
                          <Plus size={16} /> Add column
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          )}
        </div>
      </div>

      {createColumnId && (
        <CreateTaskModal
          projectId={projectId}
          members={members}
          columns={columns}
          defaultColumnId={createColumnId}
          onClose={() => setCreateColumnId(null)}
          onCreated={handleTaskCreated}
        />
      )}

      {editingTask && (
        <CardDetailModal
          projectId={projectId}
          taskId={editingTask.id}
          members={members}
          columns={columns}
          projectLabels={projectLabels}
          customFields={customFields}
          projects={allProjects}
          isAdmin={canEdit}
          myRole={myRole}
          onClose={() => setEditingTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
          onLabelsChanged={(label) =>
            setProjectLabels((prev) =>
              prev.some((l) => l.id === label.id) ? prev : [...prev, label]
            )
          }
          onFieldsChanged={(field) =>
            setCustomFields((prev) =>
              prev.some((f) => f.id === field.id) ? prev : [...prev, field]
            )
          }
        />
      )}
    </>
  );
}
