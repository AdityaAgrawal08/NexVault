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
            <div className="input-row">
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
                className="otp-send-btn"
                onClick={handleSendOTP}
                disabled={otpSending || countdown > 0}
                style={{
                  padding: "0 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid var(--color-accent)",
                  color: "var(--color-accent)",
                  borderRadius: "var(--radius)",
                  cursor: "pointer",
                }}
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
                className="toggle-btn"
                onClick={pwField.toggle}
                aria-label={pwField.visible ? "Hide password" : "Show password"}
              >
                {pwField.visible ? "Hide" : "Show"}
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
                className="toggle-btn"
                onClick={cpwField.toggle}
                aria-label={cpwField.visible ? "Hide password" : "Show password"}
              >
                {cpwField.visible ? "Hide" : "Show"}
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
            <span className="social-icon">G</span> Google
          </button>
          <button onClick={() => handleSocialLogin("github")} className="social-btn github-btn">
            <span className="social-icon">🐈</span> GitHub
          </button>
        </div>

        <p className="switch-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
