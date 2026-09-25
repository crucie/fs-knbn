import { useEffect, useState } from "react";
import { Github, RefreshCw, Unplug } from "lucide-react";
import api from "../lib/api";
import { useDialog } from "../context/DialogContext";

/**
 * Maintainer GitHub App connect / sync panel.
 */
export default function GithubPanel({ projectId, canManage, onChanged }) {
  const { alert } = useDialog();
  const [status, setStatus] = useState(null);
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get(`/projects/${projectId}/github/status`)
      .then(({ data }) => {
        setStatus(data.data);
        if (data.data?.connection) {
          setRepoOwner(data.data.connection.repoOwner || "");
          setRepoName(data.data.connection.repoName || "");
          setInstallationId(data.data.connection.installationId || "");
        }
      })
      .catch(() => setStatus({ configured: false }));

  useEffect(() => {
    load();
  }, [projectId]);

  if (!canManage) {
    if (status?.connection) {
      return (
        <div className="github-panel muted">
          <Github size={14} /> Connected to {status.connection.repoOwner}/{status.connection.repoName}
        </div>
      );
    }
    return null;
  }

  const connect = async () => {
    if (!installationId || !repoOwner || !repoName) {
      await alert("Installation ID, owner, and repo are required.");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/github/connect`, {
        installationId,
        repoOwner,
        repoName,
      });
      await load();
      onChanged?.();
    } catch (err) {
      await alert(err.response?.data?.message || "Connect failed.");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/github/sync`);
      await alert(`Synced ${data.data?.updated ?? 0} issue(s).`);
      onChanged?.();
    } catch (err) {
      await alert(err.response?.data?.message || "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.delete(`/projects/${projectId}/github`);
      await load();
      onChanged?.();
    } catch (err) {
      await alert(err.response?.data?.message || "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="github-panel">
      <div className="github-panel-head">
        <Github size={15} />
        <strong>GitHub</strong>
        {!status?.configured && (
          <span className="tag tag-member">App not configured</span>
        )}
      </div>

      {status?.connection ? (
        <div className="github-panel-body">
          <p>
            {status.connection.repoOwner}/{status.connection.repoName}
            {status.connection.lastSyncedAt && (
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                last sync {new Date(status.connection.lastSyncedAt).toLocaleString()}
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={sync}>
              <RefreshCw size={13} /> Sync now
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={disconnect}>
              <Unplug size={13} /> Disconnect
            </button>
            {status.installUrl && (
              <a className="btn btn-sm" href={status.installUrl} target="_blank" rel="noreferrer">
                Manage install
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="github-panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
            Install the GitHub App on your repo, then paste the installation ID and repo below.
          </p>
          {status?.installUrl && (
            <a className="btn btn-sm" href={status.installUrl} target="_blank" rel="noreferrer">
              Install GitHub App
            </a>
          )}
          <input className="input" placeholder="Installation ID" value={installationId} onChange={(e) => setInstallationId(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="owner" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} />
            <input className="input" placeholder="repo" value={repoName} onChange={(e) => setRepoName(e.target.value)} />
          </div>
          <button type="button" className="btn btn-sm btn-solid" disabled={busy || !status?.configured} onClick={connect}>
            Connect
          </button>
        </div>
      )}
    </div>
  );
}
