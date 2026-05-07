import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
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
      const { data } = await api.post("/auth/signup", form);
      login(data.data.token, data.data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-center">
      <div className="auth-box">
        <div className="auth-logo">FS-KNBN</div>
        <div className="auth-tagline">// create account</div>

        <div className="card-hi">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="label">Username</label>
              <input
                id="signup-username"
                className="input"
                name="username"
                autoComplete="username"
                placeholder="your_handle"
                value={form.username}
                onChange={handleChange}
                required
              />
              <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.6rem", color: "var(--text-muted)" }}>
                3–30 chars, letters / numbers / _
              </span>
            </div>

            <div className="field">
              <label className="label">Password</label>
              <input
                id="signup-password"
                className="input"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="min. 6 characters"
                value={form.password}
                onChange={handleChange}
                required
              />
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              id="signup-submit"
              type="submit"
              className="btn btn-solid"
              disabled={loading}
            >
              {loading ? "Creating..." : "[ Create Account ]"}
            </button>
          </form>
        </div>

        <p style={{ marginTop: "1rem", fontFamily: "Space Mono, monospace", fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
          Already registered?{" "}
          <Link to="/login" style={{ color: "var(--text)", textDecoration: "underline" }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
