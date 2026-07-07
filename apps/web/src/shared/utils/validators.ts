export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  // E.164-compatible — adjust regex for region-specific formats if needed
  return /^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ""));
}

export function isValidUsername(username: string): boolean {
  // 3–32 chars, alphanumeric + underscore
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}
