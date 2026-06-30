import pg from "pg";

const { Pool } = pg;

const connectionString = process.env["DATABASE_URL"];
const readConnectionString = process.env["DATABASE_READ_URL"] || connectionString;

// 1. Primary Writer Pool
const writePool = new Pool({
  connectionString,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 2. Read Replica Pool (Falls back to primary if DATABASE_READ_URL is not set)
const readPool = new Pool({
  connectionString: readConnectionString,
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = {
  /**
   * Execute a query on the primary database writer (for INSERT, UPDATE, DELETE).
   */
  query: <T extends pg.QueryResultRow = any>(text: string, params?: any[]) => writePool.query<T>(text, params),
  
  /**
   * Execute a query on the read replica pool (for SELECT).
   */
  readQuery: <T extends pg.QueryResultRow = any>(text: string, params?: any[]) => readPool.query<T>(text, params),
  
  /**
   * Get a client from the primary writer pool (e.g. for transactions).
   */
  connect: () => writePool.connect(),
  
  /**
   * Close both connection pools.
   */
  end: async () => {
    await writePool.end();
    await readPool.end();
  }
};
