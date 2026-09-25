import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Hash, Lock, Plus, Trash2, Pencil, Check, X, UserPlus, Send, MessageSquare,
  ChevronDown, ChevronRight, MoreHorizontal, Volume2, SmilePlus, LogOut,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import api from "../lib/api";
import { useDialog } from "../context/DialogContext";
import { cachePeek, cacheSet, cachedGet } from "../lib/queryCache";
import ChannelIconPicker from "./ChannelIconPicker";
import ChannelCanvas from "./ChannelCanvas";
import VoiceRoom from "./VoiceRoom";

function channelsKey(projectId) {
  return `/projects/${projectId}/channels`;
}
function messagesKey(projectId, channelId) {
  return `/projects/${projectId}/channels/${channelId}/messages`;
}

function sortChannels(list) {
  return [...list].sort((a, b) => {
    if (a.isDm !== b.isDm) return a.isDm ? 1 : -1;
    const ap = a.position ?? 0;
    const bp = b.position ?? 0;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MembersPanel({
  members,
  isAdmin,
  currentUserId,
  projectId,
  onMemberAdded,
  onMemberRemoved,
  onMemberUpdated,
}) {
  const { alert, confirm } = useDialog();
  const [inviteValue, setInviteValue] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editRole, setEditRole] = useState("CONTRIBUTOR");
  const [savingRole, setSavingRole] = useState(false);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteLoading(true);
    try {
      const trimmed = inviteValue.trim().replace(/^@+/, "");
      const payload = trimmed.includes("@")
        ? { email: trimmed.toLowerCase() }
        : { username: trimmed };
      const { data } = await api.post(`/projects/${projectId}/members`, payload);
      onMemberAdded(data.data);
      setInviteValue("");
    } catch (err) {
      setInviteError(err.response?.data?.message || "Failed to invite.");
    } finally {
      setInviteLoading(false);
    }
  };

  const saveRole = async (userId) => {
    setSavingRole(true);
    try {
      const { data } = await api.patch(`/projects/${projectId}/members/${userId}`, {
        role: editRole,
      });
      onMemberUpdated?.(data.data);
      setEditingUserId(null);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to update role.");
    } finally {
      setSavingRole(false);
    }
  };

  const handleRemove = async (userId) => {
    const ok = await confirm("Remove this member?", {
      title: "Remove member",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/members/${userId}`);
      onMemberRemoved(userId);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to remove.");
    }
  };

  return (
    <div className="team-pane">
      <header className="team-pane-header">
        <h2>Invite people</h2>
        <p className="meet-cal-sub">{members.length} on this project</p>
      </header>

      {isAdmin && (
        <section className="team-view-card">
          <form className="team-invite-form" onSubmit={handleInvite}>
            <input
              className="input"
              placeholder="@username or email"
              value={inviteValue}
              onChange={(e) => setInviteValue(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-solid" disabled={inviteLoading}>
              {inviteLoading ? "Inviting..." : "Invite"}
            </button>
          </form>
          {inviteError && <div className="error-msg">{inviteError}</div>}
        </section>
      )}

      <section className="team-view-card team-table-card">
        <div className="table-wrap team-table-wrap">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th className="team-table-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user.id === currentUserId;
                const isEditing = editingUserId === m.user.id;
                return (
                  <tr key={m.user.id}>
                    <td>
                      <span className="team-table-user">@{m.user.username}</span>
                      {isSelf && <span className="team-you-tag">you</span>}
                    </td>
                    <td className="team-table-muted">{m.user.email || "—"}</td>
                    <td>
                      {isEditing ? (
                        <select
                          className="select team-role-select"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          disabled={savingRole}
                        >
                          <option value="CONTRIBUTOR">CONTRIBUTOR</option>
                          <option value="MAINTAINER">MAINTAINER</option>
                          <option value="VIEWER">VIEWER</option>
                          <option value="OWNER">OWNER</option>
                        </select>
                      ) : (
                        <span className={`tag ${m.role === "OWNER" || m.role === "ADMIN" || m.role === "MAINTAINER" ? "tag-admin" : "tag-member"}`}>
                          {m.role}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="team-table-actions">
                        {isAdmin && !isSelf ? (
                          isEditing ? (
                            <>
                              <button type="button" className="btn btn-sm btn-icon btn-icon-ok" title="Save" disabled={savingRole} onClick={() => saveRole(m.user.id)}>
                                <Check size={14} />
                              </button>
                              <button type="button" className="btn btn-sm btn-icon" title="Cancel" onClick={() => setEditingUserId(null)}>
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-icon btn-icon-edit"
                                title="Edit role"
                                onClick={() => {
                                  setEditingUserId(m.user.id);
                                  setEditRole(m.role);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                              <button type="button" className="btn btn-sm btn-icon btn-icon-danger" title="Remove" onClick={() => handleRemove(m.user.id)}>
                                <Trash2 size={13} />
                              </button>
                            </>
                          )
                        ) : (
                          <span className="team-table-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ChannelChat({
  projectId,
  channel,
  messages,
  draft,
  setDraft,
  onSend,
  sending,
  loading,
  currentUserId,
  currentUsername,
  canEditChannel,
  isMaintainer,
  onSaveCanvas,
  onUpdateIcon,
  voiceEvent,
}) {
  const bottomRef = useRef(null);
  const stickBottom = useRef(true);
  const [tab, setTab] = useState("chat"); // chat | canvas
  const [iconOpen, setIconOpen] = useState(false);

  useEffect(() => {
    stickBottom.current = true;
    setTab(channel?.type === "VOICE" ? "chat" : "chat");
  }, [channel?.id]);

  useEffect(() => {
    if (stickBottom.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!channel) {
    return (
      <div className="team-chat empty">
        <MessageSquare size={28} />
        <p>Select a channel or start a direct message.</p>
      </div>
    );
  }

  const title = channel.isDm
    ? channel.dmPeer?.username
      ? `@${channel.dmPeer.username}`
      : "Direct message"
    : channel.name;

  const isVoice = channel.type === "VOICE" && !channel.isDm;

  return (
    <div className="team-chat">
      <header className="team-chat-header team-chat-header-rich">
        <div className="team-chat-title-row">
          <h2>
            {channel.icon ? (
              <span className="channel-glyph-emoji">{channel.icon}</span>
            ) : isVoice ? (
              <Volume2 size={16} />
            ) : channel.isDm ? null : channel.isPrivate ? (
              <Lock size={16} />
            ) : (
              <Hash size={16} />
            )}
            {channel.isDm ? title : `#${title}`}
          </h2>
          {canEditChannel && !channel.isDm && (
            <div className="team-icon-menu">
              <button
                type="button"
                className="btn btn-sm btn-icon"
                title="Channel icon"
                onClick={() => setIconOpen((v) => !v)}
              >
                <SmilePlus size={15} />
              </button>
              {iconOpen && (
                <div className="team-icon-popover">
                  <ChannelIconPicker
                    value={channel.icon}
                    onChange={(icon) => {
                      onUpdateIcon?.(icon);
                      setIconOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {!channel.isDm && (
          <div className="team-channel-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "chat"}
              className={`team-channel-tab ${tab === "chat" ? "active" : ""}`}
              onClick={() => setTab("chat")}
            >
              {isVoice ? "Voice & chat" : "Chat & discussion"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "canvas"}
              className={`team-channel-tab ${tab === "canvas" ? "active" : ""}`}
              onClick={() => setTab("canvas")}
            >
              Canvas
            </button>
          </div>
        )}
      </header>

      {tab === "canvas" && !channel.isDm ? (
        <ChannelCanvas
          channelId={channel.id}
          doc={channel.canvasDoc}
          canEdit={Boolean(!channel.isDm)}
          onSave={onSaveCanvas}
        />
      ) : (
        <>
          {isVoice && (
            <VoiceRoom
              projectId={projectId}
              channelId={channel.id}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              voiceEvent={voiceEvent}
            />
          )}
          <div
            className="team-chat-messages"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {loading ? (
              <div className="skeleton-card" style={{ minHeight: 120, margin: "1rem" }} />
            ) : messages.length === 0 ? (
              <div className="team-chat-empty">
                <p>This is the beginning of {channel.isDm ? title : `#${title}`}.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.authorId === currentUserId;
                const name = m.author?.username ? `@${m.author.username}` : "someone";
                return (
                  <article key={m.id} className={`team-msg ${isMine ? "mine" : ""}`}>
                    <div className="team-msg-avatar">
                      {(m.author?.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="team-msg-body">
                      <div className="team-msg-meta">
                        <strong>{name}</strong>
                        <time>{formatTime(m.createdAt)}</time>
                      </div>
                      <p>{m.body}</p>
                    </div>
                  </article>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="team-chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              onSend();
            }}
          >
            <input
              className="input"
              placeholder={`Message ${channel.isDm ? title : `#${title}`}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
            />
            <button type="submit" className="btn btn-solid btn-icon" disabled={sending || !draft.trim()} title="Send">
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function TeamView({
  projectId,
  members,
  isAdmin,
  isMaintainer,
  currentUserId,
  currentUsername,
  onMemberAdded,
  onMemberRemoved,
  onMemberUpdated,
}) {
  const { alert, confirm } = useDialog();
  const canMaintain = Boolean(isMaintainer || isAdmin);
  const [panel, setPanel] = useState("chat"); // chat | invite
  const cachedChannels = cachePeek(channelsKey(projectId))?.data?.data;
  const [channels, setChannels] = useState(() => cachedChannels || []);
  const [activeChannelId, setActiveChannelId] = useState(
    () => cachedChannels?.find((c) => !c.isDm)?.id || cachedChannels?.[0]?.id || null
  );
  const [messages, setMessages] = useState(() => {
    const id = cachedChannels?.find((c) => !c.isDm)?.id || cachedChannels?.[0]?.id;
    return id ? cachePeek(messagesKey(projectId, id))?.data?.data || [] : [];
  });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(() => !cachedChannels);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [channelType, setChannelType] = useState("TEXT");
  const [channelIcon, setChannelIcon] = useState(null);
  const [privateMemberIds, setPrivateMemberIds] = useState([]);
  const [menuChannelId, setMenuChannelId] = useState(null);
  const [editingChannel, setEditingChannel] = useState(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState(null);
  const [voiceEvent, setVoiceEvent] = useState(null);
  const [channelsOpen, setChannelsOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`teamChannelsOpen:${projectId}`);
      return v == null ? true : v === "1";
    } catch {
      return true;
    }
  });

  const toggleChannelsOpen = () => {
    setChannelsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`teamChannelsOpen:${projectId}`, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const activeChannelIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    if (!menuChannelId) return undefined;
    const onPointerDown = (e) => {
      if (e.target.closest?.(".team-channel-more-wrap")) return;
      setMenuChannelId(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuChannelId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuChannelId]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || null,
    [channels, activeChannelId]
  );

  const roomChannels = useMemo(
    () => channels.filter((c) => !c.isDm),
    [channels]
  );
  const dmChannels = useMemo(
    () => channels.filter((c) => c.isDm),
    [channels]
  );

  const loadChannels = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent && !cachePeek(channelsKey(projectId))) setLoadingChannels(true);
    try {
      const res = await cachedGet(channelsKey(projectId), { ttl: 120_000, force });
      const list = sortChannels(res.data?.data || []);
      setChannels(list);
      setActiveChannelId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list.find((c) => !c.isDm)?.id || list[0]?.id || null;
      });
    } catch (err) {
      if (!silent) await alert(err.response?.data?.message || "Failed to load channels.");
    } finally {
      setLoadingChannels(false);
    }
  }, [projectId, alert]);

  const loadMessages = useCallback(async (channelId, { silent = false } = {}) => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    const key = messagesKey(projectId, channelId);
    const peek = cachePeek(key)?.data?.data;
    if (peek) {
      setMessages(peek);
      setLoadingMessages(false);
    } else if (!silent) {
      setLoadingMessages(true);
    }
    try {
      const res = await cachedGet(key, { ttl: 90_000 });
      const list = res.data?.data || [];
      if (activeChannelIdRef.current === channelId) {
        setMessages(list);
      }
    } catch (err) {
      if (!silent && !peek) {
        await alert(err.response?.data?.message || "Failed to load messages.");
        setMessages([]);
      }
    } finally {
      setLoadingMessages(false);
    }
  }, [projectId, alert]);

  useEffect(() => {
    loadChannels({ silent: Boolean(cachedChannels) });
  }, [loadChannels]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeChannelId) loadMessages(activeChannelId, { silent: true });
  }, [activeChannelId, loadMessages]);

  // Stable SSE — do not reconnect when switching channels
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || !projectId) return undefined;

    const url = `/api/projects/${projectId}/channels/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.addEventListener("team", (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.type === "message.created" && payload.message) {
          if (payload.channelId === activeChannelIdRef.current) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.message.id)) return prev;
              const next = [...prev, payload.message];
              cacheSet(messagesKey(projectId, payload.channelId), {
                data: { data: next },
              });
              return next;
            });
          } else {
            // Keep offline cache warm for other channels
            const key = messagesKey(projectId, payload.channelId);
            const peek = cachePeek(key)?.data?.data;
            if (peek && !peek.some((m) => m.id === payload.message.id)) {
              cacheSet(key, { data: { data: [...peek, payload.message] } });
            }
          }
          setChannels((prev) => {
            const next = prev.map((c) =>
              c.id === payload.channelId
                ? {
                    ...c,
                    lastMessage: {
                      body: payload.message.body,
                      createdAt: payload.message.createdAt,
                    },
                    messageCount: (c.messageCount || 0) + 1,
                  }
                : c
            );
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
        }
        if (payload.type === "channel.created" && payload.channel) {
          setChannels((prev) => {
            if (prev.some((c) => c.id === payload.channel.id)) return prev;
            const next = sortChannels([...prev, payload.channel]);
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
        } else if (payload.type === "channel.created") {
          loadChannels({ silent: true, force: true });
        }
        if (payload.type === "channel.reordered" && Array.isArray(payload.channelIds)) {
          setChannels((prev) => {
            const rooms = prev.filter((c) => !c.isDm);
            const dms = prev.filter((c) => c.isDm);
            const byId = Object.fromEntries(rooms.map((c) => [c.id, c]));
            const ordered = payload.channelIds
              .map((id, index) => (byId[id] ? { ...byId[id], position: index } : null))
              .filter(Boolean);
            const leftover = rooms.filter((c) => !payload.channelIds.includes(c.id));
            const next = sortChannels([...ordered, ...leftover, ...dms]);
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
        }
        if (payload.type === "channel.updated" && payload.channel) {
          setChannels((prev) => {
            const next = prev.map((c) =>
              c.id === payload.channel.id ? { ...c, ...payload.channel } : c
            );
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
        }
        if (payload.type === "channel.left" && payload.userId === currentUserId) {
          setChannels((prev) => {
            const next = prev.filter((c) => c.id !== payload.channelId);
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
          setActiveChannelId((prev) => (prev === payload.channelId ? null : prev));
        }
        if (payload.type === "voice.signal") {
          setVoiceEvent({ ...payload, at: Date.now() });
        }
        if (payload.type === "channel.deleted") {
          setChannels((prev) => {
            const next = prev.filter((c) => c.id !== payload.channelId);
            cacheSet(channelsKey(projectId), { data: { data: next } });
            return next;
          });
          setActiveChannelId((prev) => (prev === payload.channelId ? null : prev));
        }
      } catch {
        /* ignore */
      }
    });

    return () => es.close();
  }, [projectId, loadChannels, currentUserId]);

  const selectChannel = (id) => {
    setActiveChannelId(id);
    setPanel("chat");
    setDraft("");
    const peek = cachePeek(messagesKey(projectId, id))?.data?.data;
    if (peek) setMessages(peek);
  };

  const createChannel = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/projects/${projectId}/channels`, {
        name: newName,
        isPrivate,
        memberIds: isPrivate ? privateMemberIds : [],
        type: channelType,
        icon: channelIcon,
      });
      setChannels((prev) => {
        const next = sortChannels([...prev.filter((c) => c.id !== data.data.id), data.data]);
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
      selectChannel(data.data.id);
      setCreating(false);
      setNewName("");
      setIsPrivate(false);
      setChannelType("TEXT");
      setChannelIcon(null);
      setPrivateMemberIds([]);
      setChannelsOpen(true);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to create channel.");
    }
  };

  const openDm = async (userId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/channels/dm`, { userId });
      setChannels((prev) => {
        let next;
        if (prev.some((c) => c.id === data.data.id)) {
          next = prev.map((c) => (c.id === data.data.id ? data.data : c));
        } else {
          next = [...prev, data.data];
        }
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
      selectChannel(data.data.id);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to open DM.");
    }
  };

  const leaveChannel = async (channel) => {
    if (channel.isDefault || channel.isDm) return;
    const ok = await confirm(`Leave #${channel.name}?`, {
      title: "Leave channel",
      confirmLabel: "Leave",
    });
    if (!ok) return;
    try {
      await api.post(`/projects/${projectId}/channels/${channel.id}/leave`);
      setChannels((prev) => {
        const next = prev.filter((c) => c.id !== channel.id);
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
      setActiveChannelId((prev) => (prev === channel.id ? null : prev));
      setMenuChannelId(null);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to leave channel.");
    }
  };

  const removeChannel = async (channel) => {
    if (channel.isDefault || channel.isDm) return;
    const ok = await confirm(`Delete #${channel.name}?`, {
      title: "Delete channel",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/projects/${projectId}/channels/${channel.id}`);
      setChannels((prev) => {
        const next = prev.filter((c) => c.id !== channel.id);
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
      setActiveChannelId((prev) => (prev === channel.id ? null : prev));
      setMenuChannelId(null);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to delete channel.");
    }
  };

  const saveChannelEdit = async (e) => {
    e.preventDefault();
    if (!editingChannel) return;
    try {
      const { data } = await api.patch(
        `/projects/${projectId}/channels/${editingChannel.id}`,
        { name: editName, icon: editIcon }
      );
      setChannels((prev) => {
        const next = prev.map((c) => (c.id === data.data.id ? { ...c, ...data.data } : c));
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
      setEditingChannel(null);
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to update channel.");
    }
  };

  const saveCanvas = async (canvasDoc) => {
    if (!activeChannelId) return;
    try {
      const { data } = await api.patch(
        `/projects/${projectId}/channels/${activeChannelId}`,
        { canvasDoc }
      );
      setChannels((prev) => {
        const next = prev.map((c) => (c.id === data.data.id ? { ...c, ...data.data } : c));
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
    } catch {
      /* silent autosave */
    }
  };

  const updateActiveIcon = async (icon) => {
    if (!activeChannelId) return;
    try {
      const { data } = await api.patch(
        `/projects/${projectId}/channels/${activeChannelId}`,
        { icon }
      );
      setChannels((prev) => {
        const next = prev.map((c) => (c.id === data.data.id ? { ...c, ...data.data } : c));
        cacheSet(channelsKey(projectId), { data: { data: next } });
        return next;
      });
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to update icon.");
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !activeChannelId) return;
    setSending(true);
    try {
      const { data } = await api.post(
        `/projects/${projectId}/channels/${activeChannelId}/messages`,
        { body }
      );
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.data.id)) return prev;
        const next = [...prev, data.data];
        cacheSet(messagesKey(projectId, activeChannelId), { data: { data: next } });
        return next;
      });
      setDraft("");
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  const onChannelDragEnd = async (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const rooms = roomChannels;
    const reordered = Array.from(rooms);
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPos = reordered.map((c, i) => ({ ...c, position: i }));
    const dms = channels.filter((c) => c.isDm);
    const next = [...withPos, ...dms];
    setChannels(next);
    cacheSet(channelsKey(projectId), { data: { data: next } });

    try {
      await api.patch(`/projects/${projectId}/channels/reorder`, {
        channelIds: withPos.map((c) => c.id),
      });
    } catch (err) {
      await alert(err.response?.data?.message || "Failed to reorder channels.");
      loadChannels({ silent: true, force: true });
    }
  };

  const otherMembers = members.filter((m) => m.user.id !== currentUserId);

  return (
    <div className="team-workspace">
      <aside className="team-rail">
        <div className="team-rail-section">
          <div className="team-rail-row">
            <button
              type="button"
              className="team-rail-label-btn"
              onClick={toggleChannelsOpen}
              aria-expanded={channelsOpen}
            >
              {channelsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="team-rail-label">Channels</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-icon"
              title="Add channel"
              onClick={(e) => {
                e.stopPropagation();
                setChannelsOpen(true);
                setCreating((v) => !v);
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          {channelsOpen && (
            <>
              {creating && (
                <form className="team-create-channel" onSubmit={createChannel}>
                  <input
                    className="input"
                    placeholder="new-channel"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    autoFocus
                  />
                  <div className="team-visibility" role="group" aria-label="Channel visibility">
                    <button
                      type="button"
                      className={`team-visibility-btn ${!isPrivate ? "active" : ""}`}
                      onClick={() => {
                        setIsPrivate(false);
                        setPrivateMemberIds([]);
                      }}
                    >
                      <Hash size={14} /> Public
                    </button>
                    <button
                      type="button"
                      className={`team-visibility-btn ${isPrivate ? "active" : ""}`}
                      onClick={() => setIsPrivate(true)}
                    >
                      <Lock size={14} /> Private
                    </button>
                  </div>
                  <div className="team-visibility" role="group" aria-label="Channel type">
                    <button
                      type="button"
                      className={`team-visibility-btn ${channelType === "TEXT" ? "active" : ""}`}
                      onClick={() => setChannelType("TEXT")}
                    >
                      <Hash size={14} /> Text
                    </button>
                    <button
                      type="button"
                      className={`team-visibility-btn ${channelType === "VOICE" ? "active" : ""}`}
                      onClick={() => {
                        setChannelType("VOICE");
                        if (!channelIcon) setChannelIcon("🔊");
                      }}
                    >
                      <Volume2 size={14} /> Audio
                    </button>
                  </div>
                  <p className="team-rail-label" style={{ margin: "0.15rem 0" }}>Icon</p>
                  <ChannelIconPicker value={channelIcon} onChange={setChannelIcon} />
                  <p className="team-visibility-hint">
                    {isPrivate
                      ? "Only invited members can find and join."
                      : "Anyone on the project can see this channel."}
                  </p>
                  {isPrivate && (
                    <div className="team-private-members">
                      <p className="team-rail-label" style={{ margin: "0.15rem 0" }}>Add members</p>
                      {otherMembers.length === 0 ? (
                        <p className="team-visibility-hint">Invite people to the project first.</p>
                      ) : (
                        otherMembers.map((m) => (
                          <label key={m.user.id} className="team-private-member">
                            <input
                              type="checkbox"
                              checked={privateMemberIds.includes(m.user.id)}
                              onChange={(e) => {
                                setPrivateMemberIds((prev) =>
                                  e.target.checked
                                    ? [...prev, m.user.id]
                                    : prev.filter((id) => id !== m.user.id)
                                );
                              }}
                            />
                            @{m.user.username}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  <div className="team-create-actions">
                    <button type="submit" className="btn btn-sm btn-solid">Create</button>
                    <button type="button" className="btn btn-sm" onClick={() => setCreating(false)}>Cancel</button>
                  </div>
                </form>
              )}

              {loadingChannels && !roomChannels.length ? (
                <div className="skeleton-card" style={{ minHeight: 40, margin: "0.35rem 0" }} />
              ) : (
                <DragDropContext onDragEnd={onChannelDragEnd}>
                  <Droppable droppableId="team-channels">
                    {(provided) => (
                      <div
                        className="team-channel-list"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        data-lenis-prevent
                      >
                        {roomChannels.map((c, index) => (
                          <Draggable key={c.id} draggableId={c.id} index={index}>
                            {(drag, snapshot) => (
                              <div
                                className={`team-channel-row ${snapshot.isDragging ? "dragging" : ""}`}
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                              >
                                <div className="team-channel-drag" {...drag.dragHandleProps}>
                                  <button
                                    type="button"
                                    className={`team-rail-item channel ${activeChannelId === c.id && panel === "chat" ? "active" : ""}`}
                                    onClick={() => selectChannel(c.id)}
                                  >
                                    {c.icon ? (
                                      <span className="channel-glyph-emoji">{c.icon}</span>
                                    ) : c.type === "VOICE" ? (
                                      <Volume2 size={14} />
                                    ) : c.isPrivate ? (
                                      <Lock size={14} />
                                    ) : (
                                      <Hash size={14} />
                                    )}
                                    <span>{c.name}</span>
                                  </button>
                                </div>
                                {!c.isDefault && (
                                  <div className="team-channel-more-wrap">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-icon team-channel-more"
                                      title="More"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMenuChannelId((id) => (id === c.id ? null : c.id));
                                      }}
                                    >
                                      <MoreHorizontal size={14} />
                                    </button>
                                    {menuChannelId === c.id && (
                                      <div className="team-more-menu" role="menu">
                                        {canMaintain && (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            onClick={() => {
                                              setEditingChannel(c);
                                              setEditName(c.name);
                                              setEditIcon(c.icon || null);
                                              setMenuChannelId(null);
                                            }}
                                          >
                                            <Pencil size={13} /> Edit
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => leaveChannel(c)}
                                        >
                                          <LogOut size={13} /> Leave channel
                                        </button>
                                        {canMaintain && (
                                          <button
                                            type="button"
                                            role="menuitem"
                                            className="danger"
                                            onClick={() => removeChannel(c)}
                                          >
                                            <Trash2 size={13} /> Delete
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
              <button
                type="button"
                className="team-rail-item muted"
                onClick={() => {
                  setChannelsOpen(true);
                  setCreating(true);
                }}
              >
                <Plus size={14} /> Add channels
              </button>
            </>
          )}
        </div>

        <div className="team-rail-section team-rail-channels">
          <p className="team-rail-label">Direct messages</p>
          {dmChannels.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`team-rail-item channel ${activeChannelId === c.id && panel === "chat" ? "active" : ""}`}
              onClick={() => selectChannel(c.id)}
            >
              <span className="team-dm-dot" />
              <span>@{c.dmPeer?.username || "user"}</span>
            </button>
          ))}
          {otherMembers
            .filter((m) => !dmChannels.some((c) => c.dmPeer?.id === m.user.id))
            .map((m) => (
              <button
                key={m.user.id}
                type="button"
                className="team-rail-item channel"
                onClick={() => openDm(m.user.id)}
              >
                <span className="team-dm-dot idle" />
                <span>@{m.user.username}</span>
              </button>
            ))}
          <button
            type="button"
            className={`team-rail-item muted ${panel === "invite" ? "active" : ""}`}
            onClick={() => setPanel("invite")}
          >
            <UserPlus size={14} /> Invite people
          </button>
        </div>
      </aside>

      <div className="team-main">
        {panel === "invite" ? (
          <MembersPanel
            projectId={projectId}
            members={members}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onMemberAdded={onMemberAdded}
            onMemberRemoved={onMemberRemoved}
            onMemberUpdated={onMemberUpdated}
          />
        ) : (
          <ChannelChat
            projectId={projectId}
            channel={activeChannel}
            messages={messages}
            draft={draft}
            setDraft={setDraft}
            onSend={sendMessage}
            sending={sending}
            loading={loadingMessages}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            canEditChannel={canMaintain}
            isMaintainer={canMaintain}
            onSaveCanvas={saveCanvas}
            onUpdateIcon={updateActiveIcon}
            voiceEvent={voiceEvent}
          />
        )}
      </div>

      {editingChannel && (
        <div className="modal-overlay" onClick={() => setEditingChannel(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>Edit #{editingChannel.name}</span>
              <button type="button" className="btn btn-sm" onClick={() => setEditingChannel(null)}>
                <X size={12} />
              </button>
            </div>
            <form onSubmit={saveChannelEdit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div className="field">
                <label className="label">Name</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  disabled={editingChannel.isDefault}
                />
              </div>
              <div className="field">
                <label className="label">Icon</label>
                <ChannelIconPicker value={editIcon} onChange={setEditIcon} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setEditingChannel(null)}>Cancel</button>
                <button type="submit" className="btn btn-solid">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
