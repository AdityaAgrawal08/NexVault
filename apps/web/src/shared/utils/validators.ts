export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  // E.164-compatible — adjust regex for region-specific formats if needed
  return /^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ""));
}

export function isValidUsername(username: string): boolean {
  // 3–20 chars, alphanumeric + underscore, no leading/trailing underscore
  return /^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$/.test(username);
}
