import { emailQueue } from "./email.queue";
import { emailWorker } from "./email.worker";
import { EmailType, EmailPriority, EmailPriorityType } from "./email.types";

class EmailService {
  // Map email type to priority
  private getPriorityForType(type: EmailType): EmailPriorityType {
    switch (type) {
      case EmailType.EMAIL_VERIFICATION:
      case EmailType.LOGIN_OTP:
      case EmailType.PASSWORD_RESET:
        return EmailPriority.CRITICAL;

      case EmailType.PASSWORD_CHANGED:
      case EmailType.SECURITY_ALERT:
      case EmailType.ACCOUNT_LOCKED:
        return EmailPriority.HIGH;

      case EmailType.WELCOME:
        return EmailPriority.NORMAL;

      case EmailType.GENERAL_ANNOUNCEMENT:
        return EmailPriority.BULK;

      default:
        return EmailPriority.NORMAL;
    }
  }

  public async enqueue(
    recipient: string,
    emailType: EmailType,
    payload: any,
  ): Promise<string> {
    const priority = this.getPriorityForType(emailType);

    // Enqueue via pluggable queue (Redis or Postgres)
    const jobId = await emailQueue.enqueueJob(recipient, emailType, priority, payload);

    // Fast-path: if critical/high priority, trigger worker immediately in background
    if (priority === EmailPriority.CRITICAL || priority === EmailPriority.HIGH) {
      emailWorker.processJobById(jobId).catch((err) => {
        console.error(`[EmailService] Fast-path worker error for job ${jobId}:`, err);
      });
    }

    return jobId;
  }
}

export const emailService = new EmailService();
