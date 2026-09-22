import { useState } from "react";
import { UserPlus, Trash2, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import api from "../lib/api";

export default function ProjectSidebar({
  projectId,
  members,
  onMemberAdded,
  onMemberRemoved,
  currentUserId,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}) {
  const [inviteValue, setInviteValue] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);

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
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={[
          "sidebar",
          collapsed ? "sidebar-collapsed" : "",
          mobileOpen ? "sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="sidebar-toolbar">
          <button
            type="button"
            className="btn btn-sm sidebar-toggle-desktop"
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <button
            type="button"
            className="btn btn-sm sidebar-toggle-mobile"
            onClick={onMobileClose}
            title="Close"
          >
            <X size={15} />
          </button>
          {!collapsed && <span className="sidebar-toolbar-label">Team</span>}
        </div>

        {!collapsed && (
          <div className="sidebar-body">
            <section className="sidebar-section">
              <p className="sidebar-section-title">
                <UserPlus size={14} /> Invite by username
              </p>
              <p className="sidebar-hint">
                Use their unique @username (or email).
              </p>
              <form className="sidebar-invite-form" onSubmit={handleInvite}>
                <input
                  id="invite-username"
                  className="input"
                  placeholder="@username"
                  value={inviteValue}
                  onChange={(e) => setInviteValue(e.target.value)}
                  required
                />
                {inviteError && <div className="error-msg">{inviteError}</div>}
                <button id="invite-submit" type="submit" className="btn btn-solid" disabled={inviteLoading}>
                  {inviteLoading ? "Inviting..." : "[ Invite ]"}
                </button>
              </form>
            </section>

            <hr className="sidebar-divider" />

            <section className="sidebar-section">
              <p className="sidebar-section-title">Members</p>
              <div className="sidebar-member-list">
                {members.map((m) => (
                  <div key={m.user.id} className="member-row">
                    <div className="member-info">
                      <span className="member-name">@{m.user.username}</span>
                      {m.user.email && (
                        <span className="member-email">{m.user.email}</span>
                      )}
                      <span className={`tag ${m.role === "ADMIN" ? "tag-admin" : "tag-member"}`}>
                        {m.role}
                      </span>
                    </div>
                    {m.user.id !== currentUserId && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemove(m.user.id)}
                        title="Remove member"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
