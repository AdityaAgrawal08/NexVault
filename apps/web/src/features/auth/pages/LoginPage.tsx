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
  const [logoutSuccessMessage, setLogoutSuccessMessage] = useState("");

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
      setLogoutSuccessMessage("");

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

      if (result.code === "AUTH_CONCURRENT_SESSIONS_REVOKED") {
        setSessionConflict(false);
        setPendingFormData(null);
        setLogoutSuccessMessage(result.message || "All other sessions have been logged out. Please log in again.");
        return;
      }

      if (result.data && result.data.mfaRequired) {
        setMfaRequired(true);
        setMfaToken(result.data.mfaToken);
        setSessionConflict(false);
        setPendingFormData(null);
        return;
      }

      if (result.data && result.data.mfaSetupRequired) {
        setMfaSetupRequired(true);
        setMfaToken(result.data.mfaToken);
        setMfaSetupData(result.data.mfaSetup);
        setSessionConflict(false);
        setPendingFormData(null);
        return;
      }

      if (result.data) {
        setAccessToken(result.data.accessToken);
        localStorage.setItem("user", JSON.stringify(result.data.user));
        setSessionConflict(false);
        setPendingFormData(null);
        navigate("/profile");
      }
    } catch (err: any) {
      setForceLoginError(err.message || "Failed to log out other devices.");
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

        {logoutSuccessMessage && (
          <div className="form-success" role="alert" style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid var(--color-success)",
            color: "var(--color-success)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius)",
            fontSize: "14px",
            marginBottom: "1rem",
            textAlign: "center"
          }}>
            {logoutSuccessMessage}
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
            <svg className="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button onClick={() => handleSocialLogin("github")} className="social-btn github-btn">
            <svg className="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            GitHub
          </button>
        </div>

        <p className="switch-link">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
