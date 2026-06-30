import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  subject: z.string(),
  message: z.string(),
});

export type SimpleNotificationPayload = z.infer<typeof payloadSchema>;

class SimpleNotificationTemplate implements EmailTemplate<SimpleNotificationPayload> {
  public subject = "Notification - NexVault";

  public renderHtml(payload: SimpleNotificationPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedMessage = this.escapeHtml(payload.message).replace(/\n/g, "<br />");

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">${this.escapeHtml(payload.subject)}</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          Hello ${escapedUsername},
        </p>
        <p style="font-size: 16px; color: #334155; line-height: 1.5;">
          ${escapedMessage}
        </p>
        <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
          Best regards,<br />The NexVault Security Team
        </p>
      </div>
    `;
  }

  public renderText(payload: SimpleNotificationPayload): string {
    return `Hello ${payload.username},\n\n${payload.message}\n\nBest regards,\nThe NexVault Security Team`;
  }

  public validatePayload(payload: any): SimpleNotificationPayload {
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

export const simpleNotificationTemplate = new SimpleNotificationTemplate();
