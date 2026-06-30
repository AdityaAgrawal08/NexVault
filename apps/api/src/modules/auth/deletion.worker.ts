import { db } from "../../core/database/postgres";
import { emailService } from "../email/email.service";
import { EmailType } from "../email/email.types";

class DeletionWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private active = false;

  public start(intervalMs = 10 * 60 * 1000) { // Every 10 minutes by default
    if (this.active) return;
    this.active = true;

    this.intervalId = setInterval(() => {
      this.processExpiredDeletions().catch((err) => {
        console.error("[DeletionWorker] Error processing expired deletions:", err);
      });
    }, intervalMs);

    console.log("[DeletionWorker] Started background account deletion worker.");
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.active = false;
    console.log("[DeletionWorker] Stopped background account deletion worker.");
  }

  private async processExpiredDeletions(): Promise<void> {
    try {
      // Find all users scheduled for deletion in the past
      const { rows } = await db.query(
        `
          SELECT id, email, username
          FROM users
          WHERE deletion_scheduled_for IS NOT NULL
            AND deletion_scheduled_for <= NOW()
        `
      );

      for (const user of rows) {
        const client = await db.connect();
        try {
          await client.query("BEGIN");

          // 1. Delete refresh tokens
          await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [user.id]);
          // 2. Delete audit logs
          await client.query("DELETE FROM audit_logs WHERE user_id = $1", [user.id]);
          // 3. Delete password resets
          await client.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
          // 4. Delete the user
          await client.query("DELETE FROM users WHERE id = $1", [user.id]);

          await client.query("COMMIT");

          // 5. Send high-priority transactional email confirming permanent deletion
          await emailService.enqueue(user.email, EmailType.GENERAL_ANNOUNCEMENT, {
            title: "Account Permanently Deleted",
            content: `Hello ${user.username},\n\nThis email confirms that your NexVault account and all associated data have been permanently deleted as requested.\n\nThank you for using NexVault.`,
          });

          console.log(`[DeletionWorker] Permanently deleted user ${user.username} (${user.id})`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`[DeletionWorker] Failed to delete user ${user.id}:`, err);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error("[DeletionWorker] Error querying expired deletions:", err);
    }
  }
}

export const deletionWorker = new DeletionWorker();
export type { DeletionWorker };
