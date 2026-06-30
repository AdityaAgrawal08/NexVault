import { z } from "zod";
import { EmailTemplate } from "../email.types";

const payloadSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export type AnnouncementPayload = z.infer<typeof payloadSchema>;

class AnnouncementTemplate implements EmailTemplate<AnnouncementPayload> {
  public subject = "New Announcement - NexVault";

  public renderHtml(payload: AnnouncementPayload): string {
    const escapedTitle = this.escapeHtml(payload.title);
    const escapedContent = this.escapeHtml(payload.content).replace(/\n/g, "<br />");

    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">${escapedTitle}</h2>
        <p style="font-size: 16px; color: #334155; line-height: 1.6;">
          ${escapedContent}
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">
          You received this email because you are registered at NexVault. To unsubscribe, manage your notifications in your profile.
        </p>
      </div>
    `;
  }

  public renderText(payload: AnnouncementPayload): string {
    return `${payload.title}\n\n${payload.content}`;
  }

  public validatePayload(payload: any): AnnouncementPayload {
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

export const announcementTemplate = new AnnouncementTemplate();
