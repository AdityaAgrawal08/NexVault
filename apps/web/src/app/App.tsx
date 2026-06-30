import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RegisterPage from "@/features/auth/pages/RegisterPage";
import LoginPage from "@/features/auth/pages/LoginPage";
import ProfilePage from "@/features/auth/pages/ProfilePage";
import ForgotPasswordPage from "@/features/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/pages/ResetPasswordPage";
import VerifyAccountPage from "@/features/auth/pages/VerifyAccountPage";
import SessionsPage from "@/features/auth/pages/SessionsPage";
import { apiRequest, setAccessToken } from "@/shared/utils/apiClient";

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      // Only attempt restore if there was a user in localStorage
      if (!localStorage.getItem("user")) {
        setLoading(false);
        return;
      }

      try {
        const result = await apiRequest("/refresh", {
          method: "POST",
        });
        setAccessToken(result.data.accessToken);
        localStorage.setItem("user", JSON.stringify(result.data.user));
      } catch (err) {
        localStorage.removeItem("user");
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  if (loading) {
    return (
      <div className="page-center">
        <div style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500 }}>
          Restoring secure session…
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/register" replace />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-account" element={<VerifyAccountPage />} />
    </Routes>
  );
}
