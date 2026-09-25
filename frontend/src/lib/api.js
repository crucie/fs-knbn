import axios from "axios";

// Always use same-origin /api in the browser so Vite (dev) or the host
// proxies the request — avoids cross-origin / false "CORS" failures.
const BASE_URL = "/api";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const path = window.location.pathname;
    const isAuthPage = ["/login", "/signup", "/setup-username", "/auth/callback"].includes(path);
    const isPublicBook = path.startsWith("/book/");
    const status = err.response?.status;

    // Only force logout on auth failures — never on 404 / 500
    if (status === 401 && !isAuthPage && !isPublicBook) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
