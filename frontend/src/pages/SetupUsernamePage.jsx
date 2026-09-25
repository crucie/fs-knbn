import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function SetupUsernamePage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [available, setAvailable] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await api.get("/auth/me");
      } catch (err) {
        if (err.response?.status === 401) {
          logout();
          navigate("/login", { replace: true });
        }
      }
    })();
  }, [logout, navigate]);

  useEffect(() => {
    if (!username || username.length < 3) {
      setAvailable(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/auth/username-available", {
          params: { username },
        });
        setAvailable(data.data.available);
      } catch {
        setAvailable(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.patch("/auth/username", { username });
      login(data.data.token, data.data.user);
      navigate("/");
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || "Could not set username.";
      if (status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setError("Session expired. Sign in again with Google, then connect GitHub from Profile.");
        setTimeout(() => navigate("/login", { replace: true }), 1200);
        return;
      }
      setError(msg);
      if (status === 409) setAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="auth-box">
        <div className="auth-logo">FS-KNBN</div>
        <div className="auth-tagline">Choose your username</div>

        <div className="card-hi">
          <p style={{ fontFamily: "var(--font)", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem", lineHeight: 1.5 }}>
            Pick a unique username. Teammates invite you to projects with this handle
            {user?.email ? (
              <>
                {" "}
                (<span style={{ color: "var(--text)" }}>{user.email}</span>)
              </>
            ) : null}
            .
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="label">Username *</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                placeholder="your_handle"
                autoFocus
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
              />
              <span style={{ fontFamily: "var(--font)", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                3–30 chars · letters, numbers, _
              </span>
              {available === true && (
                <span style={{ fontFamily: "var(--font)", fontSize: "0.75rem", color: "#88cc88" }}>
                  Available
                </span>
              )}
              {available === false && (
                <span style={{ fontFamily: "var(--font)", fontSize: "0.75rem", color: "var(--danger)" }}>
                  Already taken
                </span>
              )}
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              type="submit"
              className="btn btn-solid"
              disabled={loading || available === false || username.length < 3}
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
