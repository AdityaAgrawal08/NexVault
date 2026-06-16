import { Link } from "react-router-dom";
import { useRegisterForm } from "../hooks/useRegisterForm";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import PasswordStrengthBar from "@/shared/components/PasswordStrengthBar";
import type { RegisterFormData } from "@/shared/types/auth.types";

export default function RegisterPage() {
  const pwField = usePasswordVisibility();
  const cpwField = usePasswordVisibility();

  async function handleSuccess(data: RegisterFormData) {
    // Replace with actual API call to POST /api/auth/register
    console.log("Register payload:", data);
  }

  const { form, errors, submitting, handleChange, handleSubmit } =
    useRegisterForm(handleSuccess);

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <span className="brand-logo">⬡</span>
          <span className="brand-name">NexVault</span>
        </div>

        <h1 className="card-title">Create your account</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={handleChange}
              placeholder="e.g. john_doe"
              aria-describedby={errors.username ? "username-err" : undefined}
            />
            {errors.username && (
              <span className="field-error" id="username-err" role="alert">
                {errors.username}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
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
            {errors.email && (
              <span className="field-error" id="email-err" role="alert">
                {errors.email}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="phoneNumber">Phone number</label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              value={form.phoneNumber}
              onChange={handleChange}
              placeholder="+91 9876543210"
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
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="switch-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
