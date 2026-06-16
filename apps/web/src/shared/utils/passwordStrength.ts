import type { PasswordStrengthResult } from "@/shared/types/auth.types";

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const failures: string[] = [];

  if (password.length < 8) failures.push("Minimum 8 characters");
  if (!/[A-Z]/.test(password)) failures.push("At least one uppercase letter");
  if (!/[a-z]/.test(password)) failures.push("At least one lowercase letter");
  if (!/[0-9]/.test(password)) failures.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("At least one special character");

  const passed = 5 - failures.length;

  const scoreMap: Record<number, PasswordStrengthResult["score"]> = {
    0: 0,
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
  };

  const labelMap: Record<PasswordStrengthResult["score"], PasswordStrengthResult["label"]> = {
    0: "Too weak",
    1: "Weak",
    2: "Fair",
    3: "Strong",
    4: "Very strong",
  };

  const score = scoreMap[passed];

  return { score, label: labelMap[score], failures };
}

export function isPasswordStrong(password: string): boolean {
  return evaluatePasswordStrength(password).score >= 3;
}
