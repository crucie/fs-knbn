import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { isAuth, needsUsername } = useAuth();
  const location = useLocation();

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  if (needsUsername && location.pathname !== "/setup-username") {
    return <Navigate to="/setup-username" replace />;
  }

  if (!needsUsername && location.pathname === "/setup-username") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
