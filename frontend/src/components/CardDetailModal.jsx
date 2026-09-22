import { useEffect, useState } from "react";
import {
  X, Plus, Trash2, Paperclip, MessageSquare, CheckSquare, Tag, Copy,
} from "lucide-react";
import api from "../lib/api";

const API_ORIGIN = import.meta.env.VITE_API_URL || "";

function fileUrl(url) {
  if (!url) return url;
  if (url.startsWith("http")) return url;
  return `${API_ORIGIN}${url}`;
}

const LABEL_COLORS = ["#61bd4f", "#f2d600", "#ff9f1a", "#eb5a46", "#c377e0", "#0079bf", "#00c2e0", "#51e898", "#ff78cb", "#344563"];

export default function CardDetailModal({
  projectId,
  taskId,
  members,
  columns,
  projectLabels,
  customFields,
  projects,
  isAdmin,
  onClose,
  onUpdated,
  onDeleted,
  onLabelsChanged,
  onFieldsChanged,
}) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("Checklist");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("TEXT");
  const [mirrorProjectId, setMirrorProjectId] = useState("");
  const [mirrorColumnId, setMirrorColumnId] = useState("");
  const [mirrorColumns, setMirrorColumns] = useState([]);

  const reload = async () => {
    const { data } = await api.get(`/projects/${projectId}/tasks/${taskId}`);
    setCard(data.data);
    onUpdated?.(data.data);
  };

  useEffect(() => {
    setLoading(true);
    api.get(`/projects/${projectId}/tasks/${taskId}`)
      .then(({ data }) => setCard(data.data))
      .catch((err) => setError(err.response?.data?.message || "Failed to load card."))
      .finally(() => setLoading(false));
  }, [projectId, taskId]);

  useEffect(() => {
    if (!mirrorProjectId) {
      setMirrorColumns([]);
      return;
    }
    api.get(`/projects/${mirrorProjectId}`)
      .then(({ data }) => {
        setMirrorColumns(data.data.columns || []);
        setMirrorColumnId(data.data.columns?.[0]?.id || "");
      })
      .catch(() => setMirrorColumns([]));
  }, [mirrorProjectId]);

  const saveCard = async (patch) => {
    if (!isAdmin) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.patch(`/projects/${projectId}/tasks/${taskId}`, patch);
      setCard((c) => ({ ...c, ...data.data }));
      onUpdated?.(data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLabel = async (labelId) => {
    if (!isAdmin || !card) return;
    const current = (card.labels || []).map((l) => l.id);
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    const { data } = await api.put(`/projects/${projectId}/tasks/${taskId}/labels`, {
      labelIds: next,
    });
    setCard(data.data);
    onUpdated?.(data.data);
  };

  const createLabel = async (e) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    const { data } = await api.post(`/projects/${projectId}/labels`, {
      name: newLabelName.trim(),
      color: newLabelColor,
    });
    onLabelsChanged?.(data.data);
    setNewLabelName("");
  };

  const addChecklist = async () => {
    const { data } = await api.post(`/projects/${projectId}/tasks/${taskId}/checklists`, {
      title: newChecklistTitle || "Checklist",
    });
    setCard((c) => ({
      ...c,
      checklists: [...(c.checklists || []), { ...data.data, items: data.data.items || [] }],
    }));
  };

  const addItem = async (checklistId, title, extra = {}) => {
    if (!title.trim()) return;
    const { data } = await api.post(
      `/projects/${projectId}/tasks/${taskId}/checklists/${checklistId}/items`,
      { title: title.trim(), ...extra }
    );
    setCard((c) => ({
      ...c,
      checklists: c.checklists.map((cl) =>
        cl.id === checklistId ? { ...cl, items: [...cl.items, data.data] } : cl
      ),
    }));
  };

  const patchItem = async (checklistId, itemId, patch) => {
    const { data } = await api.patch(
      `/projects/${projectId}/tasks/${taskId}/checklists/${checklistId}/items/${itemId}`,
      patch
    );
    setCard((c) => ({
      ...c,
      checklists: c.checklists.map((cl) =>
        cl.id === checklistId
          ? { ...cl, items: cl.items.map((it) => (it.id === itemId ? data.data : it)) }
          : cl
      ),
    }));
  };

  const removeItem = async (checklistId, itemId) => {
    await api.delete(
      `/projects/${projectId}/tasks/${taskId}/checklists/${checklistId}/items/${itemId}`
    );
    setCard((c) => ({
      ...c,
      checklists: c.checklists.map((cl) =>
        cl.id === checklistId
          ? { ...cl, items: cl.items.filter((it) => it.id !== itemId) }
          : cl
      ),
    }));
  };

  const removeChecklist = async (checklistId) => {
    await api.delete(`/projects/${projectId}/tasks/${taskId}/checklists/${checklistId}`);
    setCard((c) => ({
      ...c,
      checklists: c.checklists.filter((cl) => cl.id !== checklistId),
    }));
  };

  const postComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const { data } = await api.post(`/projects/${projectId}/tasks/${taskId}/comments`, {
      body: comment.trim(),
    });
    setCard((c) => ({ ...c, comments: [...(c.comments || []), data.data] }));
    setComment("");
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post(
      `/projects/${projectId}/tasks/${taskId}/attachments`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    setCard((c) => ({
      ...c,
      attachments: [data.data, ...(c.attachments || [])],
    }));
    e.target.value = "";
  };

  const setFieldValue = async (fieldId, value) => {
    if (!isAdmin) return;
    const { data } = await api.put(
      `/projects/${projectId}/tasks/${taskId}/custom-fields/${fieldId}`,
      { value }
    );
    setCard((c) => {
      const others = (c.customFieldValues || []).filter((v) => v.fieldId !== fieldId);
      return { ...c, customFieldValues: [...others, data.data] };
    });
  };

  const createField = async (e) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    const { data } = await api.post(`/projects/${projectId}/custom-fields`, {
      name: newFieldName.trim(),
      type: newFieldType,
      options: newFieldType === "DROPDOWN" ? ["Option A", "Option B"] : undefined,
    });
    onFieldsChanged?.(data.data);
    setNewFieldName("");
  };

  const createMirror = async () => {
    if (!mirrorProjectId || !mirrorColumnId) return;
    await api.post(`/projects/${projectId}/tasks/${taskId}/mirror`, {
      targetProjectId: mirrorProjectId,
      targetColumnId: mirrorColumnId,
    });
    await reload();
    alert("Mirror created on target board.");
  };

  const deleteCard = async () => {
    if (!window.confirm("Delete this card?")) return;
    await api.delete(`/projects/${projectId}/tasks/${taskId}`);
    onDeleted?.(taskId);
    onClose();
  };

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box card-detail" onClick={(e) => e.stopPropagation()}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="error-msg">{error || "Card not found."}</div>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const selectedLabelIds = new Set((card.labels || []).map((l) => l.id));
  const fieldValues = Object.fromEntries(
    (card.customFieldValues || []).map((v) => [v.fieldId, v.value])
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box card-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>// Card</span>
          <button type="button" className="btn btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        {card.isMirror && (
          <div className="card-mirror-banner">Mirrored from another board</div>
        )}

        {error && <div className="error-msg" style={{ marginBottom: "1rem" }}>{error}</div>}

        <div className="card-detail-grid">
          <div className="card-detail-main">
            <input
              className="input card-title-input"
              value={card.title}
              disabled={!isAdmin}
              onChange={(e) => setCard({ ...card, title: e.target.value })}
              onBlur={() => isAdmin && saveCard({ title: card.title })}
            />

            <div className="field">
              <label className="label">Description</label>
              <textarea
                className="input card-desc"
                rows={4}
                value={card.description || ""}
                disabled={!isAdmin}
                placeholder="Add a more detailed description…"
                onChange={(e) => setCard({ ...card, description: e.target.value })}
                onBlur={() => isAdmin && saveCard({ description: card.description || null })}
              />
            </div>

            <div className="field">
              <label className="label"><Tag size={12} /> Labels</label>
              <div className="label-chip-row">
                {(projectLabels || []).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`label-chip ${selectedLabelIds.has(l.id) ? "on" : ""}`}
                    style={{ background: l.color }}
                    disabled={!isAdmin}
                    onClick={() => toggleLabel(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
              {isAdmin && (
                <form className="inline-form" onSubmit={createLabel}>
                  <input
                    className="input"
                    placeholder="New label"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                  />
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    title="Color"
                  />
                  <button type="submit" className="btn btn-sm">Add</button>
                </form>
              )}
            </div>

            {(customFields || []).length > 0 && (
              <div className="field">
                <label className="label">Custom fields</label>
                {customFields.map((f) => (
                  <div key={f.id} className="custom-field-row">
                    <span className="custom-field-name">{f.name}</span>
                    {f.type === "CHECKBOX" ? (
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={!!fieldValues[f.id]}
                        onChange={(e) => setFieldValue(f.id, e.target.checked)}
                      />
                    ) : f.type === "DROPDOWN" ? (
                      <select
                        className="select"
                        disabled={!isAdmin}
                        value={fieldValues[f.id] ?? ""}
                        onChange={(e) => setFieldValue(f.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {(Array.isArray(f.options) ? f.options : []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                        disabled={!isAdmin}
                        value={
                          f.type === "DATE" && fieldValues[f.id]
                            ? String(fieldValues[f.id]).slice(0, 10)
                            : fieldValues[f.id] ?? ""
                        }
                        onBlur={(e) => {
                          let val = e.target.value;
                          if (f.type === "NUMBER") val = val === "" ? null : Number(val);
                          if (f.type === "DATE") val = val || null;
                          setFieldValue(f.id, val);
                        }}
                        onChange={(e) => {
                          /* controlled lightly via blur save */
                          const map = { ...fieldValues, [f.id]: e.target.value };
                          setCard((c) => ({
                            ...c,
                            customFieldValues: Object.entries(map).map(([fieldId, value]) => ({
                              fieldId,
                              value,
                              field: f,
                            })),
                          }));
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <form className="inline-form" onSubmit={createField}>
                <input
                  className="input"
                  placeholder="New custom field"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                />
                <select className="select" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
                  <option value="TEXT">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="DATE">Date</option>
                  <option value="CHECKBOX">Checkbox</option>
                  <option value="DROPDOWN">Dropdown</option>
                </select>
                <button type="submit" className="btn btn-sm">Add field</button>
              </form>
            )}

            <div className="field">
              <label className="label"><CheckSquare size={12} /> Checklists</label>
              {(card.checklists || []).map((cl) => {
                const done = cl.items.filter((i) => i.completed).length;
                const total = cl.items.length;
                return (
                  <div key={cl.id} className="checklist-block">
                    <div className="checklist-head">
                      <strong>{cl.title}</strong>
                      <span className="col-count">{done}/{total}</span>
                      {isAdmin && (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => removeChecklist(cl.id)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div className="checklist-bar">
                      <div style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
                    </div>
                    {cl.items.map((item) => (
                      <div key={item.id} className="checklist-item">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={(e) => patchItem(cl.id, item.id, { completed: e.target.checked })}
                        />
                        <span className={item.completed ? "done" : ""}>{item.title}</span>
                        {isAdmin && (
                          <>
                            <select
                              className="select checklist-assign"
                              value={item.assignedToId || ""}
                              onChange={(e) =>
                                patchItem(cl.id, item.id, { assignedToId: e.target.value || null })
                              }
                            >
                              <option value="">Assignee</option>
                              {members.map((m) => (
                                <option key={m.user.id} value={m.user.id}>{m.user.username}</option>
                              ))}
                            </select>
                            <input
                              type="date"
                              className="input checklist-due"
                              value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                              onChange={(e) =>
                                patchItem(cl.id, item.id, {
                                  dueDate: e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : null,
                                })
                              }
                            />
                            <button type="button" className="btn btn-sm btn-danger" onClick={() => removeItem(cl.id, item.id)}>
                              <Trash2 size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    {isAdmin && (
                      <ChecklistAddRow onAdd={(title) => addItem(cl.id, title)} />
                    )}
                  </div>
                );
              })}
              {isAdmin && (
                <div className="inline-form">
                  <input
                    className="input"
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                  />
                  <button type="button" className="btn btn-sm" onClick={addChecklist}>
                    <Plus size={12} /> Checklist
                  </button>
                </div>
              )}
            </div>

            <div className="field">
              <label className="label"><MessageSquare size={12} /> Comments</label>
              <div className="comment-list">
                {(card.comments || []).map((c) => (
                  <div key={c.id} className="comment-row">
                    <strong>@{c.author?.username}</strong>
                    <span>{c.body}</span>
                  </div>
                ))}
              </div>
              <form className="inline-form" onSubmit={postComment}>
                <input
                  className="input"
                  placeholder="Write a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button type="submit" className="btn btn-sm btn-solid">Post</button>
              </form>
            </div>

            <div className="field">
              <label className="label"><Paperclip size={12} /> Attachments</label>
              {(card.attachments || []).map((a) => (
                <div key={a.id} className="attach-row">
                  <a href={fileUrl(a.url)} target="_blank" rel="noreferrer">{a.filename}</a>
                  <span className="col-count">{Math.round(a.sizeBytes / 1024)} KB</span>
                </div>
              ))}
              {isAdmin && (
                <input type="file" onChange={uploadFile} />
              )}
            </div>

            <div className="field">
              <label className="label">Activity</label>
              <div className="activity-list">
                {(card.activities || []).map((a) => (
                  <div key={a.id} className="activity-row">
                    <strong>@{a.actor?.username}</strong> {a.type.replace(/_/g, " ")}
                    <span>{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="card-detail-side">
            <div className="field">
              <label className="label">Column</label>
              <select
                className="select"
                disabled={!isAdmin}
                value={card.columnId}
                onChange={(e) => {
                  setCard({ ...card, columnId: e.target.value });
                  saveCard({ columnId: e.target.value });
                }}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Assignee</label>
              <select
                className="select"
                disabled={!isAdmin}
                value={card.assignedToId || card.assignedTo?.id || ""}
                onChange={(e) => {
                  const assignedToId = e.target.value || null;
                  setCard({ ...card, assignedToId });
                  saveCard({ assignedToId });
                }}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>{m.user.username}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Due date</label>
              <input
                type="date"
                className="input"
                disabled={!isAdmin}
                value={card.dueDate ? card.dueDate.slice(0, 10) : ""}
                onChange={(e) => {
                  const dueDate = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null;
                  setCard({ ...card, dueDate });
                  saveCard({ dueDate });
                }}
              />
            </div>

            {isAdmin && !card.mirrorOfId && (
              <div className="field">
                <label className="label"><Copy size={12} /> Mirror to board</label>
                <select
                  className="select"
                  value={mirrorProjectId}
                  onChange={(e) => setMirrorProjectId(e.target.value)}
                >
                  <option value="">Select project</option>
                  {(projects || [])
                    .filter((p) => p.id !== projectId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                </select>
                <select
                  className="select"
                  value={mirrorColumnId}
                  onChange={(e) => setMirrorColumnId(e.target.value)}
                  disabled={!mirrorColumns.length}
                >
                  {mirrorColumns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={createMirror} disabled={!mirrorColumnId}>
                  Create mirror
                </button>
              </div>
            )}

            {isAdmin && (
              <button type="button" className="btn btn-danger" onClick={deleteCard} disabled={saving}>
                <Trash2 size={13} /> Delete card
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function ChecklistAddRow({ onAdd }) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(title);
        setTitle("");
      }}
    >
      <input
        className="input"
        placeholder="Add an item"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" className="btn btn-sm">Add</button>
    </form>
  );
}
