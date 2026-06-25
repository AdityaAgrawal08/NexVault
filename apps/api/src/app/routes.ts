import { Router } from "express";
import { db } from "../core/database/postgres";

const router = Router();

router.post("/register", async (req, res) => {
  const {
    username,
    email,
    phoneNumber,
    password,
  } = req.body;

  await db.query(
    `
      INSERT INTO users
      (
        username,
        email,
        phone_number,
        password
      )
      VALUES
      (
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
      password,
    ]
  );

  res.status(201).json({
    message: "User created",
  });
});

export default router;
