import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  username: z.string(),
  alertMessage: z.string(),
  ipAddress: z.string(),
});

export type SecurityAlertPayload = z.infer<typeof payloadSchema>;

class SecurityAlertTemplate implements EmailTemplate<SecurityAlertPayload> {
  public subject = "Security Alert - NexVault";

  public renderHtml(payload: SecurityAlertPayload): string {
    const escapedUsername = this.escapeHtml(payload.username);
    const escapedAlert = this.escapeHtml(payload.alertMessage);
    const escapedIp = this.escapeHtml(payload.ipAddress);

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fee2e2; border-radius: 8px; background-color: #fff5f5;">
        <h2 style="color: #dc2626; margin-bottom: 20px;">Security Alert</h2>
        <p style="font-size: 16px; color: #7f1d1d; line-height: 1.5; font-weight: bold;">
          Hello ${escapedUsername}, we detected critical activity on your account.
        </p>
        <div style="background-color: #ffffff; border: 1px solid #fee2e2; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #451a03;"><strong>Activity:</strong> ${escapedAlert}</p>
          <p style="margin: 0; font-size: 14px; color: #451a03;"><strong>IP Address:</strong> ${escapedIp}</p>
        </div>
        <p style="font-size: 14px; color: #7f1d1d;">
          If you did not perform this action, please reset your password immediately and contact support.
        </p>
      </div>
    `;
  }

  public renderText(payload: SecurityAlertPayload): string {
    return `Security Alert!\n\nHello ${payload.username},\nWe detected critical activity on your account:\n\nActivity: ${payload.alertMessage}\nIP Address: ${payload.ipAddress}\n\nIf you did not perform this action, please reset your password immediately.`;
  }

  public validatePayload(payload: any): SecurityAlertPayload {
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

export const securityAlertTemplate = new SecurityAlertTemplate();
