import { useState, FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";
import { isPasswordStrong } from "@/shared/utils/passwordStrength";
import { apiRequest } from "@/shared/utils/apiClient";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const navigate = useNavigate();

  const pwField = usePasswordVisibility();
  const cpwField = usePasswordVisibility();

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Email address is missing.");
      return;
    }

    if (otp.length !== 6) {
      setError("Please enter a 6-digit verification code.");
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
          email,
          otp: otp.trim(),
          password,
        }),
      });
      navigate("/login", { state: { message: "Password reset successful! Please log in with your new password." } });
    } catch (err: any) {
      setError(err.message || "Failed to reset password. The code may be incorrect or expired.");
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
            Enter the 6-digit verification code sent to <strong>{email}</strong> and choose a new password.
          </p>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="otp">Verification Code</label>
            <input
              id="otp"
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000"
              style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600" }}
              required
            />
          </div>

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
                className="eye-toggle-btn"
                onClick={pwField.toggle}
                aria-label={pwField.visible ? "Hide password" : "Show password"}
              >
                {pwField.visible ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
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
                className="eye-toggle-btn"
                onClick={cpwField.toggle}
                aria-label={cpwField.visible ? "Hide password" : "Show password"}
              >
                {cpwField.visible ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword && (
              <span className={password === confirmPassword ? "match-indicator match" : "match-indicator no-match"}>
                {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords do not match"}
              </span>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={loading || !email}>
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
