import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

const api = axios.create({
  baseURL: BASE_URL,
});

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler — only redirect for stale tokens on protected routes
// Do NOT redirect if we're already on /login or /signup (those 401s are just wrong passwords)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthPage = ["/login", "/signup"].includes(window.location.pathname);
    if (err.response?.status === 401 && !isAuthPage) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
