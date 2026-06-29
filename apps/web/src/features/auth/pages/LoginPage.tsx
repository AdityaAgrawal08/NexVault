import { useState, FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLoginForm } from "../hooks/useLoginForm";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import type { LoginFormData } from "@/shared/types/auth.types";
import { apiRequest, setAccessToken } from "@/shared/utils/apiClient";

export default function LoginPage() {
  const pwField = usePasswordVisibility();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;

  // 2FA State
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);

  async function handleSuccess(data: LoginFormData) {
    try {
      const result = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (result.data.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(result.data.mfaToken);
        return;
      }

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      navigate("/profile");
    } catch (err: any) {
      if (err.errors) {
        const formErrors: any = {};
        for (const key of Object.keys(err.errors)) {
          formErrors[key] = Array.isArray(err.errors[key])
            ? err.errors[key][0]
            : err.errors[key];
        }
        setErrors(formErrors);
      }
      throw err;
    }
  }

  async function handleMFAVerify(e: FormEvent) {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      setMfaError("Please enter a 6-digit code.");
      return;
    }

    setMfaVerifying(true);
    setMfaError("");
    try {
      const result = await apiRequest("/verify-2fa", {
        method: "POST",
        body: JSON.stringify({
          mfaToken,
          code: mfaCode,
        }),
      });

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      navigate("/profile");
    } catch (err: any) {
      setMfaError(err.message || "Invalid verification code.");
    } finally {
      setMfaVerifying(false);
    }
  }

  // Social Login Mock
  async function handleSocialLogin(provider: "google" | "github") {
    try {
      const mockEmail = `mock.${provider}.${Math.floor(Math.random() * 1000)}@example.com`;
      const mockUsername = `${provider}_user_${Math.floor(Math.random() * 1000)}`;
      
      const result = await apiRequest("/oauth/login", {
        method: "POST",
        body: JSON.stringify({
          provider,
          email: mockEmail,
          username: mockUsername,
        }),
      });

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      navigate("/profile");
    } catch (err: any) {
      console.error("Social login failed:", err);
    }
  }

  const { form, errors, setErrors, submitError, submitting, handleChange, handleSubmit } =
    useLoginForm(handleSuccess);

  if (mfaRequired) {
    return (
      <div className="page-center">
        <div className="card">
          <div className="brand">
            <span className="brand-logo">⬡</span>
            <span className="brand-name">NexVault</span>
          </div>

          <h1 className="card-title">Two-Factor Authentication</h1>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
            Enter the 6-digit verification code from your authenticator app.
          </p>

          {mfaError && (
            <div className="form-error" role="alert">
              {mfaError}
            </div>
          )}

          <form onSubmit={handleMFAVerify}>
            <div className="field">
              <label htmlFor="mfaCode">Verification Code</label>
              <input
                id="mfaCode"
                name="mfaCode"
                type="text"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000 000"
                style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600" }}
                required
              />
            </div>

            <button type="submit" className="submit-btn" disabled={mfaVerifying}>
              {mfaVerifying ? "Verifying…" : "Verify Code"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMfaRequired(false)}
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
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">NexVault</span>
        </div>

        <h1 className="card-title">Log in</h1>

        {successMessage && (
          <div className="form-success" role="alert" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            fontSize: "14px",
            marginBottom: "1rem"
          }}>
            {successMessage}
          </div>
        )}

        {submitError && (
          <div className="form-error" role="alert">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="identifier">Username or email</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              value={form.identifier}
              onChange={handleChange}
              placeholder="john_doe or you@example.com"
              aria-describedby={errors.identifier ? "id-err" : undefined}
            />
            {errors.identifier && (
              <span className="field-error" id="id-err" role="alert">
                {errors.identifier}
              </span>
            )}
          </div>

          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label htmlFor="password" style={{ margin: 0 }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: "12px", color: "var(--color-accent)", textDecoration: "none" }}>
                Forgot Password?
              </Link>
            </div>
            <div className="input-row">
              <input
                id="password"
                name="password"
                type={pwField.visible ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                aria-describedby={errors.password ? "pw-err" : undefined}
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={pwField.toggle}
                aria-label={pwField.visible ? "Hide password" : "Show password"}
              >
                {pwField.visible ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && (
              <span className="field-error" id="pw-err" role="alert">
                {errors.password}
              </span>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div className="divider">
          <span>or log in with</span>
        </div>

        <div className="social-buttons">
          <button onClick={() => handleSocialLogin("google")} className="social-btn google-btn">
            <span className="social-icon">G</span> Google
          </button>
          <button onClick={() => handleSocialLogin("github")} className="social-btn github-btn">
            <span className="social-icon">🐈</span> GitHub
          </button>
        </div>

        <p className="switch-link">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
