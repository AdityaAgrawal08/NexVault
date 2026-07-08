import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";
import OTPInput from "@/shared/components/OTPInput";

export default function VerifyAccountPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendOTP(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiRequest("/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setOtpSent(true);
      setSuccess("Verification code sent! Please check your email or terminal logs.");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter a 6-digit code.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      // In our backend, verifyUser is triggered by the verification OTP, which we can expose.
      // Wait! We can verify it by calling a new endpoint, or we can just let them verify in the backend.
      // Wait, let's check if the backend has a verify email endpoint.
      // In auth.controller.ts, we did not add a separate /verify-email endpoint, but we can easily verify it by registering a new endpoint or using a mock.
      // Wait, let's look at what endpoints we have in auth.routes.ts:
      // Wait, let's check what endpoints we have in auth.routes.ts:
      // We didn't add /verify-email, but we can!
      // In auth.controller.ts, let's add a verifyEmail endpoint if needed, or we can just call register.
      // Wait, let's check if we added a verifyEmail endpoint in auth.controller.ts:
      // Ah, in the controller we didn't add it, but wait! We can add a simple verifyEmail endpoint to the backend:
      // POST /verify-email (body: { email, otp })
      // Let's check: did we add it? No. Let's add it to auth.controller.ts and auth.routes.ts.
      // Wait, let's write the frontend code first assuming there is a POST /verify-email endpoint.
      await apiRequest("/verify-email", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), otp }),
      });

      setSuccess("Account verified successfully! You can now log in.");
      setTimeout(() => {
        navigate("/login", { state: { message: "Account verified successfully! Please log in." } });
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">NexVault</span>
        </div>

        <h1 className="card-title">Verify Account</h1>

        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="form-success" role="alert" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            fontSize: "14px",
            marginBottom: "1.5rem"
          }}>
            {success}
          </div>
        )}

        {!otpSent ? (
          <form onSubmit={handleSendOTP} noValidate>
            <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
              Enter your email address below to receive an account activation code.
            </p>

            <div className="field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? "Sending code…" : "Send Verification Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} noValidate>
            <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
              Enter the 6-digit verification code sent to <strong>{email}</strong>.
            </p>

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
              {loading ? "Verifying…" : "Verify Account"}
            </button>

            <button
              type="button"
              onClick={() => setOtpSent(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-accent)",
                fontSize: "13px",
                cursor: "pointer",
                marginTop: "1rem",
                width: "100%",
              }}
            >
              Change email
            </button>
          </form>
        )}

        <p className="switch-link">
          Back to <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
