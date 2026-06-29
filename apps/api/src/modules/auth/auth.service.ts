import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";
import { usernameBloomFilter } from "./username-bloom-filter";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  RefreshTokenPayload,
} from "../../core/security/jwt";

import { AppError } from "../../shared/errors/app-error";

import {
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from "./auth.errors";

import type {
  AuthenticatedUser,
  CreateUserInput,
  LoginRequest,
  RegisterUserRequest,
  RegisterUserResponse,
  LoginResult,
} from "./auth.types";

class AuthService {
  public async register(
    input: RegisterUserRequest,
  ): Promise<RegisterUserResponse> {
    // 1. Pre-check username availability
    try {
      await authRepository.findUserByUsername(input.username);
      throw new UserAlreadyExistsError("username");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    // 2. Pre-check email availability
    try {
      await authRepository.findUserByEmail(input.email);
      throw new UserAlreadyExistsError("email");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    // 3. Pre-check phone number availability
    try {
      await authRepository.findUserByPhone(input.phoneNumber);
      throw new UserAlreadyExistsError("phoneNumber");
    } catch (error) {
      if (!(error instanceof UserNotFoundError)) {
        throw error;
      }
    }

    const passwordHash = await hashPassword(input.password);

    const createUserInput: CreateUserInput = {
      username: input.username,
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
    };

    const user = await authRepository.createUser(createUserInput);
    usernameBloomFilter.add(user.username.toLowerCase());
    return user;
  }

  public async login(
    input: LoginRequest,
  ): Promise<LoginResult> {
    const user = input.identifier.includes("@")
      ? await authRepository.findUserByEmail(input.identifier)
      : await authRepository.findUserByUsername(input.identifier);

    const isPasswordValid = await verifyPassword(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    // Generate access token
    const accessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    // Generate refresh token (valid for 7 days)
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dbToken = await authRepository.createRefreshToken(user.id, refreshExpiresAt);

    const refreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: dbToken.id,
    });

    return {
      user: authenticatedUser,
      accessToken,
      refreshToken,
    };
  }

  public async refresh(
    refreshToken: string,
  ): Promise<LoginResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      throw new AppError({
        message: "Invalid or expired refresh token.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_INVALID",
      });
    }

    const tokenRecord = await authRepository.findRefreshTokenById(payload.tokenId);

    if (!tokenRecord) {
      throw new AppError({
        message: "Refresh token not found.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_NOT_FOUND",
      });
    }

    // Reuse detection
    if (tokenRecord.isRevoked) {
      if (tokenRecord.replacedBy) {
        // Revoke all tokens for this user
        await authRepository.revokeAllUserRefreshTokens(tokenRecord.userId);
        throw new AppError({
          message: "Refresh token reuse detected. All sessions revoked.",
          statusCode: 401,
          code: "AUTH_REFRESH_TOKEN_REUSE",
        });
      }

      throw new AppError({
        message: "Refresh token has been revoked.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_REVOKED",
      });
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new AppError({
        message: "Refresh token has expired.",
        statusCode: 401,
        code: "AUTH_REFRESH_TOKEN_EXPIRED",
      });
    }

    const user = await authRepository.findUserById(tokenRecord.userId);

    // Rotate the refresh token
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newToken = await authRepository.replaceRefreshToken(
      tokenRecord.id,
      user.id,
      refreshExpiresAt
    );

    const newAccessToken = generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    const newRefreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: newToken.id,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  public async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await authRepository.revokeRefreshToken(payload.tokenId);
    } catch (err) {
      // If token is invalid/expired, it's already cleared
    }
  }
}

export const authService = new AuthService();


