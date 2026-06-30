import { db } from "../../core/database/postgres";

export interface OTPRecord {
  id: string;
  email: string;
  otpHash: string;
  purpose: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

class OTPRepository {
  public async createOTP(
    email: string,
    purpose: string,
    otpHash: string,
    expiresAt: Date,
  ): Promise<void> {
    // Delete existing OTPs for the same email and purpose first
    await this.deleteOTPsForEmail(email, purpose);

    await db.query(
      `
        INSERT INTO otps (email, purpose, otp_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [email, purpose, otpHash, expiresAt],
    );
  }

  public async findLatestOTP(
    email: string,
    purpose: string,
  ): Promise<OTPRecord | null> {
    const { rows } = await db.query<any>(
      `
        SELECT 
          id, 
          email, 
          otp_hash AS "otpHash", 
          purpose, 
          attempts, 
          expires_at AS "expiresAt", 
          created_at AS "createdAt"
        FROM otps
        WHERE email = $1 AND purpose = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [email, purpose],
    );
    return rows[0] || null;
  }

  public async incrementAttempts(otpId: string): Promise<number> {
    const { rows } = await db.query<{ attempts: number }>(
      `
        UPDATE otps
        SET attempts = attempts + 1
        WHERE id = $1
        RETURNING attempts
      `,
      [otpId],
    );
    return rows[0]?.attempts ?? 0;
  }

  public async deleteOTP(otpId: string): Promise<void> {
    await db.query(
      `
        DELETE FROM otps
        WHERE id = $1
      `,
      [otpId],
    );
  }

  public async deleteOTPsForEmail(email: string, purpose: string): Promise<void> {
    await db.query(
      `
        DELETE FROM otps
        WHERE email = $1 AND purpose = $2
      `,
      [email, purpose],
    );
  }
}

export const otpRepository = new OTPRepository();
export type { OTPRepository };
