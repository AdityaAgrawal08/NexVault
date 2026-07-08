import { z } from "zod";

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, "Username or email is required."),
    password: z.string().min(1, "Password is required."),
    force: z.boolean().optional(),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address."),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address."),
    otp: z.string().trim().length(6, "Verification code must be exactly 6 digits.").regex(/^\d+$/, "Verification code must contain only digits."),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters.")
      .max(128, "Password must not exceed 128 characters.")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
      .regex(/\d/, "Password must contain at least one digit.")
      .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character."),
  })
  .strict();

export const oauthLoginSchema = z
  .object({
    provider: z.enum(["google", "github"]),
    token: z.string().min(1, "OAuth token is required."),
  })
  .strict();

export const deleteConfirmSchema = z
  .object({
    method: z.enum(["email", "password"]),
    confirm: z.boolean().refine((val) => val === true, "Explicit confirmation is required."),
    email: z.string().trim().toLowerCase().email("Invalid email address.").optional(),
    otp: z.string().trim().length(6, "Verification code must be exactly 6 digits.").regex(/^\d+$/, "Verification code must contain only digits.").optional(),
    password: z.string().optional(),
  })
  .strict();
