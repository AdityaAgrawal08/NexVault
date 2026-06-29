import { useState, ChangeEvent, FormEvent } from "react";
import type { LoginFormData } from "@/shared/types/auth.types";

type FieldErrors = Partial<Record<keyof LoginFormData, string>>;

const INITIAL: LoginFormData = { identifier: "", password: "" };

export function useLoginForm(onSuccess: (data: LoginFormData) => Promise<void>) {
  const [form, setForm] = useState<LoginFormData>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!form.identifier.trim()) errs.identifier = "Username or email is required.";
    if (!form.password) errs.password = "Password is required.";
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
      await onSuccess(form);
    } catch (err: any) {
      setSubmitError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return { form, errors, setErrors, submitError, setSubmitError, submitting, handleChange, handleSubmit };
}
