import crypto from "crypto";
import { otpStore } from "./otp.store";
import { emailService } from "../email/email.service";
import { EmailType } from "../email/email.types";
import { AppError } from "../../shared/errors/app-error";
import { lockService } from "../../core/security/lock.service";

export const OTPPurpose = {
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
  LOGIN_VERIFICATION: "LOGIN_VERIFICATION",
  EMAIL_CHANGE: "EMAIL_CHANGE",
  REAUTHENTICATION: "REAUTHENTICATION",
} as const;

export type OTPPurposeType = typeof OTPPurpose[keyof typeof OTPPurpose];

class OTPService {
  private hashOTP(otp: string): string {
    return crypto.createHash("sha256").update(otp).digest("hex");
  }

  public async sendOTP(
    email: string,
    purpose: OTPPurposeType,
    username = "User",
  ): Promise<void> {
    // 1. Enforce 1-minute resend cooldown
    const latest = await otpStore.findLatestOTP(email, purpose);
    if (latest) {
      const timeSinceLast = Date.now() - new Date(latest.createdAt).getTime();
      if (timeSinceLast < 60 * 1000) {
        throw new AppError({
          message: `Please wait ${Math.ceil((60 * 1000 - timeSinceLast) / 1000)} seconds before requesting a new code.`,
          statusCode: 429,
          code: "OTP_COOLDOWN_ACTIVE",
        });
      }
    }

    // 2. Generate a secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = this.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

    // 3. Save to pluggable store
    await otpStore.saveOTP(email, purpose, otpHash, expiresAt);

    // 4. Map purpose to EmailType and template payload
    let emailType: EmailType = EmailType.EMAIL_VERIFICATION;
    let payload: any = { username, otp };

    if (purpose === OTPPurpose.PASSWORD_RESET) {
      emailType = EmailType.PASSWORD_RESET;
      payload = { username, otp };
    } else if (purpose === OTPPurpose.REAUTHENTICATION) {
      emailType = EmailType.EMAIL_VERIFICATION;
      payload = { username, otp, subject: "Re-authentication Code" };
    }

    // 5. Enqueue email job
    await emailService.enqueue(email, emailType, payload);
  }

  public async verifyOTP(
    email: string,
    purpose: OTPPurposeType,
    otp: string,
  ): Promise<boolean> {
    const lockKey = `lock:otp:${email.toLowerCase()}:${purpose}`;
    const lockToken = await lockService.acquireLock(lockKey, 5000);

    if (!lockToken) {
      throw new AppError({
        message: "An OTP verification is already in progress for this request. Please try again.",
        statusCode: 429,
        code: "AUTH_CONCURRENT_OTP_VERIFY",
      });
    }

    try {
      const record = await otpStore.findLatestOTP(email, purpose);
      if (!record) {
        throw new AppError({
          message: "Verification code not found. Please request a new one.",
          statusCode: 400,
          code: "OTP_NOT_FOUND",
        });
      }

      // Check expiration
      if (new Date() > new Date(record.expiresAt)) {
        await otpStore.deleteOTP(record.id, email, purpose);
        throw new AppError({
          message: "Verification code has expired. Please request a new one.",
          statusCode: 400,
          code: "OTP_EXPIRED",
        });
      }

      // Check attempts limit (5 max)
      if (record.attempts >= 5) {
        await otpStore.deleteOTP(record.id, email, purpose);
        throw new AppError({
          message: "Too many failed attempts. Please request a new code.",
          statusCode: 400,
          code: "OTP_MAX_ATTEMPTS_EXCEEDED",
        });
      }

      // Constant-time comparison of SHA-256 hashes
      const inputHash = this.hashOTP(otp.trim());
      const isMatch = crypto.timingSafeEqual(
        Buffer.from(record.otpHash, "hex"),
        Buffer.from(inputHash, "hex")
      );

      if (!isMatch) {
        const currentAttempts = await otpStore.incrementAttempts(record.id, email, purpose);
        if (currentAttempts >= 5) {
          await otpStore.deleteOTP(record.id, email, purpose);
          throw new AppError({
            message: "Too many failed attempts. Please request a new code.",
            statusCode: 400,
            code: "OTP_MAX_ATTEMPTS_EXCEEDED",
          });
        }

        throw new AppError({
          message: `Invalid verification code. You have ${5 - currentAttempts} attempts remaining.`,
          statusCode: 400,
          code: "OTP_INVALID",
        });
      }

      // Success: delete OTP immediately (single-use)
      await otpStore.deleteOTP(record.id, email, purpose);
      return true;
    } finally {
      await lockService.releaseLock(lockKey, lockToken);
    }
  }
}

export const otpService = new OTPService();
export type { OTPService };
