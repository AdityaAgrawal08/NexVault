import { useState, FormEvent } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { apiRequest, clearSession } from "@/shared/utils/apiClient";
import ReauthModal from "@/shared/components/ReauthModal";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import { isPasswordStrong } from "@/shared/utils/passwordStrength";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";

interface UserSession {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  role?: string;
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

  const [user, setUser] = useState<UserSession>(initialUser);
  
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

  // Account Deletion State
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  // Trigger Re-authentication before sensitive actions
  function triggerSensitiveAction(action: "password" | "email" | "delete") {
    setReauthAction(action);
    setReauthOpen(true);
  }

  // Called when ReauthModal successfully verifies the user
  async function handleReauthSuccess(token: string) {
    setReauthToken(token);
    
    // Immediately execute the action that was pending
    if (reauthAction === "password") {
      // The user will now click the submit button in the password form which will use the token
    } else if (reauthAction === "email") {
      // Send the email change OTP using the token
      await sendEmailChangeOTP(token);
    } else if (reauthAction === "delete") {
      await handleDeleteAccount(token);
    }
  }

  // --- Change Password ---
  async function submitPasswordChange(e: FormEvent) {
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
        headers: {
          "X-Reauth-Token": reauthToken,
        },
        body: JSON.stringify({ newPassword }),
      });
      
      setPasswordSuccess("Password changed successfully! Logging out of all devices.");
      setNewPassword("");
      setConfirmPassword("");
      setReauthToken("");
      
      // Since changing password revokes all sessions, log out after 3 seconds
      setTimeout(() => {
        clearSession();
        navigate("/login", { state: { message: "Password changed successfully. Please log in again." } });
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
  }

  // --- Change Email ---
  async function sendEmailChangeOTP(token = reauthToken) {
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
        headers: {
          "X-Reauth-Token": token,
        },
        body: JSON.stringify({ newEmail }),
      });
      setEmailOtpSent(true);
      setEmailSuccess("Verification code sent to your new email address.");
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("email");
      } else {
        setEmailError(err.message || "Failed to send verification code.");
      }
    } finally {
      setEmailLoading(false);
    }
  }

  async function verifyEmailChange(e: FormEvent) {
    e.preventDefault();
    if (emailOtp.length !== 6) {
      setEmailError("Please enter a 6-digit verification code.");
      return;
    }

    setEmailLoading(true);
    setEmailError("");
    setEmailSuccess("");

    try {
      await apiRequest("/profile/change-email/verify", {
        method: "POST",
        headers: {
          "X-Reauth-Token": reauthToken,
        },
        body: JSON.stringify({ newEmail, otp: emailOtp.trim() }),
      });

      setEmailSuccess("Email address updated successfully!");
      setUser((prev) => ({ ...prev, email: newEmail }));
      
      // Update local storage
      const updated = { ...user, email: newEmail };
      localStorage.setItem("user", JSON.stringify(updated));

      // Reset state
      setNewEmail("");
      setEmailOtp("");
      setEmailOtpSent(false);
      setReauthToken("");
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("email");
      } else {
        setEmailError(err.message || "Failed to update email address.");
      }
    } finally {
      setEmailLoading(false);
    }
  }

  // --- Delete Account ---
  async function handleDeleteAccount(token = reauthToken) {
    setDeleteLoading(true);
    setDeleteError("");

    try {
      await apiRequest("/profile", {
        method: "DELETE",
        headers: {
          "X-Reauth-Token": token,
        },
      });
      clearSession();
      navigate("/register", { state: { message: "Your account has been deleted successfully." } });
    } catch (err: any) {
      if (err.code === "REAUTH_REQUIRED") {
        setReauthToken("");
        triggerSensitiveAction("delete");
      } else {
        setDeleteError(err.message || "Failed to delete account.");
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="page-center" style={{ padding: "2rem 0" }}>
      <div className="card profile-card" style={{ maxWidth: "520px", width: "100%" }}>
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
        </div>

        {/* Sessions Management */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--color-foreground)" }}>Active Sessions & Devices</span>
          <Link to="/sessions" style={{
            fontSize: "13px",
            color: "var(--color-accent)",
            textDecoration: "none",
            fontWeight: "600",
          }}>
            Manage Sessions →
          </Link>
        </div>

        {/* Change Password Form */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "1rem", color: "var(--color-foreground)" }}>
            Change Password
          </h3>

          {passwordError && <div className="form-error" style={{ marginBottom: "1rem" }}>{passwordError}</div>}
          {passwordSuccess && <div className="form-success" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            fontSize: "13px",
            marginBottom: "1rem"
          }}>{passwordSuccess}</div>}

          <form onSubmit={submitPasswordChange}>
            <div className="field">
              <label htmlFor="newPassword">New Password</label>
              <div className="input-row">
                <input
                  id="newPassword"
                  type={newPwField.visible ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  required
                />
                <button type="button" className="toggle-btn" onClick={newPwField.toggle}>
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
                  placeholder="Confirm new password"
                  required
                />
                <button type="button" className="toggle-btn" onClick={newCpwField.toggle}>
                  {newCpwField.visible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={passwordLoading} style={{ marginTop: "0.5rem" }}>
              {passwordLoading ? "Updating Password…" : reauthToken && reauthAction === "password" ? "Confirm Password Change" : "Change Password"}
            </button>
          </form>
        </div>

        {/* Change Email Form */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "1rem", color: "var(--color-foreground)" }}>
            Update Email Address
          </h3>

          {emailError && <div className="form-error" style={{ marginBottom: "1rem" }}>{emailError}</div>}
          {emailSuccess && <div className="form-success" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            fontSize: "13px",
            marginBottom: "1rem"
          }}>{emailSuccess}</div>}

          {!emailOtpSent ? (
            <div>
              <div className="field">
                <label htmlFor="newEmail">New Email Address</label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new_email@example.com"
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
                style={{ marginTop: "0.5rem" }}
              >
                {emailLoading ? "Sending Code…" : "Send Verification Code"}
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
                    backgroundColor: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "var(--color-muted)",
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn" style={{ margin: 0 }} disabled={emailLoading}>
                  {emailLoading ? "Updating…" : "Verify & Update Email"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Account Deletion */}
        <div style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "0.5rem", color: "#ef4444" }}>
            Danger Zone
          </h3>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", marginBottom: "1rem" }}>
            Permanently delete your NexVault account and all of your security keys, sessions, and data. This action is irreversible.
          </p>

          {deleteError && <div className="form-error" style={{ marginBottom: "1rem" }}>{deleteError}</div>}

          <button
            onClick={() => triggerSensitiveAction("delete")}
            disabled={deleteLoading}
            style={{
              width: "100%",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#ef4444",
              padding: "0.75rem 1rem",
              fontSize: "14px",
              fontWeight: "600",
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            {deleteLoading ? "Deleting Account…" : "Delete Account"}
          </button>
        </div>

        <button onClick={handleLogout} className="logout-btn" style={{ marginTop: "2rem" }}>
          Log out
        </button>
      </div>

      {/* Re-authentication Modal */}
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
            : reauthAction === "delete"
            ? "deleting your account permanently"
            : undefined
        }
      />
    </div>
  );
}
