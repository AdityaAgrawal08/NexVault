import { useState, useEffect, FormEvent } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";
import OTPInput from "@/shared/components/OTPInput";

export default function VerifyOTPPage() {
  const navigate = useNavigate();
  const location = useLocation();


  // Retrieve registration data carried over from the registration page
  const registrationData = location.state?.registrationData;

  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60); // 1-minute resend cooldown
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);



  // Countdown timer logic
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // If user navigated directly here without registering, redirect back
  if (!registrationData) {
    return <Navigate to="/register" replace />;
  }

  // Format countdown seconds to mm:ss
  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function handleVerifyAndCreate(e: FormEvent) {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6) {
      setError("Please enter the 6-character verification code.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      // Complete registration: verify OTP and create the account on the backend
      await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({
          ...registrationData,
          otp: cleanOtp,
        }),
      });

      setSuccess("Account created successfully! Redirecting you to login...");
      setTimeout(() => {
        navigate("/login", { state: { message: "Account created successfully! Please log in." } });
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOTP() {
    setResending(true);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: registrationData.email }),
      });
      setCountdown(60); // Reset countdown
      setSuccess("A new verification code has been sent to your email!");
    } catch (err: any) {
      setError(err.message || "Failed to resend verification code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">NexVault</span>
        </div>

        <h1 className="card-title">Verify Your Email</h1>
        
        <p style={{ fontSize: "14px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem", lineHeight: "1.5" }}>
          We've sent a verification code to your email address. Enter it below to complete your registration.
        </p>

        {/* Read-Only email field carried over from registration */}
        <div className="field" style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="display-email">Email</label>
          <input
            id="display-email"
            type="text"
            value={registrationData.email}
            disabled
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed var(--color-border)",
              color: "var(--color-muted)",
              cursor: "not-allowed",
              textAlign: "center",
              fontWeight: 500
            }}
          />
        </div>

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="form-success" role="alert">
            {success}
          </div>
        )}

        <form onSubmit={handleVerifyAndCreate} noValidate>
          <div className="field" style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="otp-0" style={{ marginBottom: "0.5rem" }}>Verification Code</label>
            <OTPInput
              value={otp}
              onChange={(newOtp) => {
                setError("");
                setOtp(newOtp);
              }}
              disabled={loading}
              idPrefix="otp"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading || otp.length !== 6}>
            {loading ? "Verifying & Creating..." : "Verify & Create Account"}
          </button>
        </form>

        {/* Resend code option */}
        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "13px" }}>
          {countdown > 0 ? (
            <span style={{ color: "var(--color-muted)" }}>
              Resend available in {formatTime(countdown)}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResendOTP}
              disabled={resending}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-accent)",
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
                textDecoration: "underline"
              }}
            >
              {resending ? "Resending..." : "Resend Code"}
            </button>
          )}
        </div>

        <p className="switch-link" style={{ marginTop: "2rem" }}>
          Back to <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
