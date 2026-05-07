import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", form);
      login(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="auth-box">
        <div className="auth-logo">FS-KNBN</div>
        <div className="auth-tagline">// team task manager</div>

        <div className="card-hi">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="label">Username</label>
              <input
                id="login-username"
                className="input"
                name="username"
                autoComplete="username"
                placeholder="your_handle"
                value={form.username}
                onChange={handleChange}
                required
              />
            </div>

            <div className="field">
              <label className="label">Password</label>
              <input
                id="login-password"
                className="input"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              id="login-submit"
              type="submit"
              className="btn btn-solid"
              disabled={loading}
            >
              {loading ? "Authenticating..." : "[ Login ]"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: "1rem", fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
          No account?{" "}
          <Link to="/signup" style={{ color: "var(--text)", textDecoration: "underline" }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
