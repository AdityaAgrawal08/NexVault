import { useState, FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";
import { isPasswordStrong } from "@/shared/utils/passwordStrength";
import { apiRequest } from "@/shared/utils/apiClient";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const pwField = usePasswordVisibility();
  const cpwField = usePasswordVisibility();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Reset token is missing from the URL.");
      return;
    }

    if (!isPasswordStrong(password)) {
      setError("Password does not meet strength requirements.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiRequest("/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
        }),
      });
      navigate("/login", { state: { message: "Password reset successful! Please log in with your new password." } });
    } catch (err: any) {
      setError(err.message || "Failed to reset password. The link may have expired.");
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

        <h1 className="card-title">Choose New Password</h1>

        <form onSubmit={handleSubmit} noValidate>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
            Create a strong, secure password containing at least 12 characters, including letters, numbers, and symbols.
          </p>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          {!token && (
            <div className="form-error" role="alert">
              Invalid password reset link. No token found in URL.
            </div>
          )}

          <div className="field">
            <label htmlFor="password">New Password</label>
            <div className="input-row">
              <input
                id="password"
                type={pwField.visible ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <PasswordStrengthBar password={password} />
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-row">
              <input
                id="confirmPassword"
                type={cpwField.visible ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={cpwField.toggle}
              >
                {cpwField.visible ? "Hide" : "Show"}
              </button>
            </div>
            {confirmPassword && (
              <span className={password === confirmPassword ? "match-indicator match" : "match-indicator no-match"}>
                {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
              </span>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={loading || !token}>
            {loading ? "Updating password…" : "Reset Password"}
          </button>
        </form>

        <p className="switch-link">
          Back to <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
