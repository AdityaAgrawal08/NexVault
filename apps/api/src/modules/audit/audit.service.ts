import { db } from "../../core/database/postgres";

export interface AuditLogInput {
  userId?: string | null | undefined;
  action: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
  metadata?: any;
}

class AuditService {
  public async log(input: AuditLogInput): Promise<void> {
    try {
      await db.query(
        `
          INSERT INTO audit_logs (
            user_id,
            action,
            ip_address,
            user_agent,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          input.userId || null,
          input.action,
          input.ipAddress || null,
          input.userAgent || null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );
    } catch (err) {
      console.error("[AuditService] Failed to create audit log:", err);
    }
  }

  public async getLogsForUser(userId: string): Promise<any[]> {
    const { rows } = await db.query(
      `
        SELECT id, action, ip_address AS "ipAddress", user_agent AS "userAgent", metadata, created_at AS "createdAt"
        FROM audit_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [userId]
    );
    return rows;
  }

  public async getAllLogs(): Promise<any[]> {
    const { rows } = await db.query(
      `
        SELECT a.id, a.action, a.ip_address AS "ipAddress", a.user_agent AS "userAgent", a.metadata, a.created_at AS "createdAt", u.username
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT 200
      `
    );
    return rows;
  }
}

export const auditService = new AuditService();
export type { AuditService };
