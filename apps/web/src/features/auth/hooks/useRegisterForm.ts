import { useState, ChangeEvent, FormEvent } from "react";
import type { RegisterFormData } from "@/shared/types/auth.types";
import { isValidEmail, isValidPhone, isValidUsername } from "@/shared/utils/validators";
import { isPasswordStrong } from "@/shared/utils/passwordStrength";

type FieldErrors = Partial<Record<keyof RegisterFormData, string>>;

const INITIAL: RegisterFormData = {
  username: "",
  email: "",
  phoneNumber: "",
  password: "",
  confirmPassword: "",
};

export function useRegisterForm(onSuccess: (data: RegisterFormData) => Promise<void>) {
  const [form, setForm] = useState<RegisterFormData>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};

    if (!isValidUsername(form.username)) {
      errs.username = "3–20 characters, alphanumeric and underscores only.";
    }
    if (!isValidEmail(form.email)) {
      errs.email = "Enter a valid email address.";
    }
    if (!isValidPhone(form.phoneNumber)) {
      errs.phoneNumber = "Enter a valid phone number (10–15 digits, optional leading +).";
    }
    if (!isPasswordStrong(form.password)) {
      errs.password = "Password does not meet strength requirements.";
    }
    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = "Passwords do not match.";
    }

    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Hand off to caller — API wiring lives in the page/service layer
      await onSuccess(form);
    } catch (err: any) {
      setSubmitError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return { form, errors, setErrors, submitError, setSubmitError, submitting, handleChange, handleSubmit };
}

