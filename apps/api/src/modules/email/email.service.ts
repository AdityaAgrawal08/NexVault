import { db } from "../../core/database/postgres";
import { EmailType, EmailPriority, EMAIL_PRIORITY_MAP } from "./email.types";
import { templates } from "./templates";
import { EmailProvider, MockEmailProvider } from "./email.provider";
import { emailWorker } from "./email.worker";

class EmailService {
  private provider: EmailProvider = new MockEmailProvider();

  public setProvider(provider: EmailProvider) {
    this.provider = provider;
  }

  public getProvider(): EmailProvider {
    return this.provider;
  }

  public async enqueue<T>(
    recipient: string,
    type: EmailType,
    payload: T,
  ): Promise<string> {
    const template = templates[type];
    if (!template) {
      throw new Error(`No template registered for email type: ${type}`);
    }

    // 1. Validate payload
    const validatedPayload = template.validatePayload(payload);

    // 2. Map type to priority
    const priority = EMAIL_PRIORITY_MAP[type] || EmailPriority.NORMAL;

    // 3. Insert into database
    const { rows } = await db.query<{ id: string }>(
      `
        INSERT INTO email_jobs (
          recipient,
          email_type,
          priority,
          payload,
          provider,
          status
        )
        VALUES ($1, $2, $3, $4, $5, 'QUEUED')
        RETURNING id
      `,
      [
        recipient,
        type,
        priority,
        JSON.stringify(validatedPayload),
        this.provider.name,
      ],
    );

    const jobId = rows[0]?.id;
    if (!jobId) {
      throw new Error("Failed to enqueue email job.");
    }

    // 4. Fast-path dispatch: if CRITICAL or HIGH, trigger the worker immediately in the background
    if (priority === EmailPriority.CRITICAL || priority === EmailPriority.HIGH) {
      // Run asynchronously in the background so it doesn't block the caller
      emailWorker.processJobById(jobId).catch((err) => {
        console.error(`[EmailService] Fast-path processing failed for job ${jobId}:`, err);
      });
    }

    return jobId;
  }

  public async broadcast(
    recipients: string[],
    type: EmailType,
    payload: any,
  ): Promise<void> {
    if (recipients.length === 0) return;

    const template = templates[type];
    if (!template) {
      throw new Error(`No template registered for email type: ${type}`);
    }

    const validatedPayload = template.validatePayload(payload);
    const priority = EMAIL_PRIORITY_MAP[type] || EmailPriority.NORMAL;
    const providerName = this.provider.name;

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const recipient of recipients) {
        await client.query(
          `
            INSERT INTO email_jobs (recipient, email_type, priority, payload, provider, status)
            VALUES ($1, $2, $3, $4, $5, 'QUEUED')
          `,
          [recipient, type, priority, JSON.stringify(validatedPayload), providerName]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export const emailService = new EmailService();
