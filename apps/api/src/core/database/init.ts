import { db } from "./postgres";

export async function initializeDatabase() {
  try {
    // 1. Create the refresh_tokens table
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

    // 2. Create indexes for quick lookup
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);

    console.log("[Database] Initialized tables and indexes successfully.");
  } catch (error) {
    console.error("[Database] Initialization failed:", error);
    throw error;
  }
}
