import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Plus, ArrowLeft, Trash2, Calendar, User, LogOut, GripVertical, PanelLeftOpen,
  MessageSquare, Paperclip, CheckSquare, Copy, LayoutGrid, Table2, GanttChart, PieChart,
} from "lucide-react";
import Navbar from "../components/Navbar";
import CreateTaskModal from "../components/CreateTaskModal";
import CardDetailModal from "../components/CardDetailModal";
import ProjectSidebar from "../components/ProjectSidebar";
import CalendarView from "../components/views/CalendarView";
import TableView from "../components/views/TableView";
import TimelineView from "../components/views/TimelineView";
import DashboardView from "../components/views/DashboardView";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

function TaskCard({ task, index, isAdmin, currentUserId, onOpen, onDelete }) {
  const isAssigned = task.assignedTo?.id === currentUserId;
  const canMove = isAdmin || isAssigned;
  const progress = task.checklistProgress || { done: 0, total: 0 };

  const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : null;

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canMove}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`task-card ${snapshot.isDragging ? "dragging" : ""}`}
          id={`task-${task.id}`}
          onClick={() => onOpen(task)}
        >
          {(task.labels || []).length > 0 && (
            <div className="task-label-row">
              {task.labels.map((l) => (
                <span key={l.id} className="task-label-dot" style={{ background: l.color }} title={l.name} />
              ))}
            </div>
          )}
          <div className="task-card-row">
            <div className="task-card-title">
              {task.isMirror && <Copy size={12} style={{ marginRight: 4, opacity: 0.7 }} />}
              {task.title}
            </div>
            {isAdmin && (
              <div className="task-card-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-danger task-card-btn"
                  onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                  title="Delete task"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="task-card-meta">
            {task.assignedTo && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <User size={12} />
                {task.assignedTo.username}
              </span>
            )}
            {task.dueDate && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Calendar size={12} />
                {fmt(task.dueDate)}
              </span>
            )}
            {progress.total > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CheckSquare size={12} />
                {progress.done}/{progress.total}
              </span>
            )}
            {(task._count?.comments > 0) && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <MessageSquare size={12} />
                {task._count.comments}
              </span>
            )}
            {(task._count?.attachments > 0) && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Paperclip size={12} />
                {task._count.attachments}
              </span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

function ColumnHeader({
  column,
  taskCount,
  isAdmin,
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
    <div className="kanban-col-header">
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, flex: 1 }}>
        {isAdmin && (
          <button
            type="button"
            className="col-drag-handle"
            title="Drag to reorder column"
            {...dragHandleProps}
          >
            <GripVertical size={16} />
          </button>
        )}
        {isAdmin ? (
          <label className="col-color-picker" title="Column color">
            <input
              type="color"
              value={column.color || "#888888"}
              onChange={(e) => onColor(column.id, e.target.value)}
            />
          </label>
        ) : (
          <span className="col-color-dot" style={{ background: column.color }} />
        )}

        {editing && isAdmin ? (
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
            style={{ color: column.color }}
            onClick={() => isAdmin && setEditing(true)}
            title={isAdmin ? "Click to rename" : undefined}
          >
            {column.name}
          </button>
        )}
        <span className="col-count">{taskCount}</span>
      </div>

      {isAdmin && canDelete && (
        <div className="col-actions">
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(column.id)} title="Delete column">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState([]);
  const [members, setMembers] = useState([]);
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createColumnId, setCreateColumnId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [projectLabels, setProjectLabels] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [boardView, setBoardViewState] = useState("board");

  const setBoardView = (view) => {
    setBoardViewState(view);
    try {
      localStorage.setItem(`boardView:${projectId}`, view);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      setBoardViewState(localStorage.getItem(`boardView:${projectId}`) || "board");
    } catch {
      setBoardViewState("board");
    }
  }, [projectId]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isAdmin = myRole === "ADMIN";

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
    api.get(`/projects/${projectId}`)
      .then(({ data }) => {
        setProject(data.data);
        setTasks(data.data.tasks || []);
        setColumns(data.data.columns || []);
        setMembers(data.data.members || []);
        setMyRole(data.data.myRole);
        setProjectLabels(data.data.labels || []);
        setCustomFields(data.data.customFields || []);
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));

    api.get("/projects")
      .then(({ data }) => setAllProjects(data.data || []))
      .catch(() => {});
  }, [projectId, navigate]);

  const grouped = useCallback(() => {
    return columns.reduce((acc, col) => {
      acc[col.id] = tasks.filter((t) => t.columnId === col.id);
      return acc;
    }, {});
  }, [tasks, columns]);

  const onDragEnd = async ({ source, destination, draggableId, type }) => {
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
      alert(err.response?.data?.message || "Failed to move task.");
    }
  };

  const handleTaskCreated = (task) => setTasks((prev) => [task, ...prev]);
  const handleTaskUpdated = (task) =>
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));

  const handleTaskDelete = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/projects/${projectId}/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete.");
    }
  };

  const handleRenameColumn = async (columnId, name) => {
    try {
      const { data } = await api.patch(`/projects/${projectId}/columns/${columnId}`, { name });
      setColumns((prev) => prev.map((c) => (c.id === columnId ? data.data : c)));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to rename column.");
    }
  };

  const handleColorColumn = async (columnId, color) => {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, color } : c)));
    try {
      const { data } = await api.patch(`/projects/${projectId}/columns/${columnId}`, { color });
      setColumns((prev) => prev.map((c) => (c.id === columnId ? data.data : c)));
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update color.");
    }
  };

  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm("Delete this column? Tasks will move to another column.")) return;
    try {
      await api.delete(`/projects/${projectId}/columns/${columnId}`);
      const { data } = await api.get(`/projects/${projectId}`);
      setColumns(data.data.columns || []);
      setTasks(data.data.tasks || []);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete column.");
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
      alert(err.response?.data?.message || "Failed to reorder columns.");
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
      alert(err.response?.data?.message || "Failed to add column.");
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm("Delete this project and all its tasks? This cannot be undone.")) return;
    try {
      await api.delete(`/projects/${projectId}`);
      navigate("/");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete project.");
    }
  };

  const handleLeaveProject = async () => {
    if (!window.confirm("Leave this project?")) return;
    try {
      await api.post(`/projects/${projectId}/leave`);
      navigate("/");
    } catch (err) {
      alert(err.response?.data?.message || "Failed to leave project.");
    }
  };

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
        {isAdmin && (
          <ProjectSidebar
            projectId={projectId}
            members={members}
            onMemberAdded={(m) => setMembers((prev) => [...prev, m])}
            onMemberRemoved={(userId) => setMembers((prev) => prev.filter((m) => m.user.id !== userId))}
            currentUserId={user.id}
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
        )}

        <div className="project-main">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-sm sidebar-open-mobile"
                  onClick={() => setMobileSidebarOpen(true)}
                  title="Open team sidebar"
                >
                  <PanelLeftOpen size={15} /> Team
                </button>
              )}
              <button
                id="back-btn"
                type="button"
                className="btn btn-sm"
                onClick={() => navigate("/")}
                style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <ArrowLeft size={15} /> Back
              </button>
              <div>
                <h1 style={{ fontSize: "1.25rem" }}>{project?.title}</h1>
                {project?.description && (
                  <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span className={`tag ${isAdmin ? "tag-admin" : "tag-member"}`}>{myRole}</span>
              {isAdmin ? (
                <button
                  id="delete-project-btn"
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteProject}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <Trash2 size={14} /> Delete
                </button>
              ) : (
                <button
                  id="leave-project-btn"
                  type="button"
                  className="btn"
                  onClick={handleLeaveProject}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <LogOut size={14} /> Leave
                </button>
              )}
            </div>
          </div>

          {!isAdmin && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              {members.map((m) => (
                <span key={m.user.id} className="tag tag-member">{m.user.username}</span>
              ))}
            </div>
          )}

          <div className="board-view-tabs" role="tablist">
            {[
              { id: "board", label: "Board", Icon: LayoutGrid },
              { id: "table", label: "Table", Icon: Table2 },
              { id: "calendar", label: "Calendar", Icon: Calendar },
              { id: "timeline", label: "Timeline", Icon: GanttChart },
              { id: "dashboard", label: "Dashboard", Icon: PieChart },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={boardView === id}
                className={`board-view-tab ${boardView === id ? "active" : ""}`}
                onClick={() => setBoardView(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

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
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="board" direction="horizontal" type="COLUMN">
              {(boardProvided) => (
                <div
                  className="kanban-board"
                  ref={boardProvided.innerRef}
                  {...boardProvided.droppableProps}
                >
                  {columns.map((col, colIndex) => (
                    <Draggable
                      key={col.id}
                      draggableId={`column:${col.id}`}
                      index={colIndex}
                      isDragDisabled={!isAdmin}
                    >
                      {(colProvided, colSnapshot) => (
                        <div
                          ref={colProvided.innerRef}
                          {...colProvided.draggableProps}
                          className={`kanban-col ${colSnapshot.isDragging ? "kanban-col-dragging" : ""}`}
                        >
                          <ColumnHeader
                            column={col}
                            taskCount={(cols[col.id] || []).length}
                            isAdmin={isAdmin}
                            canDelete={columns.length > 1}
                            onRename={handleRenameColumn}
                            onColor={handleColorColumn}
                            onDelete={handleDeleteColumn}
                            dragHandleProps={colProvided.dragHandleProps}
                          />

                          <Droppable droppableId={col.id} type="TASK">
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
                                  <div className="empty-state" style={{ fontSize: "0.75rem", padding: "1rem" }}>
                                    empty
                                  </div>
                                )}
                                {(cols[col.id] || []).map((task, index) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    index={index}
                                    isAdmin={isAdmin}
                                    currentUserId={user.id}
                                    onOpen={setEditingTask}
                                    onDelete={handleTaskDelete}
                                  />
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>

                          {isAdmin && (
                            <button
                              type="button"
                              className="btn col-add-task"
                              onClick={() => setCreateColumnId(col.id)}
                            >
                              <Plus size={15} /> Add task
                            </button>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
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
          isAdmin={isAdmin}
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
