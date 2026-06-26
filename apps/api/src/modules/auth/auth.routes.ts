import { Router } from "express";
import { db } from "../../core/database/postgres";
import { hashPassword } from "../../core/security/password";

const router = Router();
router.post("/register", async (req, res) => {
  const {
    username,
    email,
    phoneNumber,
    password,
  } = req.body;

  const passwordHash = await hashPassword(password);

  await db.query(
    `INSERT INTO users(
      username,
      email,
      phone_number,
      password
    )
    VALUES(
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
    ]
  );

  res.status(201).json({
    message: "User Created",
  });
});

export default router;
