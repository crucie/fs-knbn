import { useAuth } from "../context/AuthContext";
import { LogOut, Terminal, UserRound } from "lucide-react";
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
      <Terminal size={18} strokeWidth={2.5} />
      <span
        className="navbar-brand"
        onClick={() => navigate("/")}
      >
        FS-KNBN
      </span>

      <div style={{ flex: 1 }} />

      {user && (
        <div className="navbar-actions">
          <button
            type="button"
            className="navbar-profile"
            onClick={() => navigate("/profile")}
            title="Profile"
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="navbar-avatar" referrerPolicy="no-referrer" />
            ) : (
              <span className="navbar-avatar-fallback">
                <UserRound size={14} />
              </span>
            )}
            <span className="navbar-username">@{user.username}</span>
          </button>
          <button
            id="nav-logout"
            className="btn btn-sm"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut size={14} />
            <span className="nav-logout-label">Logout</span>
          </button>
        </div>
      )}
    </nav>
  );
}
