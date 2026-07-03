import { db } from "../../core/database/postgres";
import { emailService } from "../email/email.service";
import { EmailType } from "../email/email.types";
import fs from "fs";
import path from "path";

class DeletionWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private active = false;

  public start(intervalMs = 30 * 1000) { // Every 30 seconds
    if (this.active) return;
    this.active = true;

    this.intervalId = setInterval(() => {
      this.processCleanupJobs().catch((err) => {
        console.error("[DeletionWorker] Error processing cleanup jobs:", err);
      });
    }, intervalMs);

    console.log("[DeletionWorker] Started background user cleanup job worker.");
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.active = false;
    console.log("[DeletionWorker] Stopped background user cleanup job worker.");
  }

  private async processCleanupJobs(): Promise<void> {
    try {
      // Find jobs that are PENDING or FAILED with retry budget left
      const { rows } = await db.query(
        `
          SELECT id, user_id AS "userId", username, email, retry_count AS "retryCount", max_retries AS "maxRetries"
          FROM user_cleanup_jobs
          WHERE status = 'PENDING' OR (status = 'FAILED' AND retry_count < max_retries)
          ORDER BY created_at ASC
          LIMIT 5
        `
      );

      for (const job of rows) {
        // Mark job as PROCESSING
        await db.query(
          `
            UPDATE user_cleanup_jobs
            SET status = 'PROCESSING', updated_at = NOW()
            WHERE id = $1
          `,
          [job.id]
        );

        try {
          console.log(`[DeletionWorker] Cleaning up resources for deleted user ID ${job.userId} (${job.username})`);

          // 1. Delete physical files in uploads directory
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            for (const file of files) {
              if (file.includes(job.userId)) {
                try {
                  fs.unlinkSync(path.join(uploadsDir, file));
                  console.log(`[DeletionWorker] Deleted physical upload file: ${file}`);
                } catch (err) {
                  console.error(`[DeletionWorker] Failed to delete file ${file}:`, err);
                }
              }
            }
          }

          // 2. Perform idempotent database deletions for remaining user tables.
          const tables = ["notes", "documents", "user_preferences", "media", "analytics"];
          for (const table of tables) {
            try {
              // Check if table exists in PostgreSQL schema first to avoid transactional errors
              const checkTable = await db.query(
                `
                  SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                      AND table_name = $1
                  )
                `,
                [table]
              );
              
              if (checkTable.rows[0]?.exists) {
                await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [job.userId]);
                console.log(`[DeletionWorker] Cleaned up table '${table}' records for user ID ${job.userId}`);
              }
            } catch (err: any) {
              console.warn(`[DeletionWorker] Non-critical warning cleaning up table '${table}' for user ID ${job.userId}:`, err.message);
            }
          }

          // 3. Queue high-priority confirmation email
          await emailService.enqueue(job.email, EmailType.GENERAL_ANNOUNCEMENT, {
            title: "Account Permanently Deleted",
            content: `Hello ${job.username},\n\nThis email confirms that your NexVault account and all associated data have been permanently deleted as requested.\n\nThank you for using NexVault.`,
          });

          // Mark job as COMPLETED
          await db.query(
            `
              UPDATE user_cleanup_jobs
              SET status = 'COMPLETED', updated_at = NOW()
              WHERE id = $1
            `,
            [job.id]
          );

          console.log(`[DeletionWorker] Completed cleanup for user ID ${job.userId}`);
        } catch (err: any) {
          const newRetryCount = job.retryCount + 1;
          const newStatus = newRetryCount >= job.maxRetries ? "FAILED" : "PENDING";
          
          await db.query(
            `
              UPDATE user_cleanup_jobs
              SET status = $1, retry_count = $2, last_error = $3, updated_at = NOW()
              WHERE id = $4
            `,
            [newStatus, newRetryCount, err.message || "Unknown error", job.id]
          );

          console.error(`[DeletionWorker] Failed processing job ${job.id} for user ID ${job.userId} (Attempt ${newRetryCount}):`, err);
        }
      }
    } catch (err) {
      console.error("[DeletionWorker] Error querying cleanup jobs queue:", err);
    }
  }
}

export const deletionWorker = new DeletionWorker();
export type { DeletionWorker };
