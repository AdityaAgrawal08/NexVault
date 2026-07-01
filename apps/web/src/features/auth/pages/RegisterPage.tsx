import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRegisterForm } from "../hooks/useRegisterForm";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";
import type { RegisterFormData } from "@/shared/types/auth.types";
import { apiRequest, setAccessToken, API_BASE_URL } from "@/shared/utils/apiClient";

export default function RegisterPage() {
  const pwField = usePasswordVisibility();
  const cpwField = usePasswordVisibility();
  const navigate = useNavigate();

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMessage, setUsernameMessage] = useState("");

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const [otpSending, setOtpSending] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  async function handleSendOTP() {
    const email = form.email.trim();
    if (!email || !email.includes("@")) {
      setErrors((prev) => ({ ...prev, email: "Please enter a valid email address first." }));
      return;
    }

    setOtpSending(true);
    setOtpError("");
    try {
      await apiRequest("/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setOtpSent(true);
      setCountdown(60); // 1 minute rate limit
    } catch (err: any) {
      setOtpError(err.message || "Failed to send verification code.");
    } finally {
      setOtpSending(false);
    }
  }

  async function handleSuccess(data: RegisterFormData) {
    const otp = (data as any).otp?.trim();
    if (!otp || otp.length !== 6) {
      setOtpError("Please enter the 6-digit verification code.");
      throw new Error("Email verification code is required.");
    }

    try {
      await apiRequest("/register", {
        method: "POST",
        body: JSON.stringify({ ...data, otp }),
      });
      navigate("/login", { state: { message: "Account created and verified successfully! Please log in." } });
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
    useRegisterForm(handleSuccess);

  useEffect(() => {
    const username = form.username.trim();
    if (!username) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }

    if (username.length < 3) {
      setUsernameStatus("invalid");
      setUsernameMessage("Username must be at least 3 characters.");
      return;
    }

    if (username.length > 32) {
      setUsernameStatus("invalid");
      setUsernameMessage("Username must not exceed 32 characters.");
      return;
    }

    if (!/^[A-Za-z0-9_]+$/.test(username)) {
      setUsernameStatus("invalid");
      setUsernameMessage("Username can only contain letters, numbers, and underscores.");
      return;
    }

    setUsernameStatus("checking");
    setUsernameMessage("");

    const delayDebounce = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/check-username?username=${encodeURIComponent(username)}`
        );
        const result = await response.json();
        if (result.available) {
          setUsernameStatus("available");
          setUsernameMessage("Username is available!");
        } else {
          setUsernameStatus("taken");
          setUsernameMessage(result.message || "Username is already taken.");
        }
      } catch (err) {
        console.error("Error checking username availability:", err);
        setUsernameStatus("idle");
        setUsernameMessage("");
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [form.username]);

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">NexVault</span>
        </div>

        <h1 className="card-title">Create your account</h1>

        {submitError && (
          <div className="form-error" role="alert">
            {submitError}
          </div>
        )}

        {otpError && (
          <div className="form-error" role="alert">
            {otpError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="username">Username</label>
            <div style={{ position: "relative" }}>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={handleChange}
                placeholder="e.g. john_doe"
                aria-describedby={errors.username ? "username-err" : undefined}
                className={
                  usernameStatus === "available"
                    ? "input-success"
                    : usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "input-error"
                    : ""
                }
              />
              {usernameStatus === "checking" && (
                <span className="input-spinner" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)" }}>⏳</span>
              )}
            </div>
            {usernameMessage && (
              <span className={`availability-indicator ${usernameStatus}`} style={{ display: "block", marginTop: "4px" }}>
                {usernameStatus === "available" ? "✓ " : "✗ "}
                {usernameMessage}
              </span>
            )}
            {errors.username && (
              <span className="field-error" id="username-err" role="alert" style={{ display: "block", marginTop: "4px" }}>
                {errors.username}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <div className="integrated-row">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                aria-describedby={errors.email ? "email-err" : undefined}
              />
              <button
                type="button"
                className="integrated-otp-btn"
                onClick={handleSendOTP}
                disabled={otpSending || countdown > 0}
              >
                {otpSending ? "Sending…" : countdown > 0 ? `Resend (${countdown}s)` : "Send OTP"}
              </button>
            </div>
            {errors.email && (
              <span className="field-error" id="email-err" role="alert">
                {errors.email}
              </span>
            )}
          </div>

          {otpSent && (
            <div className="field">
              <label htmlFor="otp">Email Verification OTP</label>
              <input
                id="otp"
                name="otp"
                type="text"
                maxLength={6}
                value={(form as any).otp || ""}
                onChange={handleChange}
                placeholder="Enter 6-digit verification code"
                style={{ textAlign: "center", letterSpacing: "4px", fontSize: "16px", fontWeight: "600" }}
              />
              <span style={{ fontSize: "11px", color: "var(--color-muted)", marginTop: "4px", display: "block" }}>
                OTP is valid for 15 minutes. Check terminal logs for code.
              </span>
            </div>
          )}

          <div className="field">
            <label htmlFor="phoneNumber">Phone number</label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              value={form.phoneNumber}
              onChange={handleChange}
              placeholder="9876543210"
              aria-describedby={errors.phoneNumber ? "phone-err" : undefined}
            />
            {errors.phoneNumber && (
              <span className="field-error" id="phone-err" role="alert">
                {errors.phoneNumber}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-row">
              <input
                id="password"
                name="password"
                type={pwField.visible ? "text" : "password"}
                autoComplete="new-password"
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
            <PasswordStrengthBar password={form.password} />
            {errors.password && (
              <span className="field-error" id="pw-err" role="alert">
                {errors.password}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <div className="input-row">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={cpwField.visible ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                aria-describedby={errors.confirmPassword ? "cpw-err" : undefined}
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
            {form.confirmPassword && (
              <span
                className={
                  form.password === form.confirmPassword
                    ? "match-indicator match"
                    : "match-indicator no-match"
                }
              >
                {form.password === form.confirmPassword
                  ? "✓ Passwords match"
                  : "✗ Passwords do not match"}
              </span>
            )}
            {errors.confirmPassword && (
              <span className="field-error" id="cpw-err" role="alert">
                {errors.confirmPassword}
              </span>
            )}
          </div>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? "Verifying and creating account…" : "Create account"}
          </button>
        </form>

        <div className="divider">
          <span>or register with</span>
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
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
