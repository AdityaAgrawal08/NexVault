import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { apiRequest, clearSession } from "@/shared/utils/apiClient";

interface UserSession {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  role?: string;
  twoFactorEnabled?: boolean;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const userJson = localStorage.getItem("user");

  if (!userJson) {
    return <Navigate to="/login" replace />;
  }

  let initialUser: UserSession;
  try {
    initialUser = JSON.parse(userJson);
  } catch (err) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  const [user] = useState<UserSession>(initialUser);

  async function handleLogout() {
    try {
      await apiRequest("/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      clearSession();
      navigate("/login");
    }
  }

  return (
    <div className="page-center">
      <div className="card profile-card">
        <div className="profile-header">
          <div className="profile-avatar">
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          <h1 className="profile-title">Welcome, {user.username}!</h1>
          <p className="profile-subtitle">Your secure profile details</p>
        </div>

        <div className="profile-details">
          <div className="profile-field">
            <span className="profile-field-label">Username</span>
            <span className="profile-field-value">{user.username}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Email Address</span>
            <span className="profile-field-value">{user.email}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Phone Number</span>
            <span className="profile-field-value">{user.phoneNumber}</span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Account Role</span>
            <span className="profile-field-value" style={{ textTransform: "capitalize", fontWeight: "600", color: "var(--color-accent)" }}>
              {user.role?.toLowerCase() || "user"}
            </span>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">Two-Factor Authentication</span>
            <span className="profile-field-value" style={{ color: "var(--color-success)" }}>
              Active (Enforced)
            </span>
          </div>
        </div>

        {/* Sessions & Security Management Area */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", margin: 0, color: "var(--color-foreground)" }}>
            Security Settings
          </h3>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>Active Sessions & Devices</span>
            <Link to="/sessions" style={{
              fontSize: "13px",
              color: "var(--color-accent)",
              textDecoration: "none",
              fontWeight: "600",
            }}>
              Manage Sessions →
            </Link>
          </div>

          <div style={{
            background: "rgba(16, 185, 129, 0.04)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
            padding: "1rem",
            borderRadius: "var(--radius)",
            color: "var(--color-success)",
            fontSize: "13px",
            lineHeight: "1.5",
          }}>
            <strong>✓ MFA is active.</strong> Your account is protected with Time-based One-Time Passwords (TOTP). For your security, multi-factor authentication is mandatory and cannot be disabled.
          </div>
        </div>

        <button onClick={handleLogout} className="logout-btn" style={{ marginTop: "1.5rem" }}>
          Log out
        </button>
      </div>
    </div>
  );
}
