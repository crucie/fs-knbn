import { useEffect, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";

const PRESETS = [
  "#FF2D2D",
  "#EB5A46",
  "#FF9F1A",
  "#F2D600",
  "#61BD4F",
  "#00C2E0",
  "#4A90E2",
  "#C377E0",
  "#FF78CB",
  "#9B6B4F",
  "#888888",
  "#F2F2F4",
];

function normalizeHex(raw) {
  let h = String(raw || "").trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{3}$/.test(h)) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return `#${h}`;
}

export default function ColorPicker({ value = "#888888", onChange, title = "Edit color" }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState((value || "#888888").toUpperCase());
  const rootRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    setHex((value || "#888888").toUpperCase());
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (next) => {
    const normalized = normalizeHex(next);
    if (!normalized) return;
    setHex(normalized);
    onChange?.(normalized);
  };

  const commitHex = () => {
    const normalized = normalizeHex(hex);
    if (normalized) {
      apply(normalized);
    } else {
      setHex((value || "#888888").toUpperCase());
    }
  };

  return (
    <div className="color-picker" ref={rootRef}>
      <button
        type="button"
        className={`color-picker-trigger ${open ? "open" : ""}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Pencil size={13} strokeWidth={2.2} />
      </button>

      {open && (
        <div
          id={panelId}
          className="color-picker-panel"
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="color-picker-current">
            <span className="color-picker-swatch-lg" style={{ background: value || "#888888" }} />
            <span className="color-picker-current-label">Column color</span>
          </div>
          <div className="color-picker-grid">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-picker-chip ${normalizeHex(value) === c ? "selected" : ""}`}
                style={{ background: c }}
                title={c}
                aria-label={c}
                onClick={() => {
                  apply(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <div className="color-picker-hex-row">
            <span className="color-picker-hash">#</span>
            <input
              className="input color-picker-hex"
              value={hex.replace(/^#/, "")}
              maxLength={6}
              spellCheck={false}
              aria-label="Hex color"
              onChange={(e) => setHex(`#${e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6)}`)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHex();
                  setOpen(false);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-solid"
              onClick={() => {
                commitHex();
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
