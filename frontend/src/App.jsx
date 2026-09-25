import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DialogProvider } from "./context/DialogContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { SmoothScroll } from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import SetupUsernamePage from "./pages/SetupUsernamePage";
import ProfilePage from "./pages/ProfilePage";
import DashboardPage from "./pages/DashboardPage";
import ProjectPage from "./pages/ProjectPage";
import UserCalendarPage from "./pages/UserCalendarPage";
import PublicBookingPage from "./pages/PublicBookingPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import { warmCache } from "./lib/queryCache";

function PrefetchWarm() {
  useEffect(() => {
    warmCache();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SmoothScroll />
      <DialogProvider>
        <AuthProvider>
          <PrefetchWarm />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            <Route path="/book/:username/private/:token" element={<PublicBookingPage />} />
            <Route path="/book/:username/:slotSlug" element={<PublicBookingPage />} />
            <Route path="/book/:username" element={<PublicBookingPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/setup-username" element={<SetupUsernamePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/calendar" element={<UserCalendarPage />} />
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects/:projectId" element={<ProjectPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </DialogProvider>
    </BrowserRouter>
  );
}
