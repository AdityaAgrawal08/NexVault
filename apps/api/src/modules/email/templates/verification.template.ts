import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  otp: z.string(),
  subject: z.string().optional(),
});

export type VerificationPayload = z.infer<typeof payloadSchema>;

class VerificationTemplate implements EmailTemplate<VerificationPayload> {
  public subject = "Verify your email - NexVault";

  public renderHtml(payload: VerificationPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedOtp = this.escapeHtml(payload.otp);
    const displaySubject = payload.subject ? this.escapeHtml(payload.subject) : "Email Verification";

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">${displaySubject}</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Hello ${escapedUsername},
        </p>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Thank you for choosing NexVault. Use the following One-Time Password (OTP) to complete your verification:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4f46e5; background-color: #f1f5f9; padding: 12px 24px; border-radius: 8px; display: inline-block;">
            ${escapedOtp}
          </span>
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
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

export const verificationTemplate = new VerificationTemplate();
