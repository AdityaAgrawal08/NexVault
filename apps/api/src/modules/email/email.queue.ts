import { redis } from "../../core/database/redis";
import { db } from "../../core/database/postgres";
import { EmailPriority, EmailPriorityType, EmailStatusType } from "./email.types";

export interface EmailJob {
  id: string;
  recipient: string;
  emailType: string;
  priority: EmailPriorityType;
  payload: any;
  status: EmailStatusType;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: Date;
  failedReason?: string | null;
  queuedAt: Date;
}

export interface EmailQueue {
  enqueueJob(recipient: string, emailType: string, priority: EmailPriorityType, payload: any): Promise<string>;
  getNextJob(): Promise<EmailJob | null>;
  updateJobStatus(jobId: string, status: EmailStatusType, options?: { error?: string | null; processingStarted?: boolean; sent?: boolean }): Promise<void>;
  incrementRetry(jobId: string, nextAttemptAt: Date, error: string): Promise<void>;
  getMetrics(): Promise<any>;
}

// 1. Postgres-backed Email Queue (Current database queue with SKIP LOCKED)
class PostgresEmailQueue implements EmailQueue {
  public async enqueueJob(recipient: string, emailType: string, priority: EmailPriorityType, payload: any): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `
        INSERT INTO email_jobs (recipient, email_type, priority, payload, status, provider)
        VALUES ($1, $2, $3, $4, 'QUEUED', 'MOCK')
        RETURNING id
      `,
      [recipient, emailType, priority, JSON.stringify(payload)]
    );
    return rows[0]?.id ?? "";
  }

  public async getNextJob(): Promise<EmailJob | null> {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const { rows } = await client.query<any>(
        `
          SELECT 
            id, recipient, email_type AS "emailType", priority, payload, status, 
            retry_count AS "retryCount", max_retries AS "maxRetries", 
            next_attempt_at AS "nextAttemptAt", failed_reason AS "failedReason", 
            queued_at AS "queuedAt"
          FROM email_jobs
          WHERE status IN ('QUEUED', 'FAILED') 
            AND retry_count < max_retries
            AND next_attempt_at <= NOW()
          ORDER BY 
            CASE priority
              WHEN 'CRITICAL' THEN 1
              WHEN 'HIGH' THEN 2
              WHEN 'NORMAL' THEN 3
              WHEN 'BULK' THEN 4
            END ASC,
            next_attempt_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `
      );

      const job = rows[0];
      if (!job) {
        await client.query("COMMIT");
        return null;
      }

      await client.query(
        `UPDATE email_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = $1`,
        [job.id]
      );

      await client.query("COMMIT");

      return {
        ...job,
        nextAttemptAt: new Date(job.nextAttemptAt),
        queuedAt: new Date(job.queuedAt),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateJobStatus(
    jobId: string,
    status: EmailStatusType,
    options?: { error?: string | null; processingStarted?: boolean; sent?: boolean }
  ): Promise<void> {
    if (status === "SENT") {
      await db.query(
        `UPDATE email_jobs SET status = 'SENT', sent_at = NOW(), failed_reason = NULL WHERE id = $1`,
        [jobId]
      );
    } else {
      await db.query(
        `UPDATE email_jobs SET status = $1, failed_reason = $2 WHERE id = $3`,
        [status, options?.error || null, jobId]
      );
    }
  }

  public async incrementRetry(jobId: string, nextAttemptAt: Date, error: string): Promise<void> {
    await db.query(
      `
        UPDATE email_jobs
        SET retry_count = retry_count + 1,
            status = 'FAILED',
            next_attempt_at = $1,
            failed_reason = $2
        WHERE id = $3
      `,
      [nextAttemptAt, error, jobId]
    );
  }

  public async getMetrics(): Promise<any> {
    const { rows } = await db.query<any>(
      `
        SELECT 
          status, 
          priority,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (processing_started_at - queued_at))) as avg_latency_seconds,
          AVG(EXTRACT(EPOCH FROM (sent_at - processing_started_at))) as avg_send_time_seconds
        FROM email_jobs
        GROUP BY status, priority
      `
    );

    const metrics: any = {
      queueSize: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, BULK: 0 },
      latencies: {},
    };

    for (const row of rows) {
      const count = parseInt(row.count, 10);
      if (row.status === "QUEUED") metrics.queueSize += count;
      else if (row.status === "PROCESSING") metrics.processing += count;
      else if (row.status === "SENT") metrics.sent += count;
      else if (row.status === "FAILED") metrics.failed += count;

      metrics.byPriority[row.priority] = (metrics.byPriority[row.priority] || 0) + count;

      if (row.status === "SENT") {
        metrics.latencies[row.priority] = {
          avgQueueLatencyMs: Math.round((row.avg_latency_seconds || 0) * 1000),
          avgSendLatencyMs: Math.round((row.avg_send_time_seconds || 0) * 1000),
        };
      }
    }

    return metrics;
  }
}

// 2. Redis-backed Email Queue (High-performance list and hash queue)
class RedisEmailQueue implements EmailQueue {
  private getJobKey(jobId: string): string {
    return `email:job:${jobId}`;
  }

