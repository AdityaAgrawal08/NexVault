import { db } from "../../core/database/postgres";
import { EmailType, EmailPriority } from "./email.types";
import { templates } from "./templates";
import { MockEmailProvider, EmailProvider } from "./email.provider";

class EmailWorker {
  private active = false;
  private intervalId: NodeJS.Timeout | null = null;
  private provider: EmailProvider = new MockEmailProvider();

  public setProvider(provider: EmailProvider) {
    this.provider = provider;
  }

  public start(pollIntervalMs = 2000) {
    if (this.active) return;
    this.active = true;

    this.intervalId = setInterval(() => {
      this.processQueue().catch((err) => {
        console.error("[EmailWorker] Error processing queue:", err);
      });
    }, pollIntervalMs);

    console.log("[EmailWorker] Started background email processing worker.");
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.active = false;
    console.log("[EmailWorker] Stopped background email processing worker.");
  }

  /**
   * Processes a single job immediately (Fast-path dispatch)
   */
  public async processJobById(jobId: string): Promise<void> {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      // Select and lock the job
      const { rows } = await client.query<any>(
        `
          SELECT * FROM email_jobs
          WHERE id = $1 AND status IN ('QUEUED', 'FAILED')
          FOR UPDATE SKIP LOCKED
        `,
        [jobId],
      );

      const job = rows[0];
      if (!job) {
        await client.query("ROLLBACK");
        return; // Already being processed or sent
      }

      await client.query(
        `
          UPDATE email_jobs
          SET status = 'PROCESSING',
              processing_started_at = NOW()
          WHERE id = $1
        `,
        [jobId],
      );
      await client.query("COMMIT");

      await this.executeJob(job);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[EmailWorker] Error in fast-path for job ${jobId}:`, err);
    } finally {
      client.release();
    }
  }

  /**
   * Main queue processing loop
   */
  private async processQueue(): Promise<void> {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Retrieve up to 10 pending jobs using SELECT FOR UPDATE SKIP LOCKED.
      // This is extremely safe for concurrent workers.
      // Ordered by: CRITICAL (1) -> HIGH (2) -> NORMAL (3) -> BULK (4)
      const { rows } = await client.query<any>(
        `
          SELECT * FROM email_jobs
          WHERE status = 'QUEUED'
             OR (status = 'FAILED' AND retry_count < max_retries AND next_attempt_at <= NOW())
          ORDER BY 
            CASE priority
              WHEN 'CRITICAL' THEN 1
              WHEN 'HIGH' THEN 2
              WHEN 'NORMAL' THEN 3
              WHEN 'BULK' THEN 4
              ELSE 5
            END,
            next_attempt_at ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `
      );

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return;
      }

      // Mark them all as processing
      const jobIds = rows.map((r: any) => r.id);
      await client.query(
        `
          UPDATE email_jobs
          SET status = 'PROCESSING',
              processing_started_at = NOW()
          WHERE id = ANY($1::uuid[])
        `,
        [jobIds]
      );

      await client.query("COMMIT");

      // Execute jobs concurrently in the background
      for (const job of rows) {
        this.executeJob(job).catch((err) => {
          console.error(`[EmailWorker] Failed executing job ${job.id}:`, err);
        });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Renders the template and sends via the provider
   */
  private async executeJob(job: any): Promise<void> {
    const template = templates[job.email_type as EmailType];
    if (!template) {
      await this.handleFailure(job, new Error(`No template found for ${job.email_type}`));
      return;
    }

    // 1. Expiration check for Critical OTPs (15 minutes)
    if (
      job.priority === EmailPriority.CRITICAL &&
      [EmailType.EMAIL_VERIFICATION, EmailType.LOGIN_OTP, EmailType.PASSWORD_RESET].includes(job.email_type)
    ) {
      const queuedTime = new Date(job.queued_at).getTime();
      const ageMs = Date.now() - queuedTime;
      if (ageMs > 15 * 60 * 1000) {
        await db.query(
          `
            UPDATE email_jobs
            SET status = 'EXPIRED',
                failed_reason = 'OTP expired before delivery.'
            WHERE id = $1
          `,
          [job.id],
        );
        console.log(`[EmailWorker] Job ${job.id} of type ${job.email_type} marked as EXPIRED.`);
        return;
      }
    }

    try {
      // 2. Render templates
      const html = template.renderHtml(job.payload);
      const text = template.renderText(job.payload);

      // 3. Send email using the provider
      await this.provider.send(job.recipient, template.subject, html, text);

      // 4. Mark as sent
      await db.query(
        `
          UPDATE email_jobs
          SET status = 'SENT',
              sent_at = NOW()
          WHERE id = $1
        `,
        [job.id],
      );
    } catch (err: any) {
      await this.handleFailure(job, err);
    }
  }

  /**
   * Handles job failure and calculates the next retry backoff
   */
  private async handleFailure(job: any, error: Error): Promise<void> {
    const newRetryCount = job.retry_count + 1;
    const isPermanent = newRetryCount >= job.max_retries;

    let nextAttemptAt = new Date();
    
    // Calculate backoff based on priority
    if (!isPermanent) {
      if (job.priority === EmailPriority.CRITICAL) {
        // Critical: retry in 5 seconds, then 15 seconds
        const delaySec = newRetryCount === 1 ? 5 : 15;
        nextAttemptAt = new Date(Date.now() + delaySec * 1000);
      } else if (job.priority === EmailPriority.HIGH || job.priority === EmailPriority.NORMAL) {
        // Normal/High: exponential backoff
        const delaySec = newRetryCount * 30;
        nextAttemptAt = new Date(Date.now() + delaySec * 1000);
      } else {
        // Bulk: longer interval
        const delaySec = newRetryCount * 5 * 60;
        nextAttemptAt = new Date(Date.now() + delaySec * 1000);
      }
    }

    await db.query(
      `
        UPDATE email_jobs
        SET status = $1,
            retry_count = $2,
            next_attempt_at = $3,
            failed_reason = $4
        WHERE id = $5
      `,
      [
        isPermanent ? "FAILED" : "QUEUED",
        newRetryCount,
        isPermanent ? null : nextAttemptAt,
        error.message || "Unknown error",
        job.id,
      ],
    );

    console.error(`[EmailWorker] Job ${job.id} failed (Attempt ${newRetryCount}/${job.max_retries}): ${error.message}`);
  }

  /**
   * Returns queue metrics for monitoring
   */
  public async getMetrics() {
    const { rows } = await db.query(`
      SELECT 
        status, 
        priority,
        COUNT(*) as count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (processing_started_at - queued_at))), 0) as avg_queue_latency_sec,
        COALESCE(AVG(EXTRACT(EPOCH FROM (sent_at - processing_started_at))), 0) as avg_send_latency_sec
      FROM email_jobs
      GROUP BY status, priority
    `);
    return rows;
  }
}

export const emailWorker = new EmailWorker();
export type { EmailWorker };
