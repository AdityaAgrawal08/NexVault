import argon2 from "argon2";

// Explicitly tuned Argon2id configuration matching RFC 9106 guidelines
// for general-use password hashing, maximizing offline brute-force difficulty.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64MB memory cost
  timeCost: 3,           // 3 iterations
  parallelism: 4,        // 4 parallel threads
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
