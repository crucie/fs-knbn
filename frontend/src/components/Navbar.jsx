import { useAuth } from "../context/AuthContext";
import { LogOut, Terminal } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <Terminal size={14} strokeWidth={2.5} />
      <span
        style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "0.8rem", letterSpacing: "-0.02em", cursor: "pointer" }}
        onClick={() => navigate("/")}
      >
        FS-KNBN
      </span>

      <div style={{ flex: 1 }} />

      {user && (
        <>
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "var(--text-muted)" }}>
            [{user.username}]
          </span>
          <button
            id="nav-logout"
            className="btn btn-sm"
            onClick={handleLogout}
            title="Logout"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <LogOut size={11} />
            Logout
          </button>
        </>
      )}
    </nav>
  );
}
