import { Router } from "express";
import { DatabaseError } from "pg";
import { ZodError } from "zod";
import { db } from "../../core/database/postgres";
import { hashPassword } from "../../core/security/password";
import { registerSchema } from "../../shared/validators/register.validator";

const router = Router();

router.post("/register", async (req, res) => {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Validation failed.",
      errors: result.error.flatten(),
    });
  }

  const {
    username,
    email,
    phoneNumber,
    password,
  } = result.data;

  try {
    const passwordHash = await hashPassword(password);

    await db.query(
      `
        INSERT INTO users (
          username,
          email,
          phone_number,
          password
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
      `,
      [
        username,
        email,
        phoneNumber,
        passwordHash,
      ],
    );

    return res
      .status(201)
      .location(`/users/${username}`)
      .json({
        message: "User created successfully.",
      });
  } catch (error) {
    if (error instanceof DatabaseError) {
      if (error.code === "23505") {
        switch (error.constraint) {
          case "users_username_key":
            return res.status(409).json({
              message: "Username already exists.",
            });

          case "users_email_key":
            return res.status(409).json({
              message: "Email already exists.",
            });

          case "users_phone_number_key":
            return res.status(409).json({
              message: "Phone number already exists.",
            });

          default:
            return res.status(409).json({
              message: "User already exists.",
            });
        }
      }
    }

    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation failed.",
        errors: error.flatten(),
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Internal server error.",
    });
  }
});

export default router;
