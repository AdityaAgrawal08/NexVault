import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiRequest("/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      // Navigate directly to the reset password page with the email in the query params
      navigate(`/reset-password?email=${encodeURIComponent(email.trim())}`);
    } catch (err: any) {
      setError(err.message || "Failed to request password reset.");
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

        <h1 className="card-title">Reset Password</h1>

        <form onSubmit={handleSubmit} noValidate>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
            Enter your email address and we will send you a 6-digit verification code to reset your password.
          </p>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

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

        <p className="switch-link">
          Remembered your password? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
