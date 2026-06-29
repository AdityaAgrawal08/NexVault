import {
  hashPassword,
  verifyPassword,
} from "../../core/security/password";

import { authRepository } from "./auth.repository";

import {
  InvalidCredentialsError,
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
    const passwordHash = await hashPassword(input.password);

    const createUserInput: CreateUserInput = {
      username: input.username,
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
    };

    return authRepository.createUser(createUserInput);
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
    };
  }
}

export const authService = new AuthService();
