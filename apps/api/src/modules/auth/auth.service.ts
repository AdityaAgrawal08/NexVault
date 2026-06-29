import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";
import { usernameBloomFilter } from "./username-bloom-filter";

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
  ): Promise<AuthenticatedUser> {
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

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };
  }
}

export const authService = new AuthService();

