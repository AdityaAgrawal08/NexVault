import { db } from "./postgres";

export async function initializeDatabase() {
  try {
    // 1. Alter users table to add new columns for verification and 2FA
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
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

    // 3. Create the otps table for email verification
    await db.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Create the password_resets table
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Create indexes for quick lookup
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

    console.log("[Database] Initialized tables, columns, and indexes successfully.");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
    throw error;
  }
}
