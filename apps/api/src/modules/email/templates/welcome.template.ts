import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
});

export type WelcomePayload = z.infer<typeof payloadSchema>;

class WelcomeTemplate implements EmailTemplate<WelcomePayload> {
  public subject = "Welcome to NexVault!";

  public renderHtml(payload: WelcomePayload): string {
    const escapedUsername = this.escapeHtml(payload.username);

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Welcome to NexVault, ${escapedUsername}!</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          We are thrilled to have you join us. NexVault is built to provide you with the most secure, state-of-the-art authentication and session vault.
        </p>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Explore your dashboard and set up advanced features like Multi-Factor Authentication (MFA) to ensure your account remains fully protected.
        </p>
        <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
          Best regards,<br />The NexVault Security Team
        </p>
      </div>
    `;
  }

  public renderText(payload: WelcomePayload): string {
    return `Welcome to NexVault, ${payload.username}!\n\nWe are thrilled to have you join us. NexVault is built to provide you with the most secure, state-of-the-art authentication and session vault.\n\nBest regards,\nThe NexVault Security Team`;
  }

  public validatePayload(payload: any): WelcomePayload {
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

export const welcomeTemplate = new WelcomeTemplate();
