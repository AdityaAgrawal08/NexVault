import { Link, useNavigate, useLocation } from "react-router-dom";
import { useLoginForm } from "../hooks/useLoginForm";
import { usePasswordVisibility } from "@/shared/hooks/usePasswordVisibility";
import type { LoginFormData } from "@/shared/types/auth.types";

export default function LoginPage() {
  const pwField = usePasswordVisibility();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;

  async function handleSuccess(data: LoginFormData) {
    const response = await fetch(
      "http://localhost:3000/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const result = await response.json();
    if (!response.ok) {
      if (result.errors) {
        const formErrors: any = {};
        for (const key of Object.keys(result.errors)) {
          formErrors[key] = Array.isArray(result.errors[key])
            ? result.errors[key][0]
            : result.errors[key];
        }
        setErrors(formErrors);
      }
      throw new Error(result.message || "Invalid credentials.");
    }

    // Save user details to localStorage
    localStorage.setItem("user", JSON.stringify(result.data));

    // Redirect to profile
    navigate("/profile");
  }

  const { form, errors, setErrors, submitError, submitting, handleChange, handleSubmit } =
    useLoginForm(handleSuccess);

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
            <label htmlFor="password">Password</label>
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

        <p className="switch-link">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
