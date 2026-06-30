import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  otp: z.string().length(6),
});

export type VerificationPayload = z.infer<typeof payloadSchema>;

class VerificationTemplate implements EmailTemplate<VerificationPayload> {
  public subject = "Verify your email - NexVault";

  public renderHtml(payload: VerificationPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedOtp = this.escapeHtml(payload.otp);

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Welcome to NexVault, ${escapedUsername}!</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Thank you for registering. Please use the following One-Time Password (OTP) to verify your email address and activate your account:
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1e293b;">${escapedOtp}</span>
        </div>
        <p style="font-size: 14px; color: #64748b;">
          This OTP is valid for 15 minutes. If you did not request this, please ignore this email.
        </p>
      </div>
    `;
  }

  public renderText(payload: VerificationPayload): string {
    return `Welcome to NexVault, ${payload.username}!\n\nYour One-Time Password (OTP) for email verification is: ${payload.otp}\n\nThis OTP is valid for 15 minutes.`;
  }

  public validatePayload(payload: any): VerificationPayload {
    return payloadSchema.parse(payload);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export const verificationTemplate = new VerificationTemplate();
