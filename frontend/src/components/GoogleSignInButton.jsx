import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In.")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In."));
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ onError, onSuccess }) {
  const { login } = useAuth();
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredential = useCallback(
    async (response) => {
      try {
        const { data } = await api.post("/auth/google", { idToken: response.credential });
        login(data.data.token, data.data.user);
        onSuccess?.(data.data.user);
      } catch (err) {
        onError?.(err.response?.data?.message || "Google Sign-In failed.");
      }
    },
    [login, onError, onSuccess]
  );

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    loadGisScript()
      .then(() => {
        if (cancelled || !btnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with",
          shape: "rectangular",
        });
        setReady(true);
      })
      .catch((err) => onError?.(err.message));

    return () => {
      cancelled = true;
    };
  }, [clientId, handleCredential, onError]);

  if (!clientId) {
    return (
      <div className="error-msg" style={{ textAlign: "center" }}>
        VITE_GOOGLE_CLIENT_ID is not set.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      {!ready && (
        <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.65rem", color: "var(--text-muted)" }}>
          Loading Google...
        </span>
      )}
      <div ref={btnRef} id="google-signin-btn" />
    </div>
  );
}
