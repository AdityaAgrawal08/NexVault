import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  otp: z.string(),
});

export type PasswordResetPayload = z.infer<typeof payloadSchema>;

class PasswordResetTemplate implements EmailTemplate<PasswordResetPayload> {
  public subject = "Reset your password - NexVault";

  public renderHtml(payload: PasswordResetPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedOtp = this.escapeHtml(payload.otp);

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Password Reset Request</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Hello ${escapedUsername}, we received a request to reset your password. Use the verification code (OTP) below to complete your password reset:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5; background-color: #f1f5f9; padding: 12px 24px; border-radius: 8px; display: inline-block;">
            ${escapedOtp}
          </span>
        </div>
        <p style="font-size: 14px; color: #64748b;">
          This code is valid for 15 minutes. If you did not request a password reset, please ignore this email or contact support if you have concerns.
        </p>
      </div>
    `;
  }

  public renderText(payload: PasswordResetPayload): string {
    return `Hello ${payload.username},\n\nWe received a request to reset your password. Use the verification code (OTP) below to complete your password reset:\n\n${payload.otp}\n\nThis code is valid for 15 minutes.`;
  }

  public validatePayload(payload: any): PasswordResetPayload {
    return payloadSchema.parse(payload);
  }

  private escapeHtml(text: string): string {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export const passwordResetTemplate = new PasswordResetTemplate();
