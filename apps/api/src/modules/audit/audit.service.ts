import { db } from "../../core/database/postgres";

export interface AuditLogInput {
  userId?: string | null | undefined;
  action: string;
  ipAddress?: string | null | undefined;
  userAgent?: string | null | undefined;
  metadata?: any;
}

class AuditService {
  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const clean = phone.trim();
    if (clean.length <= 4) return "****";
    return "*".repeat(clean.length - 4) + clean.slice(-4);
  }

  private maskSensitiveData(metadata: any): any {
    if (!metadata || typeof metadata !== "object") return metadata;

    const copy = { ...metadata };
    
    // List of keys to check for masking
    const emailKeys = ["email", "emailaddress", "email_address", "identifier"];
    const phoneKeys = ["phone", "phonenumber", "phone_number", "mobile"];

    for (const key of Object.keys(copy)) {
      const val = copy[key];
      if (typeof val === "string") {
        const lowerKey = key.toLowerCase();
        if (emailKeys.includes(lowerKey) && val.includes("@")) {
          copy[key] = this.maskEmail(val);
        } else if (phoneKeys.includes(lowerKey)) {
          copy[key] = this.maskPhone(val);
        }
      } else if (typeof val === "object" && val !== null) {
        copy[key] = this.maskSensitiveData(val);
      }
    }

    return copy;
  }

  public async log(input: AuditLogInput): Promise<void> {
    try {
      const maskedMetadata = input.metadata ? this.maskSensitiveData(input.metadata) : null;

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
          maskedMetadata ? JSON.stringify(maskedMetadata) : null,
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
