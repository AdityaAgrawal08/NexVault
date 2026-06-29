import { DatabaseError } from "pg";

import { db } from "../../core/database/postgres";

import {
  CreateUserInput,
  CreateUserResult,
  UserRecord,
} from "./auth.types";

import {
  UserAlreadyExistsError,
  UserNotFoundError,
} from "./auth.errors";

export class AuthRepository {
  public async createUser(
    input: CreateUserInput,
  ): Promise<CreateUserResult> {
    const {
      username,
      email,
      phoneNumber,
      passwordHash,
    } = input;

    try {
      const { rows } = await db.query<CreateUserResult>(
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
          RETURNING
            id,
            username,
            email,
            phone_number AS "phoneNumber",
            created_at AS "createdAt"
        `,
        [
          username,
          email,
          phoneNumber,
          passwordHash,
        ],
      );

      const user = rows[0];

      if (!user) {
        throw new Error(
          "INSERT succeeded but returned no rows.",
        );
      }

      return user;
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === "23505"
      ) {
        switch (error.constraint) {
          case "users_username_key":
            throw new UserAlreadyExistsError("username");

          case "users_email_key":
            throw new UserAlreadyExistsError("email");

          case "users_phone_number_key":
            throw new UserAlreadyExistsError("phoneNumber");

          default:
            throw error;
        }
      }

      throw error;
    }
  }

  public async findUserById(
    id: string,
  ): Promise<UserRecord> {
    const { rows } = await db.query<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByEmail(
    email: string,
  ): Promise<UserRecord> {
    const { rows } = await db.query<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByUsername(
    username: string,
  ): Promise<UserRecord> {
    const { rows } = await db.query<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE LOWER(username) = LOWER($1)
        LIMIT 1
      `,
      [username],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async findUserByPhone(
    phoneNumber: string,
  ): Promise<UserRecord> {
    const { rows } = await db.query<UserRecord>(
      `
        SELECT
          id,
          username,
          email,
          phone_number AS "phoneNumber",
          password AS "passwordHash",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM users
        WHERE phone_number = $1
        LIMIT 1
      `,
      [phoneNumber],
    );

    const user = rows[0];

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  public async getAllUsernames(): Promise<string[]> {
    const { rows } = await db.query<{ username: string }>(
      `SELECT username FROM users`
    );
    return rows.map((row) => row.username);
  }
}

export const authRepository = new AuthRepository();

