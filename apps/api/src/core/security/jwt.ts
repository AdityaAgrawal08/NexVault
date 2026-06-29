import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-jwt-secret-key-123456";

export interface AccessTokenPayload {
  userId: string;
  username: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // unique ID to track and rotate/revoke this specific refresh token
}

export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
}
