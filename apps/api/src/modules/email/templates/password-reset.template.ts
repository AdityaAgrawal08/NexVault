import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  resetLink: z.string().url(),
});

export type PasswordResetPayload = z.infer<typeof payloadSchema>;

class PasswordResetTemplate implements EmailTemplate<PasswordResetPayload> {
  public subject = "Reset your password - NexVault";

  public renderHtml(payload: PasswordResetPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedLink = this.escapeHtml(payload.resetLink);

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Password Reset Request</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Hello ${escapedUsername}, we received a request to reset your password. Click the button below to choose a new password:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${escapedLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="font-size: 14px; color: #64748b;">
          This link is valid for 1 hour. If you did not request a password reset, please ignore this email or contact support if you have concerns.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; word-break: break-all;">
          If the button doesn't work, copy and paste this link into your browser:<br />
          <a href="${escapedLink}" style="color: #4f46e5;">${escapedLink}</a>
        </p>
      </div>
    `;
  }

  public renderText(payload: PasswordResetPayload): string {
    return `Hello ${payload.username},\n\nWe received a request to reset your password. Use the link below to choose a new password:\n\n${payload.resetLink}\n\nThis link is valid for 1 hour.`;
  }

  public validatePayload(payload: any): PasswordResetPayload {
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

export const passwordResetTemplate = new PasswordResetTemplate();
