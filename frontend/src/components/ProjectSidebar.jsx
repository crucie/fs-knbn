import { useEffect, useState } from "react";
import {
  Users, LayoutGrid, Table2, Calendar,
  GanttChart, PieChart, PanelLeftClose, PanelLeftOpen, X,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "board", label: "Board", Icon: LayoutGrid },
  { id: "table", label: "Table", Icon: Table2 },
  { id: "calendar", label: "Calendar", Icon: Calendar },
  { id: "timeline", label: "Timeline", Icon: GanttChart },
  { id: "dashboard", label: "Dashboard", Icon: PieChart },
  { id: "team", label: "Team", Icon: Users },
];

export default function ProjectSidebar({
  activeView,
  onViewChange,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}) {
  const [pulseId, setPulseId] = useState(null);

  useEffect(() => {
    if (!pulseId) return undefined;
    const t = setTimeout(() => setPulseId(null), 480);
    return () => clearTimeout(t);
  }, [pulseId]);

  const selectView = (id) => {
    setPulseId(id);
    onViewChange(id);
    onMobileClose?.();
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
          "sidebar project-nav",
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
          {!collapsed && <span className="sidebar-toolbar-label">Project</span>}
        </div>

        <nav className="project-nav-list" aria-label="Project views">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = activeView === id;
            return (
              <button
                key={id}
                type="button"
                className={`project-nav-item ${active ? "active" : ""}`}
                onClick={() => selectView(id)}
                title={label}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={[
                    "nav-icon",
                    active ? "is-active" : "",
                    pulseId === id ? "is-pop" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Icon size={16} strokeWidth={active ? 2.35 : 2} />
                </span>
                {!collapsed && <span className="nav-label">{label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
