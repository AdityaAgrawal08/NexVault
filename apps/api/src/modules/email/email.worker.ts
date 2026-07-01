import { EmailType, EmailPriority, EmailPriorityType } from "./email.types";
import { templates } from "./templates";
import { MockEmailProvider, ResendEmailProvider, EmailProvider } from "./email.provider";
import { emailQueue, EmailJob } from "./email.queue";

class EmailWorker {
  private active = false;
  private intervalId: NodeJS.Timeout | null = null;
  private provider: EmailProvider = new MockEmailProvider();

  constructor() {
    this.initializeProvider();
  }

  private initializeProvider() {
    const providerType = process.env["EMAIL_PROVIDER"] || "mock";
    const apiKey = process.env["RESEND_API_KEY"];
    const from = process.env["EMAIL_FROM"] || "onboarding@resend.dev";

    if (providerType === "resend" && apiKey) {
      this.provider = new ResendEmailProvider(apiKey, from);
      console.log(`[EmailWorker] Initialized Resend email provider (From: ${from})`);
    } else {
      this.provider = new MockEmailProvider();
      console.log(`[EmailWorker] Initialized Mock email provider (logs to console)`);
    }
  }

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
    // Note: Fast-path processing is simplified to just let the worker pick it up,
    // or we can manually fetch the job from the queue and run it.
    // For Redis, because getNextJob is O(1) and instant, the poller will pick it up
    // within milliseconds. So we can just let it poll, or manually fetch if needed.
    // Let's implement a simple direct execution if we can find it.
    // Since getNextJob pops a job, we can just run processQueue() immediately!
    await this.processQueue();
  }

  /**
   * Main queue processing loop
   */
  private async processQueue(): Promise<void> {
    try {
      // Fetch the next job from the pluggable queue
      const job = await emailQueue.getNextJob();
      if (!job) return;

      // Execute the job in the background
      this.executeJob(job).catch((err) => {
        console.error(`[EmailWorker] Failed executing job ${job.id}:`, err);
      });
    } catch (err) {
      console.error("[EmailWorker] Error fetching next job:", err);
    }
  }

  /**
   * Renders the template and sends via the provider
   */
  private async executeJob(job: EmailJob): Promise<void> {
    const template = templates[job.emailType as EmailType];
    if (!template) {
      await this.handleFailure(job, new Error(`No template found for ${job.emailType}`));
      return;
    }

    // 1. Expiration check for Critical OTPs (15 minutes)
    if (
      job.priority === EmailPriority.CRITICAL &&
      [EmailType.EMAIL_VERIFICATION, EmailType.LOGIN_OTP, EmailType.PASSWORD_RESET].includes(job.emailType as any)
    ) {
      const queuedTime = new Date(job.queuedAt).getTime();
      const ageMs = Date.now() - queuedTime;
      if (ageMs > 15 * 60 * 1000) {
        await emailQueue.updateJobStatus(job.id, "EXPIRED", {
          error: "OTP expired before delivery.",
        });
        console.log(`[EmailWorker] Job ${job.id} of type ${job.emailType} marked as EXPIRED.`);
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
      await emailQueue.updateJobStatus(job.id, "SENT");
    } catch (err: any) {
      await this.handleFailure(job, err);
    }
  }

  /**
   * Handles job failure and calculates the next retry backoff
   */
  private async handleFailure(job: EmailJob, error: Error): Promise<void> {
    const newRetryCount = job.retryCount + 1;
    const isPermanent = newRetryCount >= job.maxRetries;

    if (isPermanent) {
      await emailQueue.updateJobStatus(job.id, "DLQ", {
        error: error.message || "Unknown error",
      });
      console.error(`[EmailWorker] Job ${job.id} permanently failed and moved to DLQ: ${error.message}`);
      return;
    }

    let nextAttemptAt = new Date();
    
    // Calculate backoff based on priority
    if (job.priority === EmailPriority.CRITICAL) {
      const delaySec = newRetryCount === 1 ? 5 : 15;
      nextAttemptAt = new Date(Date.now() + delaySec * 1000);
    } else if (job.priority === EmailPriority.HIGH || job.priority === EmailPriority.NORMAL) {
      const delaySec = newRetryCount * 30;
      nextAttemptAt = new Date(Date.now() + delaySec * 1000);
    } else {
      const delaySec = newRetryCount * 5 * 60;
      nextAttemptAt = new Date(Date.now() + delaySec * 1000);
    }

    await emailQueue.incrementRetry(job.id, nextAttemptAt, error.message || "Unknown error");
    console.warn(`[EmailWorker] Job ${job.id} failed (Attempt ${newRetryCount}/${job.maxRetries}). Retrying at ${nextAttemptAt.toISOString()}`);
  }

  /**
   * Returns queue metrics for monitoring
   */
  public async getMetrics() {
    return emailQueue.getMetrics();
  }
}

export const emailWorker = new EmailWorker();
export type { EmailWorker };
