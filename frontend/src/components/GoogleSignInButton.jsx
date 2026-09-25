import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisScriptPromise = null;
let gisInitializedFor = null;
let activeCredentialHandler = null;

function loadGisScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => {
        gisScriptPromise = null;
        reject(new Error("Failed to load Google Sign-In."));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error("Failed to load Google Sign-In."));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

function ensureGisInitialized(clientId) {
  if (!window.google?.accounts?.id) return;
  if (gisInitializedFor === clientId) return;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => activeCredentialHandler?.(response),
    cancel_on_tap_outside: true,
  });
  gisInitializedFor = clientId;
}

export default function GoogleSignInButton({ onError, onSuccess, mode = "login" }) {
  const { login, updateUser } = useAuth();
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleCredential = useCallback(
    async (response) => {
      try {
        const { data } = await api.post("/auth/google", {
          idToken: response.credential,
          mode,
        });
        login(data.data.token, data.data.user);
        if (mode === "link") updateUser(data.data.user);
        onSuccess?.(data.data.user, data.data);
      } catch (err) {
        onError?.(err.response?.data?.message || "Google Sign-In failed.");
      }
    },
    [login, updateUser, onError, onSuccess, mode]
  );

  useEffect(() => {
    activeCredentialHandler = handleCredential;
    return () => {
      if (activeCredentialHandler === handleCredential) {
        activeCredentialHandler = null;
      }
    };
  }, [handleCredential]);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    loadGisScript()
      .then(() => {
        if (cancelled || !btnRef.current) return;
        ensureGisInitialized(clientId);
        btnRef.current.innerHTML = "";
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
  }, [clientId, onError]);

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
        <div className="skeleton-card" style={{ width: 220, minHeight: 40, borderRadius: 8 }} />
      )}
      <div ref={btnRef} className="google-signin-btn" />
    </div>
  );
}
