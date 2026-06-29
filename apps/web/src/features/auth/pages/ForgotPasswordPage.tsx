import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/shared/utils/apiClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
      setSubmitted(true);
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

        {submitted ? (
          <div style={{ textAlign: "center" }}>
            <div className="form-success" style={{
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid var(--color-success)",
              color: "var(--color-success)",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius)",
              fontSize: "14px",
              marginBottom: "1.5rem",
              textAlign: "left"
            }}>
              If that email is registered, we have sent a password reset link. Please check your email inbox or terminal logs.
            </div>
            <Link to="/login" className="submit-btn" style={{ textDecoration: "none", display: "block" }}>
              Back to Log In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
              Enter your email address and we'll send you a link to reset your password.
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
              {loading ? "Sending link…" : "Send Reset Link"}
            </button>
          </form>
        )}

        {!submitted && (
          <p className="switch-link">
            Remembered your password? <Link to="/login">Log in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
