import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { apiRequest, clearSession } from "@/shared/utils/apiClient";

interface UserSession {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
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

  const [user, setUser] = useState<UserSession>(initialUser);

  // 2FA Setup State
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);

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

  async function handleInit2FA() {
    setMfaLoading(true);
    setMfaError("");
    try {
      const result = await apiRequest("/enable-2fa", {
        method: "POST",
      });
      setTotpSecret(result.data.secret);
      setQrCodeUrl(result.data.qrCodeUrl);
      setShow2FASetup(true);
    } catch (err: any) {
      setMfaError(err.message || "Failed to initialize 2FA.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleVerify2FA() {
    if (verificationCode.length !== 6) {
      setMfaError("Please enter a 6-digit code.");
      return;
    }

    setMfaLoading(true);
    setMfaError("");
    try {
      await apiRequest("/verify-enable-2fa", {
        method: "POST",
        body: JSON.stringify({
          secret: totpSecret,
          code: verificationCode,
        }),
      });

      const updatedUser = { ...user, twoFactorEnabled: true };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      
      setShow2FASetup(false);
      setVerificationCode("");
      setTotpSecret("");
      setQrCodeUrl("");
    } catch (err: any) {
      setMfaError(err.message || "Invalid authenticator code.");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleDisable2FA() {
    setMfaLoading(true);
    setMfaError("");
    try {
      await apiRequest("/disable-2fa", {
        method: "POST",
      });

      const updatedUser = { ...user, twoFactorEnabled: false };
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
    } catch (err: any) {
      setMfaError(err.message || "Failed to disable 2FA.");
    } finally {
      setMfaLoading(false);
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
            <span className="profile-field-label">Two-Factor Authentication</span>
            <span className="profile-field-value" style={{ color: user.twoFactorEnabled ? "var(--color-success)" : "var(--color-error)" }}>
              {user.twoFactorEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        {/* MFA Setup / Status Area */}
        <div className="mfa-section" style={{
          marginTop: "1.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          textAlign: "left",
          width: "100%",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", marginBottom: "0.5rem", color: "var(--color-foreground)" }}>
            Two-Factor Authentication (2FA)
          </h3>
          <p style={{ fontSize: "12px", color: "var(--color-muted)", marginBottom: "1rem" }}>
            Secure your account with Time-based One-Time Passwords (TOTP) from Google Authenticator.
          </p>

          {mfaError && (
            <div className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
              {mfaError}
            </div>
          )}

          {!user.twoFactorEnabled && !show2FASetup && (
            <button onClick={handleInit2FA} className="submit-btn" disabled={mfaLoading}>
              {mfaLoading ? "Initializing…" : "Enable 2FA"}
            </button>
          )}

          {show2FASetup && (
            <div className="mfa-setup-box" style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              padding: "1.25rem",
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}>
              <p style={{ fontSize: "12px", color: "var(--color-foreground)", textAlign: "center" }}>
                Scan the QR code with your Authenticator App, or enter the secret key manually.
              </p>
              
              <div style={{ backgroundColor: "white", padding: "8px", borderRadius: "8px", display: "flex", justifyContent: "center" }}>
                <img src={qrCodeUrl} alt="2FA QR Code" style={{ width: "160px", height: "160px" }} />
              </div>

              <div style={{ textAlign: "center" }}>
                <span className="profile-field-label" style={{ display: "block", marginBottom: "2px" }}>Secret Key</span>
                <code style={{ fontSize: "13px", color: "var(--color-accent)", fontWeight: "600", letterSpacing: "1px" }}>
                  {totpSecret}
                </code>
              </div>

              <div className="field" style={{ width: "100%", marginTop: "0.5rem" }}>
                <label htmlFor="verifyCode">Verification Code</label>
                <input
                  id="verifyCode"
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="000000"
                  style={{ textAlign: "center", letterSpacing: "4px", fontSize: "16px", fontWeight: "600" }}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
                <button onClick={handleVerify2FA} className="submit-btn" style={{ margin: 0 }} disabled={mfaLoading}>
                  {mfaLoading ? "Verifying…" : "Verify & Enable"}
                </button>
                <button onClick={() => setShow2FASetup(false)} className="logout-btn" style={{ margin: 0, padding: "8px" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {user.twoFactorEnabled && (
            <button onClick={handleDisable2FA} className="logout-btn" disabled={mfaLoading}>
              {mfaLoading ? "Disabling…" : "Disable 2FA"}
            </button>
          )}
        </div>

        <button onClick={handleLogout} className="logout-btn" style={{ marginTop: "1.5rem" }}>
          Log out
        </button>
      </div>
    </div>
  );
}
