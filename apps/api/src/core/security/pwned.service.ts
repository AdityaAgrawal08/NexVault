import crypto from "crypto";

class PwnedPasswordService {
  /**
   * Checks if a password has been leaked in a public data breach using the
   * HaveIBeenPwned API via k-Anonymity (only the first 5 chars of SHA-1 are sent).
   */
  public async isPasswordBreached(password: string): Promise<boolean> {
    try {
      const sha1Hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
      const prefix = sha1Hash.slice(0, 5);
      const suffix = sha1Hash.slice(5);

      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      if (!res.ok) {
        // Fail-open: if the HIBP API is down, allow the password but log the error
        console.error(`[PwnedPasswordService] HIBP API error: ${res.statusText}`);
        return false;
      }

      const body = await res.text();
      const lines = body.split("\n");

      for (const line of lines) {
        const [matchSuffix, countStr] = line.split(":");
        if (matchSuffix && matchSuffix.trim() === suffix) {
          const count = parseInt(countStr || "0", 10);
          if (count > 0) {
            console.warn(`[PwnedPasswordService] Password breach match found! Breached ${count} times.`);
            return true;
          }
        }
      }
    } catch (err) {
      console.error("[PwnedPasswordService] Failed to check password breach status:", err);
    }

    return false;
  }
}

export const pwnedPasswordService = new PwnedPasswordService();
export type { PwnedPasswordService };
