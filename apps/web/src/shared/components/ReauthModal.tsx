import { useState, FormEvent } from "react";
import { apiRequest } from "@/shared/utils/apiClient";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";

export interface ReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reauthToken: string) => void;
  actionName?: string;
}

export default function ReauthModal({ isOpen, onClose, onSuccess, actionName = "this sensitive action" }: ReauthModalProps) {
  if (!isOpen) return null;

  const pwField = usePasswordVisibility();
  const [method, setMethod] = useState<"choose" | "password" | "otp">("choose");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/reauth/password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      onSuccess(result.data.reauthToken);
      handleClose();
    } catch (err: any) {
      setError(err.message || "Incorrect password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOTP() {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      await apiRequest("/reauth/otp/send", {
        method: "POST",
      });
      setOtpSent(true);
      setSuccessMsg("Verification code sent to your registered email.");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOTPSubmit(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter a 6-digit code.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await apiRequest("/reauth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ otp: otp.trim() }),
      });
      onSuccess(result.data.reauthToken);
      handleClose();
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setMethod("choose");
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setError("");
    setSuccessMsg("");
    onClose();
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: "1rem",
    }}>
      <div className="card" style={{
        maxWidth: "400px",
        width: "100%",
        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.3)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        position: "relative",
      }}>
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: "12px",
            right: "16px",
            background: "none",
            border: "none",
            color: "var(--color-muted)",
            fontSize: "20px",
            cursor: "pointer",
          }}
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="card-title" style={{ fontSize: "20px", marginBottom: "8px" }}>
          Confirm Your Identity
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
          Re-authentication is required to perform <strong>{actionName}</strong>.
        </p>

        {error && (
          <div className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div className="form-success" role="alert" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            fontSize: "13px",
            marginBottom: "1rem"
          }}>
            {successMsg}
          </div>
        )}

        {method === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
            <button
              onClick={() => setMethod("password")}
              className="submit-btn"
              style={{ margin: 0 }}
            >
              Verify with Password
            </button>
            <button
              onClick={() => {
                setMethod("otp");
                handleSendOTP();
              }}
              className="submit-btn"
              style={{
                margin: 0,
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "var(--color-foreground)",
              }}
              disabled={loading}
            >
              {loading ? "Sending code…" : "Verify with Email OTP"}
            </button>
          </div>
        )}

        {method === "password" && (
          <form onSubmit={handlePasswordSubmit} noValidate>
            <div className="field">
              <label htmlFor="reauthPassword">Enter Password</label>
              <div className="input-row">
                <input
                  id="reauthPassword"
                  type={pwField.visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={pwField.toggle}
                >
                  {pwField.visible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setMethod("choose")}
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
              <button type="submit" className="submit-btn" style={{ margin: 0 }} disabled={loading}>
                {loading ? "Verifying…" : "Confirm"}
              </button>
            </div>
          </form>
        )}

        {method === "otp" && (
          <form onSubmit={handleOTPSubmit} noValidate>
            {otpSent && (
              <div className="field">
                <label htmlFor="reauthOtp">Verification Code</label>
                <input
                  id="reauthOtp"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
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
                onClick={() => setMethod("choose")}
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
              {otpSent ? (
                <button type="submit" className="submit-btn" style={{ margin: 0 }} disabled={loading}>
                  {loading ? "Verifying…" : "Confirm"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOTP}
                  className="submit-btn"
                  style={{ margin: 0 }}
                  disabled={loading}
                >
                  {loading ? "Sending…" : "Resend Code"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