  private getQueueKey(priority: EmailPriorityType): string {
    return `email:queue:${priority}`;
  }

  public async enqueueJob(recipient: string, emailType: string, priority: EmailPriorityType, payload: any): Promise<string> {
    if (!redis) throw new Error("Redis is not initialized.");

    const jobId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const jobKey = this.getJobKey(jobId);
    const queueKey = this.getQueueKey(priority);

    const jobData: EmailJob = {
      id: jobId,
      recipient,
      emailType,
      priority,
      payload,
      status: "QUEUED",
      retryCount: 0,
      maxRetries: 3,
      nextAttemptAt: new Date(),
      queuedAt: new Date(),
    };

    await redis
      .multi()
      .hset(jobKey, {
        id: jobId,
        recipient,
        emailType,
        priority,
        payload: JSON.stringify(payload),
        status: "QUEUED",
        retryCount: "0",
        maxRetries: "3",
        nextAttemptAt: jobData.nextAttemptAt.toISOString(),
        queuedAt: jobData.queuedAt.toISOString(),
      })
      .lpush(queueKey, jobId)
      .exec();

    return jobId;
  }

  public async getNextJob(): Promise<EmailJob | null> {
    if (!redis) throw new Error("Redis is not initialized.");

    // Check queues in strict priority order: CRITICAL -> HIGH -> NORMAL -> BULK
    const priorities: EmailPriorityType[] = [
      EmailPriority.CRITICAL,
      EmailPriority.HIGH,
      EmailPriority.NORMAL,
      EmailPriority.BULK,
    ];
    
    for (const priority of priorities) {
      const queueKey = this.getQueueKey(priority);
      
      const jobId = await redis.rpop(queueKey);
      if (jobId) {
        const jobKey = this.getJobKey(jobId);
        const data = await redis.hgetall(jobKey);

        if (data && Object.keys(data).length > 0) {
          const nextAttempt = new Date(data["nextAttemptAt"] || Date.now());
          if (nextAttempt > new Date()) {
            await redis.lpush(queueKey, jobId);
            continue;
          }

          await redis.hset(jobKey, "status", "PROCESSING");

          return {
            id: data["id"] || "",
            recipient: data["recipient"] || "",
            emailType: data["emailType"] || "",
            priority: (data["priority"] || "NORMAL") as EmailPriorityType,
            payload: JSON.parse(data["payload"] || "{}"),
            status: "PROCESSING",
            retryCount: parseInt(data["retryCount"] || "0", 10),
            maxRetries: parseInt(data["maxRetries"] || "3", 10),
            nextAttemptAt: nextAttempt,
            failedReason: data["failedReason"] || null,
            queuedAt: new Date(data["queuedAt"] || Date.now()),
          };
        }
      }
    }

    return null;
  }

  public async updateJobStatus(
    jobId: string,
    status: EmailStatusType,
    options?: { error?: string | null; processingStarted?: boolean; sent?: boolean }
  ): Promise<void> {
    if (!redis) throw new Error("Redis is not initialized.");
    const jobKey = this.getJobKey(jobId);

    if (status === "SENT") {
      await redis.hset(jobKey, {
        status: "SENT",
        sentAt: new Date().toISOString(),
      });
      await redis.expire(jobKey, 3600);
    } else if (status === "DLQ") {
      await redis.multi()
        .hset(jobKey, {
          status: "DLQ",
          failedReason: options?.error || "",
        })
        .lpush("email:dlq", jobId)
        .exec();
    } else {
      await redis.hset(jobKey, {
        status,
        failedReason: options?.error || "",
      });
    }
  }

  public async incrementRetry(jobId: string, nextAttemptAt: Date, error: string): Promise<void> {
    if (!redis) throw new Error("Redis is not initialized.");
    const jobKey = this.getJobKey(jobId);

    const data = await redis.hgetall(jobKey);
    if (data && Object.keys(data).length > 0) {
      const retryCount = parseInt(data["retryCount"] || "0", 10) + 1;
      const priority = (data["priority"] || "NORMAL") as EmailPriorityType;

      await redis.hset(jobKey, {
        retryCount: retryCount.toString(),
        status: "FAILED",
        nextAttemptAt: nextAttemptAt.toISOString(),
        failedReason: error,
      });

      const queueKey = this.getQueueKey(priority);
      await redis.lpush(queueKey, jobId);
    }
  }

  public async getMetrics(): Promise<any> {
    if (!redis) throw new Error("Redis is not initialized.");

    const priorities: EmailPriorityType[] = [
      EmailPriority.CRITICAL,
      EmailPriority.HIGH,
      EmailPriority.NORMAL,
      EmailPriority.BULK,
    ];
    const metrics: any = {
      queueSize: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      byPriority: { CRITICAL: 0, HIGH: 0, NORMAL: 0, BULK: 0 },
    };

    for (const priority of priorities) {
      const queueKey = this.getQueueKey(priority);
      const len = await redis.llen(queueKey);
      metrics.queueSize += len;
      metrics.byPriority[priority] = len;
    }

    return metrics;
  }
}

export const emailQueue: EmailQueue = redis ? new RedisEmailQueue() : new PostgresEmailQueue();
