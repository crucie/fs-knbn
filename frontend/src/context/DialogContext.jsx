import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    if (resolve) resolve(result);
  }, []);

  const alert = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: "alert",
        title: options.title || "Notice",
        message: String(message ?? ""),
        confirmLabel: options.confirmLabel || "OK",
      });
    });
  }, []);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: "confirm",
        title: options.title || "Confirm",
        message: String(message ?? ""),
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        danger: !!options.danger,
      });
    });
  }, []);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="modal-overlay app-dialog-overlay"
          role="presentation"
          onClick={() => close(dialog.type === "confirm" ? false : undefined)}
        >
          <div
            className="modal-box app-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" id="app-dialog-title">
              {dialog.title}
            </div>
            <p className="app-dialog-message" id="app-dialog-desc">
              {dialog.message}
            </p>
            <div className="app-dialog-actions">
              {dialog.type === "confirm" && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => close(false)}
                  autoFocus={!dialog.danger}
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                className={`btn ${dialog.danger ? "btn-danger" : "btn-solid"}`}
                onClick={() => close(dialog.type === "confirm" ? true : undefined)}
                autoFocus={dialog.type === "alert" || dialog.danger}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within DialogProvider");
  }
  return ctx;
}
