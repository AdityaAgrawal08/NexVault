import { useState, useEffect, FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { apiRequest, clearSession } from "@/shared/utils/apiClient";
import ReauthModal from "@/shared/components/ReauthModal";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import { isPasswordStrong } from "@/shared/utils/passwordStrength";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";

interface ActiveSession {
  id: string;
  ipAddress: string;
  browser: string;
  os: string;
  createdAt: string;
  expiresAt: string;
  isCurrent?: boolean;
  location?: string;
}

interface AuditLog {
  id: string;
  action: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  metadata?: any;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const userJson = localStorage.getItem("user");

  if (!userJson) {
    return <Navigate to="/login" replace />;
  }

  // General Settings State
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "preferences">("profile");
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  
  // Profile Form Editing State
  const [editUsername, setEditUsername] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [avatarColor, setAvatarColor] = useState("#3b82f6"); // simulated avatar color selector

  // Re-auth State
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthAction, setReauthAction] = useState<"password" | "email" | "delete" | null>(null);
  const [reauthToken, setReauthToken] = useState("");

  // Change Password Form State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const newPwField = usePasswordVisibility();
  const newCpwField = usePasswordVisibility();

  // Change Email Form State
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Active Sessions & Audit Logs State
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionActionLoading, setSessionActionLoading] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  // Simulated MFA & Recovery State
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [recoveryOption, setRecoveryOption] = useState("email");

  // Preferences State
  const [theme, setTheme] = useState(() => localStorage.getItem("nexvault_theme") || "system");
  const [language, setLanguage] = useState(() => localStorage.getItem("nexvault_lang") || "en");
  const [notifSecurity, setNotifSecurity] = useState(true);
  const [notifActivity, setNotifActivity] = useState(true);
  const [notifDigests, setNotifDigests] = useState(false);
  const [privacyTelemetry, setPrivacyTelemetry] = useState(true);
  const [privacyLogs, setPrivacyLogs] = useState(true);

  // Secure Account Deletion Dialog State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"verify_method" | "verify_password" | "verify_email_otp" | "final_warning">("verify_method");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deleteOtpInput, setDeleteOtpInput] = useState("");
  const [deleteVerificationToken, setDeleteVerificationToken] = useState("");
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const deletePwField = usePasswordVisibility();

  // Load profile, sessions and audit logs
  const fetchProfile = async () => {
    setProfileLoading(true);
    setProfileError("");
    try {
      const res = await apiRequest("/profile");
      setProfileData(res.data);
      setEditUsername(res.data.username);
      setEditPhone(res.data.phoneNumber || "");
      setMfaEnabled(res.data.twoFactorEnabled);
      // Sync local storage user
      localStorage.setItem("user", JSON.stringify(res.data));
    } catch (err: any) {
      setProfileError(err.message || "Failed to load profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchSessions = async () => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const res = await apiRequest("/sessions");
      setSessions(res.data);
    } catch (err: any) {
      setSessionsError(err.message || "Failed to load active sessions.");
    } finally {
      setSessionsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setAuditLogsLoading(true);
    try {
      const res = await apiRequest("/audit-logs");
      setAuditLogs(res.data || []);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchSessions();
    fetchAuditLogs();
  }, []);

  // Update HTML body theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.style.setProperty("--color-bg", "#0d1117");
      root.style.setProperty("--color-card", "#161b22");
      root.style.setProperty("--color-surface", "#21262d");
      root.style.setProperty("--color-border", "#30363d");
      root.style.setProperty("--color-text", "#f8fafc");
    } else if (theme === "light") {
      root.style.setProperty("--color-bg", "#f4f5f7");
      root.style.setProperty("--color-card", "#ffffff");
      root.style.setProperty("--color-surface", "#f8f9fa");
      root.style.setProperty("--color-border", "#e1e4e8");
      root.style.setProperty("--color-text", "#1f2328");
    } else {
      // System Theme
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.style.setProperty("--color-bg", systemDark ? "#0d1117" : "#f4f5f7");
      root.style.setProperty("--color-card", systemDark ? "#161b22" : "#ffffff");
      root.style.setProperty("--color-surface", systemDark ? "#21262d" : "#f8f9fa");
      root.style.setProperty("--color-border", systemDark ? "#30363d" : "#e1e4e8");
      root.style.setProperty("--color-text", systemDark ? "#f8fafc" : "#1f2328");
    }
  }, [theme]);

  // Handle general logout
  const handleLogout = async () => {
    try {
      await apiRequest("/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      clearSession();
      navigate("/login");
    }
  };

  // --- Profile Edits ---
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUsername.trim()) {
      setProfileError("Username cannot be empty.");
      return;
    }
    setProfileEditLoading(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      await apiRequest("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          username: editUsername.trim(),
          phoneNumber: editPhone.trim(),
        }),
      });
      setProfileSuccess("Profile updated successfully!");
      // Reload profile details to sync state
      await fetchProfile();
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setProfileEditLoading(false);
    }
  };

  // --- Change Password ---
  const triggerSensitiveAction = (action: "password" | "email" | "delete") => {
    setReauthAction(action);
    setReauthOpen(true);
  };

  const handleReauthSuccess = async (token: string) => {
    setReauthToken(token);
    if (reauthAction === "email") {
      await sendEmailChangeOTP(token);
    }
  };

  const submitPasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (!isPasswordStrong(newPassword)) {
      setPasswordError("Password does not meet strength requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (!reauthToken) {
      triggerSensitiveAction("password");
      return;
    }

    setPasswordLoading(true);
    setPasswordError("");
    setPasswordSuccess("");

    try {
      await apiRequest("/profile/change-password", {
        method: "POST",
        headers: { "X-Reauth-Token": reauthToken },
        body: JSON.stringify({ newPassword }),
      });
      setPasswordSuccess("Password updated! Revoking all sessions. Logging out in 3s...");
      setNewPassword("");
      setConfirmPassword("");
      setReauthToken("");
      setTimeout(() => {
        clearSession();
        navigate("/login", { state: { message: "Password updated successfully. Please log in again." } });
      }, 3000);
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("password");
      } else {
        setPasswordError(err.message || "Failed to change password.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // --- Change Email ---
  const sendEmailChangeOTP = async (token = reauthToken) => {
    if (!newEmail || !newEmail.includes("@")) {
      setEmailError("Please enter a valid new email address.");
      return;
    }
    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      await apiRequest("/profile/change-email/send-otp", {
        method: "POST",
        headers: { "X-Reauth-Token": token },
        body: JSON.stringify({ newEmail }),
      });
      setEmailOtpSent(true);
      setEmailSuccess("Verification OTP code sent to your new email address.");
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("email");
      } else {
        setEmailError(err.message || "Failed to send code.");
      }
    } finally {
      setEmailLoading(false);
    }
  };

  const verifyEmailChange = async (e: FormEvent) => {
    e.preventDefault();
    if (emailOtp.length !== 6) {
      setEmailError("Please enter a 6-digit OTP code.");
      return;
    }
    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      await apiRequest("/profile/change-email/verify", {
        method: "POST",
        headers: { "X-Reauth-Token": reauthToken },
        body: JSON.stringify({ newEmail, otp: emailOtp.trim() }),
      });
      setEmailSuccess("Email updated successfully!");
      setNewEmail("");
      setEmailOtp("");
      setEmailOtpSent(false);
      setReauthToken("");
      await fetchProfile();
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("email");
      } else {
        setEmailError(err.message || "Failed to update email.");
      }
    } finally {
      setEmailLoading(false);
    }
  };

  // --- Active Sessions End ---
  const handleEndSession = async (sessionId: string) => {
    setSessionActionLoading(sessionId);
    try {
      await apiRequest(`/sessions/${sessionId}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      alert(err.message || "Failed to end session.");
    } finally {
      setSessionActionLoading(null);
    }
  };

  const triggerRevokeOthers = () => {
    if (reauthToken) {
      handleRevokeOthers(reauthToken);
    } else {
      triggerSensitiveAction("password"); // Require password check to clear others
    }
  };

  const handleRevokeOthers = async (token = reauthToken) => {
    setSessionActionLoading("others");
    try {
      await apiRequest("/sessions/revoke-others", {
        method: "POST",
        headers: { "X-Reauth-Token": token },
      });
      setReauthToken("");
      await fetchSessions();
      alert("All other sessions revoked.");
    } catch (err: any) {
      alert(err.message || "Failed to revoke other sessions.");
    } finally {
      setSessionActionLoading(null);
    }
  };

  // --- Simulated MFA Toggle ---
  const handleToggleMfa = async () => {
    setMfaLoading(true);
    setTimeout(() => {
      setMfaEnabled(!mfaEnabled);
      setMfaLoading(false);
    }, 600);
  };

  // --- Deletion Flow (Custom Dialog Modal Steps) ---
  const openDeleteDialog = () => {
    setDeleteError("");
    setDeletePassword("");
    setDeleteEmailInput("");
    setDeleteOtpInput("");
    setDeleteVerificationToken("");
    setDeleteOtpSent(false);
    setDeleteConfirmChecked(false);
    setDeleteStep("verify_method");
    setDeleteModalOpen(true);
  };

  const handleDeletionVerifyMethod = (method: "password" | "email") => {
    setDeleteError("");
    if (method === "password") {
      setDeleteStep("verify_password");
    } else {
      setDeleteStep("verify_email_otp");
    }
  };

  const handleDeletionPasswordVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!deletePassword) {
      setDeleteError("Password is required.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError("");
    try {
      // Reauth with password
      const res = await apiRequest("/reauth/password", {
        method: "POST",
        body: JSON.stringify({ password: deletePassword }),
      });
      setDeleteVerificationToken(res.data.reauthToken);
      
      // Step to next stage: hit request delete
      await requestDeletionAPI(res.data.reauthToken);
    } catch (err: any) {
      setDeleteError(err.message || "Incorrect password.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeletionEmailVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteEmailInput.trim()) {
      setDeleteError("Email address is required.");
      return;
    }
    if (deleteEmailInput.trim().toLowerCase() !== profileData?.email.toLowerCase()) {
      setDeleteError("Entered email does not match registered email.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError("");
    try {
      if (!deleteOtpSent) {
        // Send OTP
        await apiRequest("/reauth/otp/send", { method: "POST" });
        setDeleteOtpSent(true);
        setDeleteError("");
      } else {
        // Verify OTP
        const res = await apiRequest("/reauth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ otp: deleteOtpInput.trim() }),
        });
        setDeleteVerificationToken(res.data.reauthToken);
        
        // Request Deletion
        await requestDeletionAPI(res.data.reauthToken);
      }
    } catch (err: any) {
      setDeleteError(err.message || "Verification failed. Check code.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const requestDeletionAPI = async (token: string) => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await apiRequest("/profile/delete/request", {
        method: "POST",
        headers: { "X-Reauth-Token": token },
      });
      setDeleteStep("final_warning");
    } catch (err: any) {
      setDeleteError(err.message || "Failed to register account deletion request.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFinalDeletion = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteConfirmChecked) {
      setDeleteError("You must check the confirmation check box.");
      return;
    }
    if (!deleteOtpInput) {
      setDeleteError("Verification code from email is required.");
      return;
    }

    setDeleteLoading(true);
    setDeleteError("");
    try {
      await apiRequest("/profile/delete/confirm", {
        method: "POST",
        headers: { "X-Reauth-Token": deleteVerificationToken },
        body: JSON.stringify({ otp: deleteOtpInput.trim() }),
      });
      clearSession();
      setDeleteModalOpen(false);
      navigate("/register", { state: { message: "Your account deletion is scheduled successfully. You have been logged out." } });
    } catch (err: any) {
      setDeleteError(err.message || "Invalid deletion confirmation code.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Render Loading State
  if (profileLoading && !profileData) {
    return (
      <div className="page-center">
        <div style={{ color: "var(--color-muted)", fontSize: "14px" }}>
          Loading Settings Profile details...
        </div>
      </div>
    );
  }

  const initials = profileData?.username?.substring(0, 2).toUpperCase() || "US";

  return (
    <div className="settings-container">
      {/* Tabbed layout CSS variables */}
      <style>{`
        .settings-container {
          padding: 2rem;
          max-width: 900px;
          margin: 0 auto;
          box-sizing: border-box;
          text-align: left;
        }

        .settings-header-section {
          margin-bottom: 2rem;
        }

        .settings-nav-tabs {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          gap: 1.5rem;
          margin-bottom: 2.5rem;
        }

        .settings-tab-btn {
          background: none;
          border: none;
          color: var(--color-muted);
          font-size: 1rem;
          font-weight: 600;
          padding: 0.75rem 0.25rem;
          cursor: pointer;
          position: relative;
          transition: color var(--transition-fast);
        }

        .settings-tab-btn:hover {
          color: var(--color-text);
        }

        .settings-tab-btn.active {
          color: var(--color-accent);
        }

        .settings-tab-btn.active::after {
          content: "";
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: var(--color-accent);
          border-radius: 2px;
        }

        .settings-card {
          background: var(--color-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .settings-card-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          padding-bottom: 0.75rem;
          color: var(--color-text);
        }

        /* Avatar Editor */
        .avatar-editor-wrapper {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .editable-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          color: white;
          font-size: 1.8rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
          transition: transform 0.2s;
        }

        .editable-avatar:hover {
          transform: scale(1.03);
        }

        .color-dot-selector {
          display: flex;
          gap: 8px;
        }

        .color-dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.15s;
        }

        .color-dot:hover {
          transform: scale(1.15);
        }

        .color-dot.active {
          border-color: var(--color-text);
        }

        /* Badge design */
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          margin-left: 0.5rem;
        }

        .badge-verified {
          background-color: rgba(34, 197, 94, 0.15);
          color: var(--color-success);
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .badge-unverified {
          background-color: rgba(239, 68, 68, 0.15);
          color: var(--color-error);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .badge-provider {
          background-color: var(--color-surface);
          color: var(--color-text);
          border: 1px solid var(--color-border);
          text-transform: uppercase;
        }

        /* Preference Controls */
        .pref-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .pref-row:last-child {
          border-bottom: none;
        }

        .pref-label-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .pref-title {
          font-weight: 600;
          font-size: 0.95rem;
        }

        .pref-desc {
          font-size: 0.8rem;
          color: var(--color-muted);
        }

        /* Toggle switch */
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          transition: .3s;
          border-radius: 24px;
        }

        .slider::before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: var(--color-text);
          transition: .3s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: var(--color-accent);
          border-color: var(--color-accent-hover);
        }

        input:checked + .slider::before {
          transform: translateX(20px);
          background-color: white;
        }

        /* Sessions section */
        .session-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .session-item {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        /* Danger card */
        .danger-card {
          border-color: rgba(239, 68, 68, 0.4);
          background: rgba(239, 68, 68, 0.02);
        }
      `}</style>

      {/* Header */}
      <div className="settings-header-section">
        <h1 className="dashboard-hero-title" style={{ fontSize: "2rem" }}>Account Settings</h1>
        <p className="dashboard-hero-subtitle">Manage your profile, login credentials, devices, and preferences.</p>
      </div>

      {/* Navigation Tabs */}
      <div className="settings-nav-tabs">
        <button
          className={`settings-tab-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          className={`settings-tab-btn ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          Security & Sessions
        </button>
        <button
          className={`settings-tab-btn ${activeTab === "preferences" ? "active" : ""}`}
          onClick={() => setActiveTab("preferences")}
        >
          Preferences
        </button>
      </div>

      {profileError && <div className="form-error" style={{ marginBottom: "1.5rem" }}>{profileError}</div>}
      {profileSuccess && <div className="form-success" style={{ marginBottom: "1.5rem" }}>{profileSuccess}</div>}

      {/* TAB 1: PROFILE */}
      {activeTab === "profile" && (
        <div className="tab-content">
          <div className="settings-card">
            <h3 className="settings-card-title">Profile Identity</h3>

            {/* Profile Pic Editor */}
            <div className="avatar-editor-wrapper">
              <div className="editable-avatar" style={{ backgroundColor: avatarColor }}>
                {initials}
              </div>
              <div style={{ textAlign: "left" }}>
                <span className="pref-title" style={{ display: "block", marginBottom: "0.25rem" }}>Avatar Theme Color</span>
                <span className="pref-desc" style={{ display: "block", marginBottom: "0.75rem" }}>Select custom highlight for navigation drawers</span>
                <div className="color-dot-selector">
                  {["#3b82f6", "#a855f7", "#22c55e", "#f59e0b", "#ef4444"].map((c) => (
                    <div
                      key={c}
                      className={`color-dot ${avatarColor === c ? "active" : ""}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setAvatarColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Editable Profile Fields */}
            <form onSubmit={handleSaveProfile}>
              <div className="field">
                <label htmlFor="editUsername">Username</label>
                <input
                  id="editUsername"
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="editPhone">Phone Number</label>
                <input
                  id="editPhone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "1rem" }}>
                <button type="submit" className="submit-btn" disabled={profileEditLoading} style={{ width: "auto", padding: "10px 24px", margin: 0 }}>
                  {profileEditLoading ? "Saving..." : "Save Changes"}
                </button>
                <button type="button" onClick={handleLogout} className="logout-btn" style={{ width: "auto", padding: "10px 24px", margin: 0 }}>
                  Log out
                </button>
              </div>
            </form>
          </div>

          <div className="settings-card">
            <h3 className="settings-card-title">Security & Meta Data</h3>
            <div className="profile-details" style={{ border: "none", background: "none", padding: 0, margin: 0 }}>
              <div className="profile-field">
                <span className="profile-field-label">Email Address</span>
                <span className="profile-field-value">
                  {profileData?.email}
                  <span className={`badge ${profileData?.isVerified ? "badge-verified" : "badge-unverified"}`}>
                    {profileData?.isVerified ? "Verified" : "Unverified"}
                  </span>
                </span>
              </div>
              <div className="profile-field">
                <span className="profile-field-label">Account Role</span>
                <span className="profile-field-value" style={{ textTransform: "capitalize" }}>
                  {profileData?.role?.toLowerCase() || "user"}
                </span>
              </div>
              <div className="profile-field">
                <span className="profile-field-label">Registration Date</span>
                <span className="profile-field-value">
                  {profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : "N/A"}
                </span>
              </div>
              <div className="profile-field">
                <span className="profile-field-label">Identity Providers</span>
                <span className="profile-field-value">
                  <span className="badge badge-provider">Email & Password</span>
                  {profileData?.twoFactorEnabled && <span className="badge badge-provider">MFA (TOTP)</span>}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SECURITY & SESSIONS */}
      {activeTab === "security" && (
        <div className="tab-content">
          {/* Active Sessions */}
          <div className="settings-card">
            <h3 className="settings-card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Active Sessions & Connected Devices</span>
              {sessions.length > 1 && (
                <button
                  onClick={triggerRevokeOthers}
                  disabled={sessionActionLoading !== null}
                  style={{
                    background: "none",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "var(--color-error)",
                    fontSize: "12px",
                    padding: "4px 10px",
                    cursor: "pointer",
                  }}
                >
                  {sessionActionLoading === "others" ? "Ending..." : "End All Other Sessions"}
                </button>
              )}
            </h3>

            {sessionsError && <div className="form-error" style={{ marginBottom: "1rem" }}>{sessionsError}</div>}
            {sessionsLoading ? (
              <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>Loading sessions...</span>
            ) : (
              <div className="session-grid">
                {sessions.map((s) => (
                  <div key={s.id} className="session-item">
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.95rem", display: "block" }}>
                        {s.browser} on {s.os}
                        {s.isCurrent && (
                          <span className="badge" style={{ backgroundColor: "rgba(34, 197, 94, 0.12)", color: "var(--color-success)", marginLeft: "8px", border: "1px solid rgba(34, 197, 94, 0.25)" }}>
                            Current Session
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", display: "block", marginTop: "2px" }}>
                        IP: {s.ipAddress} | Loc: {s.location || "Unknown"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginTop: "2px" }}>
                        Start: {new Date(s.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {!s.isCurrent && (
                      <button
                        onClick={() => handleEndSession(s.id)}
                        disabled={sessionActionLoading !== null}
                        style={{
                          background: "none",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          borderRadius: "4px",
                          color: "var(--color-error)",
                          fontSize: "12px",
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {sessionActionLoading === s.id ? "Ending..." : "End Session"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MFA Toggle */}
          <div className="settings-card">
            <h3 className="settings-card-title">Multi-Factor Authentication (MFA)</h3>
            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Authenticator App (TOTP)</span>
                <span className="pref-desc">Secure account with OTP codes from Google Authenticator, Authy, or Duo.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={mfaEnabled}
                  onChange={handleToggleMfa}
                  disabled={mfaLoading}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Recovery Options</span>
                <span className="pref-desc">Use backup verification codes in case you lose access to your primary device.</span>
              </div>
              <select
                value={recoveryOption}
                onChange={(e) => setRecoveryOption(e.target.value)}
                style={{
                  padding: "6px 12px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <option value="email">Primary Email Address</option>
                <option value="sms">SMS / Phone Number</option>
                <option value="backup_codes">Printed Security Codes</option>
              </select>
            </div>
          </div>

          {/* Change Password Form */}
          <div className="settings-card">
            <h3 className="settings-card-title">Change Password</h3>
            {passwordError && <div className="form-error" style={{ marginBottom: "1rem" }}>{passwordError}</div>}
            {passwordSuccess && <div className="form-success" style={{ marginBottom: "1rem" }}>{passwordSuccess}</div>}

            <form onSubmit={submitPasswordChange}>
              <div className="field">
                <label htmlFor="newPassword">New Password</label>
                <div className="input-row">
                  <input
                    id="newPassword"
                    type={newPwField.visible ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 12 characters"
                    required
                  />
                  <button type="button" className="eye-toggle-btn" onClick={newPwField.toggle}>
                    {newPwField.visible ? "Hide" : "Show"}
                  </button>
                </div>
                <PasswordStrengthBar password={newPassword} />
              </div>

              <div className="field">
                <label htmlFor="confirmNewPassword">Confirm New Password</label>
                <div className="input-row">
                  <input
                    id="confirmNewPassword"
                    type={newCpwField.visible ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                  />
                  <button type="button" className="eye-toggle-btn" onClick={newCpwField.toggle}>
                    {newCpwField.visible ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button type="submit" className="submit-btn" disabled={passwordLoading} style={{ width: "auto", padding: "10px 24px", marginTop: "0.5rem" }}>
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>

          {/* Change Email Form */}
          <div className="settings-card">
            <h3 className="settings-card-title">Update Email Address</h3>
            {emailError && <div className="form-error" style={{ marginBottom: "1rem" }}>{emailError}</div>}
            {emailSuccess && <div className="form-success" style={{ marginBottom: "1rem" }}>{emailSuccess}</div>}

            {!emailOtpSent ? (
              <div>
                <div className="field">
                  <label htmlFor="newEmail">New Email Address</label>
                  <input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (reauthToken) sendEmailChangeOTP();
                    else triggerSensitiveAction("email");
                  }}
                  className="submit-btn"
                  disabled={emailLoading}
                  style={{ width: "auto", padding: "10px 24px", marginTop: "0.5rem" }}
                >
                  {emailLoading ? "Sending OTP..." : "Send Verification Code"}
                </button>
              </div>
            ) : (
              <form onSubmit={verifyEmailChange}>
                <div className="field">
                  <label htmlFor="emailOtp">Verification Code</label>
                  <input
                    id="emailOtp"
                    type="text"
                    maxLength={6}
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value)}
                    placeholder="000000"
                    style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600" }}
                    required
                  />
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setEmailOtpSent(false)}
                    className="submit-btn"
                    style={{
                      margin: 0,
                      width: "auto",
                      padding: "10px 20px",
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--color-muted)",
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" style={{ margin: 0, width: "auto", padding: "10px 20px" }} disabled={emailLoading}>
                    {emailLoading ? "Updating..." : "Verify & Change"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Login History / Audit logs */}
          <div className="settings-card">
            <h3 className="settings-card-title">Recent Login History</h3>
            {auditLogsLoading ? (
              <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>Loading history...</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255, 255, 255, 0.03)", paddingBottom: "6px", fontSize: "13px" }}>
                    <span>
                      <strong style={{ color: log.action.includes("FAILED") ? "var(--color-error)" : "var(--color-success)" }}>
                        {log.action}
                      </strong>
                      <span style={{ color: "var(--color-muted)", marginLeft: "8px" }}>IP: {log.ipAddress || "local"}</span>
                    </span>
                    <span style={{ color: "var(--color-muted)" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <span style={{ fontSize: "13px", color: "var(--color-muted)" }}>No login history available.</span>
                )}
              </div>
            )}
          </div>

          {/* Danger Zone (Account Deletion) */}
          <div className="settings-card danger-card">
            <h3 className="settings-card-title" style={{ color: "var(--color-error)", borderBottomColor: "rgba(239, 68, 68, 0.1)" }}>
              Danger Zone
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "1.5rem" }}>
              Permanently delete your account, saved secrets, active sessions, and keys. Once executed, this operation is fully scheduled and all active keys will be blocklisted.
            </p>
            <button
              onClick={openDeleteDialog}
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "var(--color-error)",
                padding: "10px 20px",
                borderRadius: "var(--radius)",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.08)";
              }}
            >
              Delete Account
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: PREFERENCES */}
      {activeTab === "preferences" && (
        <div className="tab-content">
          <div className="settings-card">
            <h3 className="settings-card-title">User Interface & Design</h3>
            
            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Aesthetic Color Theme</span>
                <span className="pref-desc">Choose between Light, Dark, or sync with System preferences.</span>
              </div>
              <select
                value={theme}
                onChange={(e) => {
                  setTheme(e.target.value);
                  localStorage.setItem("nexvault_theme", e.target.value);
                }}
                style={{
                  padding: "6px 12px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <option value="system">🖥️ System Default</option>
                <option value="dark">🌑 Dark Theme</option>
                <option value="light">☀️ Light Theme</option>
              </select>
            </div>

            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Default Language</span>
                <span className="pref-desc">Select translation target for dashboards.</span>
              </div>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  localStorage.setItem("nexvault_lang", e.target.value);
                }}
                style={{
                  padding: "6px 12px",
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <option value="en">English (US)</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>

          <div className="settings-card">
            <h3 className="settings-card-title">Notification Preferences</h3>
            
            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Email Security Alerts</span>
                <span className="pref-desc">Immediate alerts when logins fail or passwords change.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifSecurity}
                  onChange={(e) => setNotifSecurity(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">New Session Sign-ins</span>
                <span className="pref-desc">Get an email alert when signed in from a new IP or device.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifActivity}
                  onChange={(e) => setNotifActivity(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Weekly Security Digests</span>
                <span className="pref-desc">Periodic report on active credentials and access logs.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={notifDigests}
                  onChange={(e) => setNotifDigests(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          <div className="settings-card">
            <h3 className="settings-card-title">Privacy Settings</h3>

            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Share Telemetry</span>
                <span className="pref-desc">Send anonymous diagnostics to improve security services.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={privacyTelemetry}
                  onChange={(e) => setPrivacyTelemetry(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>

            <div className="pref-row">
              <div className="pref-label-col">
                <span className="pref-title">Detailed Logs</span>
                <span className="pref-desc">Keep full IP address and device descriptions in history.</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={privacyLogs}
                  onChange={(e) => setPrivacyLogs(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Reauth Modal Wrapper for general password/email edits */}
      <ReauthModal
        isOpen={reauthOpen}
        onClose={() => {
          setReauthOpen(false);
          setReauthAction(null);
        }}
        onSuccess={handleReauthSuccess}
        actionName={
          reauthAction === "password"
            ? "changing your password"
            : reauthAction === "email"
            ? "updating your email address"
            : undefined
        }
      />

      {/* Account Deletion Custom Multi-step Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay">
          <div className="add-modal-card" style={{ maxWidth: "460px" }}>
            <button
              className="modal-close-btn"
              onClick={() => setDeleteModalOpen(false)}
            >
              &times;
            </button>
            <h3 className="card-title" style={{ textAlign: "left", color: "var(--color-error)", marginBottom: "1rem" }}>
              Delete Your Account
            </h3>

            {deleteError && <div className="form-error" style={{ marginBottom: "1rem" }}>{deleteError}</div>}

            {/* STEP 1: SELECT METHOD */}
            {deleteStep === "verify_method" && (
              <div>
                <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginBottom: "1.5rem" }}>
                  To securely delete your NexVault account, we must verify your ownership first. Please select a verification method:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <button
                    onClick={() => handleDeletionVerifyMethod("password")}
                    className="submit-btn"
                    style={{ margin: 0 }}
                  >
                    Verify with Account Password
                  </button>
                  <button
                    onClick={() => handleDeletionVerifyMethod("email")}
                    className="submit-btn"
                    style={{
                      margin: 0,
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--color-text)",
                    }}
                  >
                    Verify with Email OTP Verification
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2A: PASSWORD ENTRY */}
            {deleteStep === "verify_password" && (
              <form onSubmit={handleDeletionPasswordVerify}>
                <div className="field">
                  <label htmlFor="delPass">Account Password</label>
                  <div className="input-row">
                    <input
                      id="delPass"
                      type={deletePwField.visible ? "text" : "password"}
                      placeholder="••••••••"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoFocus
                      required
                    />
                    <button type="button" className="eye-toggle-btn" onClick={deletePwField.toggle}>
                      {deletePwField.visible ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setDeleteStep("verify_method")}
                    className="submit-btn"
                    style={{
                      margin: 0,
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--color-muted)",
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="submit-btn" style={{ margin: 0 }} disabled={deleteLoading}>
                    {deleteLoading ? "Verifying..." : "Verify & Request Code"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2B: EMAIL OTP VERIFICATION */}
            {deleteStep === "verify_email_otp" && (
              <form onSubmit={handleDeletionEmailVerify}>
                {!deleteOtpSent ? (
                  <div className="field">
                    <label htmlFor="delEmail">Type your registered email to confirm</label>
                    <input
                      id="delEmail"
                      type="email"
                      placeholder={profileData?.email}
                      value={deleteEmailInput}
                      onChange={(e) => setDeleteEmailInput(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="delOtp">6-Digit Verification Code</label>
                    <input
                      id="delOtp"
                      type="text"
                      maxLength={6}
                      value={deleteOtpInput}
                      onChange={(e) => setDeleteOtpInput(e.target.value)}
                      placeholder="000000"
                      style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600" }}
                      autoFocus
                      required
                    />
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (deleteOtpSent) {
                        setDeleteOtpSent(false);
                      } else {
                        setDeleteStep("verify_method");
                      }
                    }}
                    className="submit-btn"
                    style={{
                      margin: 0,
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--color-muted)",
                    }}
                  >
                    Back
                  </button>
                  <button type="submit" className="submit-btn" style={{ margin: 0 }} disabled={deleteLoading}>
                    {deleteLoading
                      ? "Processing..."
                      : !deleteOtpSent
                      ? "Send OTP Code"
                      : "Verify Code"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: FINAL DESTRUCTION WARNING */}
            {deleteStep === "final_warning" && (
              <form onSubmit={handleFinalDeletion}>
                <div style={{
                  padding: "1rem",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.05)",
                  borderRadius: "var(--radius)",
                  marginBottom: "1.5rem",
                }}>
                  <strong style={{ color: "var(--color-error)", display: "block", marginBottom: "0.5rem", fontSize: "0.95rem" }}>
                    ⚠️ WARNING: This action is permanent and cannot be undone.
                  </strong>
                  <p style={{ fontSize: "0.8rem", color: "var(--color-text)", margin: 0 }}>
                    Deleting your account will permanently remove your profile, settings, documents, and all associated data.
                  </p>
                </div>

                <div className="field" style={{ marginBottom: "1.5rem" }}>
                  <label htmlFor="finalOtp" style={{ fontWeight: 600 }}>Enter Deletion OTP Code from Email</label>
                  <input
                    id="finalOtp"
                    type="text"
                    maxLength={6}
                    value={deleteOtpInput}
                    onChange={(e) => setDeleteOtpInput(e.target.value)}
                    placeholder="000000"
                    style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600", marginTop: "4px" }}
                    autoFocus
                    required
                  />
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "1.5rem" }}>
                  <input
                    id="confirmCheck"
                    type="checkbox"
                    checked={deleteConfirmChecked}
                    onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                    style={{ width: "auto", marginTop: "3px", cursor: "pointer" }}
                    required
                  />
                  <label htmlFor="confirmCheck" style={{ fontSize: "0.8rem", color: "var(--color-muted)", cursor: "pointer", fontWeight: "normal" }}>
                    I explicitly confirm that I want to schedule my account and all my keys/vault files for permanent deletion.
                  </label>
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setDeleteStep("verify_method")}
                    className="submit-btn"
                    style={{
                      margin: 0,
                      backgroundColor: "transparent",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      color: "var(--color-muted)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="submit-btn"
                    style={{ margin: 0, backgroundColor: "var(--color-error)" }}
                    disabled={deleteLoading || !deleteConfirmChecked}
                  >
                    {deleteLoading ? "Deleting..." : "Permanently Delete Account"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
