import { db } from "./postgres";

export async function initializeDatabase() {
  try {
    // 1. Alter users table to add new columns for verification, 2FA, roles, and account lockout
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER',
      ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    `);

    // 2. Create the refresh_tokens table
    await db.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_revoked BOOLEAN DEFAULT FALSE,
        replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL
      );
    `);

    // 3. Alter refresh_tokens table to add IP and User Agent tracking
    await db.query(`
      ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL;
    `);

    // 4. Create the otps table for email verification
    await db.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Create the password_resets table
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Create ENUMs for email delivery subsystem
    await db.query(`
      DO $$ BEGIN
        CREATE TYPE email_status AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'EXPIRED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE email_priority AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'BULK');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 7. Create the email_jobs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        recipient VARCHAR(255) NOT NULL,
        email_type VARCHAR(50) NOT NULL,
        priority email_priority NOT NULL,
        payload JSONB NOT NULL,
        status email_status NOT NULL DEFAULT 'QUEUED',
        provider VARCHAR(50) NOT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        max_retries INT NOT NULL DEFAULT 3,
        next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        failed_reason TEXT,
        queued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processing_started_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE
      );
    `);

    // 8. Create the audit_logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Create indexes for quick lookup
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_email_jobs_status_priority_next ON email_jobs(status, priority, next_attempt_at);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    `);

    console.log("[Database] Initialized tables, columns, enums, and indexes successfully.");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
    throw error;
  }
}
