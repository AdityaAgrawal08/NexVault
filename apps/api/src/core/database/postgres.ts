import { Pool } from "pg"; //Because every request should not create a new database connection.

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});
