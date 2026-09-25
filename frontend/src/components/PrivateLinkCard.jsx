import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";

function formatRemaining(ms) {
  if (ms <= 0) return "Expired";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")} left`;
}

export default function PrivateLinkCard({ invite, onRefresh, refreshing = false }) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (!invite?.path) return "";
    return `${window.location.origin}${invite.path}`;
  }, [invite]);

  const expiresAt = invite?.expiresAt ? new Date(invite.expiresAt).getTime() : 0;
  const remaining = expiresAt - now;
  const expired = remaining <= 0;

  useEffect(() => {
    if (!invite?.expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [invite?.expiresAt]);

  useEffect(() => {
    setCopied(false);
  }, [url]);

  const copy = async () => {
    if (!url || expired) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  if (!invite) return null;

  return (
    <div className={`private-link-card ${expired ? "expired" : ""}`}>
      <div className="private-link-head">
        <span className="private-link-label">
          <Link2 size={13} /> Private link
        </span>
        <span className={`private-link-timer ${expired ? "is-expired" : ""}`}>
          {expired
            ? "Expired"
            : formatRemaining(remaining)}
        </span>
      </div>

      <div className="private-link-row">
        <input
          className="private-link-input"
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
          title={url}
        />
        <button
          type="button"
          className={`btn btn-sm private-link-copy ${copied ? "copied" : ""}`}
          onClick={copy}
          disabled={expired}
          title={expired ? "Link expired — refresh" : "Copy link"}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      <div className="private-link-foot">
        <span className="private-link-meta">
          {expired
            ? "Generate a new link to share this day."
            : `Valid until ${new Date(expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onRefresh}
          disabled={refreshing}
          title="New 30‑min link"
        >
          <RefreshCw size={13} className={refreshing ? "spin" : undefined} />
          {expired ? "New link" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
