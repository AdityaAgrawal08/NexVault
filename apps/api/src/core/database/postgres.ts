import pg from "pg";
import { metricsService } from "../monitoring/metrics.service";

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
  query: async <T extends pg.QueryResultRow = any>(text: string, params?: any[]) => {
    const start = Date.now();
    try {
      return await writePool.query<T>(text, params);
    } finally {
      metricsService.recordDbQuery(Date.now() - start);
    }
  },
  
  /**
   * Execute a query on the read replica pool (for SELECT).
   */
  readQuery: async <T extends pg.QueryResultRow = any>(text: string, params?: any[]) => {
    const start = Date.now();
    try {
      return await readPool.query<T>(text, params);
    } finally {
      metricsService.recordDbQuery(Date.now() - start);
    }
  },
  
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
