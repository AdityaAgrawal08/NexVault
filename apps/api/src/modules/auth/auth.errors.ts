import { AppError } from "../../shared/errors/app-error";

export class UserAlreadyExistsError extends AppError {
  constructor(field: "username" | "email" | "phoneNumber") {
    super({
      message: `${field} already exists.`,
      statusCode: 409,
      code: "AUTH_USER_ALREADY_EXISTS",
    });
  }
}

export class UserNotFoundError extends AppError {
  constructor() {
    super({
      message: "User not found.",
      statusCode: 404,
      code: "AUTH_USER_NOT_FOUND",
    });
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super({
      message: "Invalid credentials.",
      statusCode: 401,
      code: "AUTH_INVALID_CREDENTIALS",
    });
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super({
      message: "Email address has not been verified.",
      statusCode: 403,
      code: "AUTH_EMAIL_NOT_VERIFIED",
    });
  }
}

export class AccountLockedError extends AppError {
  constructor() {
    super({
      message: "Account is temporarily locked.",
      statusCode: 423,
      code: "AUTH_ACCOUNT_LOCKED",
    });
  }
}

export class AccountDisabledError extends AppError {
  constructor() {
    super({
      message: "Account has been disabled.",
      statusCode: 403,
      code: "AUTH_ACCOUNT_DISABLED",
    });
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super({
      message: "Invalid refresh token.",
      statusCode: 401,
      code: "AUTH_INVALID_REFRESH_TOKEN",
    });
  }
}

export class RefreshTokenExpiredError extends AppError {
  constructor() {
    super({
      message: "Refresh token has expired.",
      statusCode: 401,
      code: "AUTH_REFRESH_TOKEN_EXPIRED",
    });
  }
}
