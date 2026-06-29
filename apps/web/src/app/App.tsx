import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RegisterPage from "@/features/auth/pages/RegisterPage";
import LoginPage from "@/features/auth/pages/LoginPage";
import ProfilePage from "@/features/auth/pages/ProfilePage";
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
        const result = await apiRequest("http://localhost:3000/refresh", {
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
    </Routes>
  );
}
