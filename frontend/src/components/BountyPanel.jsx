import { useState } from "react";
import { Coins } from "lucide-react";
import api from "../lib/api";
import { useDialog } from "../context/DialogContext";
import { isMaintainer, canEditCards } from "../lib/roles";

/**
 * Custodial bounty panel for a card.
 * DRAFT is only shown to maintainers.
 */
export default function BountyPanel({
  projectId,
  taskId,
  bounty,
  myRole,
  onChanged,
}) {
  const { alert } = useDialog();
  const [amount, setAmount] = useState("50");
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [busy, setBusy] = useState(false);
  const maintain = isMaintainer(myRole);
  const canClaim = canEditCards(myRole);

  const visible =
    bounty &&
    (bounty.status !== "DRAFT" || maintain);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      await alert(err.response?.data?.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!visible && !maintain) return null;

  return (
    <section className="bounty-panel">
      <h3 style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
        <Coins size={14} /> Bounty
      </h3>

      {!bounty && maintain && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            style={{ maxWidth: 100 }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
          />
          <button
            type="button"
            className="btn btn-sm btn-solid"
            disabled={busy}
            onClick={() =>
              run(() =>
                api.post(`/projects/${projectId}/tasks/${taskId}/bounty`, {
                  amount: Number(amount),
                })
              )
            }
          >
            Create draft
          </button>
        </div>
      )}

      {bounty && (
        <div className="bounty-status">
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>{bounty.amount}</strong> {bounty.tokenSymbol}{" "}
            <span className="tag">{bounty.status}</span>
            {bounty.claimant && (
              <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
                @{bounty.claimant.username}
              </span>
            )}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {maintain && bounty.status === "DRAFT" && (
              <button
                type="button"
                className="btn btn-sm btn-solid"
                disabled={busy}
                onClick={() => run(() => api.post(`/bounties/${bounty.id}/fund`))}
              >
                Fund (custodial)
              </button>
            )}
            {canClaim && bounty.status === "FUNDED" && (
              <button
                type="button"
                className="btn btn-sm btn-solid"
                disabled={busy}
                onClick={() => run(() => api.post(`/bounties/${bounty.id}/claim`))}
              >
                Claim
              </button>
            )}
            {canClaim && ["CLAIMED", "IN_REVIEW"].includes(bounty.status) && (
              <>
                <input
                  className="input"
                  style={{ maxWidth: 160 }}
                  placeholder="Submission URL"
                  value={submitUrl}
                  onChange={(e) => setSubmitUrl(e.target.value)}
                />
                <input
                  className="input"
                  style={{ maxWidth: 160 }}
                  placeholder="Note"
                  value={submitNote}
                  onChange={(e) => setSubmitNote(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      api.post(`/bounties/${bounty.id}/submit`, {
                        url: submitUrl || undefined,
                        note: submitNote || undefined,
                      })
                    )
                  }
                >
                  Submit for review
                </button>
              </>
            )}
            {maintain && bounty.status === "IN_REVIEW" && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-solid"
                  disabled={busy}
                  onClick={() => run(() => api.post(`/bounties/${bounty.id}/approve`))}
                >
                  Approve & release
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => api.post(`/bounties/${bounty.id}/request-changes`))
                  }
                >
                  Request changes
                </button>
              </>
            )}
            {canClaim && ["CLAIMED", "IN_REVIEW", "FUNDED"].includes(bounty.status) && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => run(() => api.post(`/bounties/${bounty.id}/dispute`))}
              >
                Dispute
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
