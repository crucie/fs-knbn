import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Handles OAuth redirects: /auth/callback?token=...&setup=0|1 */
export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = params.get("token");
    const setup = params.get("setup") === "1";
    const err = params.get("error");
    if (err) {
      setError(err);
      return;
    }
    if (!token) {
      setError("Missing auth token.");
      return;
    }
    (async () => {
      try {
        localStorage.setItem("token", token);
        const res = await fetch(`/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Auth failed");
        login(token, json.data);
        navigate(setup || json.data.usernameSet === false ? "/setup-username" : "/", {
          replace: true,
        });
      } catch (e) {
        setError(e.message || "Sign-in failed.");
      }
    })();
  }, [params, login, navigate]);

  return (
    <div className="page-center">
      {error ? (
        <div className="error-msg" style={{ maxWidth: 360 }}>
          {error}
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={() => navigate("/login")}>
              Back to login
            </button>
          </div>
        </div>
      ) : (
        <div className="skeleton-card" style={{ width: 180, minHeight: 48 }} />
      )}
    </div>
  );
}
