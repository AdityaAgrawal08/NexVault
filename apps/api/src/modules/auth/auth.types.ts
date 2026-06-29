import type { RegisterRequest } from "../../shared/validators/register.validator";

export type RegisterUserRequest = RegisterRequest;
export type RegisterUserResponse = {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  createdAt: Date;
};

export type CreateUserInput = {
  username: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
};

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserResult = {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
  createdAt: Date;
};

export type LoginRequest = {
  identifier: string;
  password: string;
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string;
  phoneNumber: string;
};

export type LoginResult = {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
};

export type AccessTokenPayload = {
  sub: string;
  username: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
};
