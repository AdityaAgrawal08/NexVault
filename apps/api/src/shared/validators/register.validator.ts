//Zod is a popular TypeScript-first schema declaration and validation library.
//It lets you define a data "shape" (a schema) once,
//and Zod will automatically enforce data validation at runtime while providing strong TypeScript types.

import { z } from "zod";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const EMAIL_MAX_LENGTH = 254;

const normalize = (value: string): string => value.normalize("NFKC");

export const registerSchema = z
  .object({
    username: z
      .string()
      .overwrite(normalize)
      .trim()
      .min(1, "Username is required.")
      .min(
        USERNAME_MIN_LENGTH,
        `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
      )
      .max(
        USERNAME_MAX_LENGTH,
        `Username must not exceed ${USERNAME_MAX_LENGTH} characters.`,
      )
      .regex(
        /^[A-Za-z0-9_]+$/,
        "Username may contain only letters, numbers, and underscores.",
      ),

    email: z
      .string()
      .overwrite(normalize)
      .trim()
      .toLowerCase()
      .min(1, "Email is required.")
      .max(
        EMAIL_MAX_LENGTH,
        `Email must not exceed ${EMAIL_MAX_LENGTH} characters.`,
      )
      .email("Invalid email address."),

    phoneNumber: z
      .string()
      .overwrite(normalize)
      .trim()
      .min(1, "Phone number is required.")
      .regex(
        /^[1-9]\d{9}$/,
        "Phone number must contain exactly 10 digits.",
      ),

    password: z
      .string()
      .overwrite(normalize)
      .min(1, "Password is required.")
      .min(
        PASSWORD_MIN_LENGTH,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      )
      .max(
        PASSWORD_MAX_LENGTH,
        `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`,
      )
      .regex(
        /[a-z]/,
        "Password must contain at least one lowercase letter.",
      )
      .regex(
        /[A-Z]/,
        "Password must contain at least one uppercase letter.",
      )
      .regex(
        /\d/,
        "Password must contain at least one digit.",
      )
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character.",
      ),

    confirmPassword: z
      .string()
      .overwrite(normalize)
      .min(1, "Please confirm your password."),
  })
  .strict()
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  })
  .transform(({ confirmPassword, ...data }) => data);

export type RegisterRequest = z.infer<typeof registerSchema>;
