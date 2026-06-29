import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function needsPasswordRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}
