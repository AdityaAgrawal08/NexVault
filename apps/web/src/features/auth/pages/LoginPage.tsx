import { useState, FormEvent } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useLoginForm } from "../hooks/useLoginForm";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import type { LoginFormData } from "@/shared/types/auth.types";
import { apiRequest, setAccessToken } from "@/shared/utils/apiClient";

export default function LoginPage() {
  const pwField = usePasswordVisibility();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");

  // Concurrent Session Handling State
  const [sessionConflict, setSessionConflict] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<LoginFormData | null>(null);
  const [forceLoggingIn, setForceLoggingIn] = useState(false);
  const [forceLoginError, setForceLoginError] = useState<string | null>(null);

  // 2FA Verification State
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);

  // 2FA Setup State (Mandatory on First Login)
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);

  async function handleSuccess(data: LoginFormData) {
    try {
      setSessionConflict(false);
      setPendingFormData(null);

      const result = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (result.data.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(result.data.mfaToken);
        return;
      }

      if (result.data.mfaSetupRequired) {
        setMfaSetupRequired(true);
        setMfaToken(result.data.mfaToken);
        setMfaSetupData(result.data.mfaSetup);
        return;
      }

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      navigate("/profile");
    } catch (err: any) {
      if (err.code === "AUTH_SESSION_ALREADY_ACTIVE" || err.statusCode === 409) {
        setSessionConflict(true);
        setPendingFormData(data);
        return;
      }

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

  async function handleForceLogin() {
    if (!pendingFormData) return;
    setForceLoggingIn(true);
    setForceLoginError(null);
    try {
      const result = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({
          ...pendingFormData,
          force: true,
        }),
      });

      if (result.data.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(result.data.mfaToken);
        setSessionConflict(false);
        setPendingFormData(null);
        return;
      }

      if (result.data.mfaSetupRequired) {
        setMfaSetupRequired(true);
        setMfaToken(result.data.mfaToken);
        setMfaSetupData(result.data.mfaSetup);
        setSessionConflict(false);
        setPendingFormData(null);
        return;
      }

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      setSessionConflict(false);
      setPendingFormData(null);
      navigate("/profile");
    } catch (err: any) {
      setForceLoginError(err.message || "Failed to log out other devices and log in.");
    } finally {
      setForceLoggingIn(false);
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

  async function handleMFASetupVerify(e: FormEvent) {
    e.preventDefault();
    if (mfaCode.length !== 6) {
      setMfaError("Please enter a 6-digit code.");
      return;
    }

    if (!mfaSetupData) return;

    setMfaVerifying(true);
    setMfaError("");
    try {
      const result = await apiRequest("/verify-setup-2fa", {
        method: "POST",
        body: JSON.stringify({
          mfaToken,
          secret: mfaSetupData.secret,
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

      if (result.data.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(result.data.mfaToken);
        return;
      }

      if (result.data.mfaSetupRequired) {
        setMfaSetupRequired(true);
        setMfaToken(result.data.mfaToken);
        setMfaSetupData(result.data.mfaSetup);
        return;
      }

      setAccessToken(result.data.accessToken);
      localStorage.setItem("user", JSON.stringify(result.data.user));
      navigate("/profile");
    } catch (err: any) {
      console.error("Social login failed:", err);
    }
  }

  const { form, errors, setErrors, submitError, submitting, handleChange, handleSubmit } =
    useLoginForm(handleSuccess);

  // Render 2FA Setup view
  if (mfaSetupRequired && mfaSetupData) {
    return (
      <div className="page-center">
        <div className="card">
          <div className="brand">
            <span className="brand-logo">⬡</span>
            <span className="brand-name">NexVault</span>
          </div>

          <h1 className="card-title">Set up Two-Factor Auth</h1>
          <p style={{ fontSize: "13px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem" }}>
            MFA is mandatory for your account security. Please scan the QR code to set up your authenticator app.
          </p>

          {mfaError && (
            <div className="form-error" role="alert">
              {mfaError}
            </div>
          )}

          <form onSubmit={handleMFASetupVerify}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", marginBottom: "1.5rem" }}>
              <div style={{ backgroundColor: "white", padding: "8px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                <img src={mfaSetupData.qrCodeUrl} alt="2FA Setup QR" style={{ width: "160px", height: "160px", display: "block" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <span className="profile-field-label" style={{ display: "block", marginBottom: "2px" }}>Secret Key</span>
                <code style={{ fontSize: "13px", color: "var(--color-accent)", fontWeight: "600", letterSpacing: "1px" }}>
                  {mfaSetupData.secret}
                </code>
              </div>
            </div>

            <div className="field">
              <label htmlFor="setupMfaCode">Verification Code</label>
              <input
                id="setupMfaCode"
                name="setupMfaCode"
                type="text"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000000"
                style={{ textAlign: "center", letterSpacing: "4px", fontSize: "18px", fontWeight: "600" }}
                required
              />
            </div>

            <button type="submit" className="submit-btn" disabled={mfaVerifying}>
              {mfaVerifying ? "Verifying & Enabling…" : "Verify and Log In"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMfaSetupRequired(false)}
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

  // Render 2FA Verification view
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

  // Render Session Conflict View
  if (sessionConflict) {
    return (
      <div className="page-center">
        <div className="card">
          <div className="brand">
            <span className="brand-logo">⬡</span>
            <span className="brand-name">NexVault</span>
          </div>

          <h1 className="card-title">Active Session Exists</h1>
          
          <p style={{ fontSize: "14px", color: "var(--color-muted)", textAlign: "center", marginBottom: "1.5rem", lineHeight: "1.5" }}>
            An active session already exists on another device.
          </p>

          {forceLoginError && (
            <div className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
              {forceLoginError}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
            <button 
              type="button" 
              className="submit-btn" 
              onClick={handleForceLogin}
              disabled={forceLoggingIn}
              style={{ margin: 0 }}
            >
              {forceLoggingIn ? "Logging out other devices…" : "Log Out Other Devices"}
            </button>
            <button 
              type="button" 
              onClick={() => {
                setSessionConflict(false);
                setPendingFormData(null);
                setForceLoginError(null);
              }}
              style={{
                background: "var(--color-bg-alt, #1f2937)",
                border: "1px solid var(--color-border, #374151)",
                color: "var(--color-text, #f3f4f6)",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius)",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                width: "100%"
              }}
              disabled={forceLoggingIn}
            >
              Cancel
            </button>
          </div>
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

        {reason === "concurrent" && (
          <div className="form-error" role="alert" style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--color-error)",
            color: "var(--color-error)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            fontSize: "14px",
            marginBottom: "1.5rem",
            textAlign: "center"
          }}>
            Your session has ended because your account was signed in from another device.
          </div>
        )}

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
