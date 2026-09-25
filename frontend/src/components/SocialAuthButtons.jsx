import { useEffect, useState } from "react";
import api from "../lib/api";

function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.5-5.1 3.5-3.1 0-5.6-2.5-5.6-5.6S8.9 6.1 12 6.1c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.8H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 14.4l3 2.2C7.8 18.5 9.7 19.7 12 19.7c2.1 0 3.6-.8 4.4-1.6l-3.1-2.4c-.6.4-1.4.7-2.3.7-1.8 0-3.3-1.2-3.8-2.8l-3.3 1.8z"
      />
      <path
        fill="#4A90E2"
        d="M21.1 12c0-.6-.1-1.1-.2-1.8H12v3.6h5.1c-.3 1.3-1.1 2.3-2.1 3l3.1 2.4c1.9-1.7 3-4.3 3-7.2z"
      />
      <path
        fill="#FBBC05"
        d="M6.9 13.6c-.2-.5-.3-1.1-.3-1.6s.1-1.1.3-1.6L3.6 8.6C2.9 9.6 2.7 10.8 2.7 12s.2 2.4.9 3.4l3.3-1.8z"
      />
    </svg>
  );
}

function GitHubIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.8c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.43.2 2.49.1 2.75.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .26.18.59.69.48A10.28 10.28 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

export default function SocialAuthButtons({ onError, mode = "login" }) {
  const [status, setStatus] = useState({ github: false, google: false });

  useEffect(() => {
    api
      .get("/auth/oauth/status")
      .then(({ data }) => setStatus(data.data || {}))
      .catch(() => {});
  }, []);

  const start = async (provider) => {
    try {
      const path =
        mode === "link"
          ? `/auth/${provider}/connect-url`
          : `/auth/${provider}/url`;
      const { data } = await api.get(path);
      window.location.href = data.data.url;
    } catch (err) {
      onError?.(err.response?.data?.message || `Could not start ${provider} sign-in.`);
    }
  };

  return (
    <div className="social-auth-stack social-auth-icons">
      <button
        type="button"
        className="btn social-btn social-btn-icon"
        disabled={!status.google}
        aria-label="Continue with Google"
        title={status.google ? "Continue with Google" : "Google OAuth not configured"}
        onClick={() => start("google")}
      >
        <GoogleIcon />
      </button>
      <button
        type="button"
        className="btn social-btn social-btn-icon"
        disabled={!status.github}
        aria-label="Continue with GitHub"
        title={status.github ? "Continue with GitHub" : "GitHub OAuth not configured"}
        onClick={() => start("github")}
      >
        <GitHubIcon />
      </button>
    </div>
  );
}
