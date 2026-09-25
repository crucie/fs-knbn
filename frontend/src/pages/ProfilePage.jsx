import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "../components/Navbar";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../context/DialogContext";

export default function ProfilePage() {
  const { user, login, updateUser } = useAuth();
  const { alert } = useDialog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [username, setUsername] = useState(user?.username || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || "");
  const [available, setAvailable] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthReady, setOauthReady] = useState({ github: false, google: false });

  const refreshMe = async () => {
    const { data } = await api.get("/auth/me");
    updateUser(data.data);
    setUsername(data.data.username || "");
    setDisplayName(data.data.displayName || "");
    setWalletAddress(data.data.walletAddress || "");
    return data.data;
  };

  useEffect(() => {
    api
      .get("/auth/oauth/status")
      .then(({ data }) => setOauthReady(data.data || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token = params.get("token");
    const linked = params.get("linked");
    const err = params.get("error");

    (async () => {
      try {
        if (token) {
          localStorage.setItem("token", token);
          const me = await refreshMe();
          login(token, me);
        } else {
          await refreshMe();
        }
      } catch {
        /* ignore */
      }
      if (linked) {
        setSuccess(
          linked === "github"
            ? "GitHub connected. You can sign in with GitHub on this username."
            : linked === "google"
              ? "Google connected. You can sign in with Google on this username."
              : "Account connected."
        );
      }
      if (err) setError(err);
      if (token || linked || err) {
        const next = new URLSearchParams(params);
        next.delete("token");
        next.delete("linked");
        next.delete("error");
        setParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await api.patch("/auth/profile", { displayName, walletAddress });
      await refreshMe();
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err.response?.data?.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  };

  const connect = async (provider) => {
    setError("");
    try {
      const { data } = await api.get(`/auth/${provider}/connect-url`);
      window.location.href = data.data.url;
    } catch (err) {
      setError(err.response?.data?.message || `Could not connect ${provider}.`);
    }
  };

  const disconnect = async (provider) => {
    try {
      const { data } = await api.delete(`/auth/${provider}`);
      updateUser(data.data);
      setSuccess(`${provider === "github" ? "GitHub" : "X"} disconnected.`);
    } catch (err) {
      await alert(err.response?.data?.message || "Could not disconnect.");
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

        <h1 style={{ fontSize: "1.375rem", marginBottom: "0.35rem", fontWeight: 600 }}>Profile</h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
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
              <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>
                @{user?.username}
              </div>
              {user?.email && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
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
                <span style={{ fontSize: "0.75rem", color: "#88cc88" }}>Available</span>
              )}
              {available === false && (
                <span style={{ fontSize: "0.75rem", color: "var(--danger)" }}>Already taken</span>
              )}
            </div>

            <div className="field">
              <label className="label">Display name</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                placeholder="Optional"
              />
            </div>

            <div className="field">
              <label className="label">Wallet address</label>
              <input
                className="input"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                maxLength={128}
                placeholder="For future on-chain bounties"
              />
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
              {loading ? "Saving..." : "Save username"}
            </button>
          </form>

          <div className="divider" />

          <div>
            <div className="label" style={{ marginBottom: "0.75rem" }}>Connected accounts</div>
            <div className="connected-accounts">
              <div className="connected-row">
                <div>
                  <strong>GitHub</strong>
                  <div className="meet-cal-sub">
                    {user?.githubConnected
                      ? `@${user.githubUsername || "connected"}`
                      : oauthReady.github
                        ? "Not connected"
                        : "Not configured on server"}
                  </div>
                </div>
                {user?.githubConnected ? (
                  <button type="button" className="btn btn-sm" onClick={() => disconnect("github")}>
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-solid"
                    disabled={!oauthReady.github}
                    onClick={() => connect("github")}
                  >
                    Connect
                  </button>
                )}
              </div>

              <div className="connected-row">
                <div>
                  <strong>Google</strong>
                  <div className="meet-cal-sub">
                    {user?.googleConnected
                      ? "Connected"
                      : oauthReady.google
                        ? "Not connected"
                        : "Not configured"}
                  </div>
                </div>
                {user?.googleConnected ? (
                  <span className="meet-cal-sub">Linked</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-solid"
                    disabled={!oauthReady.google}
                    onClick={() => connect("google")}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
