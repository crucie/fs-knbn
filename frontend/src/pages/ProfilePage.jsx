import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "../components/Navbar";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, login, updateUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user?.username || "");
  const [available, setAvailable] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/auth/me")
      .then(({ data }) => updateUser(data.data))
      .catch(() => {});
  }, [updateUser]);

  useEffect(() => {
    if (!username || username.length < 3 || username === user?.username) {
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
  }, [username, user?.username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (username === user?.username) {
      setSuccess("No changes to save.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.patch("/auth/username", { username });
      const token = localStorage.getItem("token");
      login(data.data.token || token, data.data.user);
      setSuccess("Username updated. Teammates can invite you with this handle.");
    } catch (err) {
      setError(err.response?.data?.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="page-body" style={{ maxWidth: 560 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => navigate("/")}
          style={{ marginBottom: "1.25rem" }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.35rem" }}>// Profile</h1>
        <p style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
          Your username is how others add you to projects.
        </p>

        <div className="card-hi" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="profile-avatar" referrerPolicy="no-referrer" />
            ) : (
              <div className="profile-avatar profile-avatar-fallback">
                {(user?.username || "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontFamily: "Space Mono, monospace", fontWeight: 700, fontSize: "1.05rem" }}>
                @{user?.username}
              </div>
              {user?.email && (
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {user.email}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
              />
              {available === true && (
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "#88cc88" }}>
                  Available
                </span>
              )}
              {available === false && (
                <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "var(--danger)" }}>
                  Already taken
                </span>
              )}
            </div>

            {error && <div className="error-msg">{error}</div>}
            {success && (
              <div className="error-msg" style={{ color: "#88cc88", borderColor: "#88cc88" }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-solid"
              disabled={loading || available === false}
            >
              {loading ? "Saving..." : "[ Save username ]"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
