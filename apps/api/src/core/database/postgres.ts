import { Pool } from "pg"; //Because every request should not create a new database connection.
import dotenv from "dotenv";
// process.env contains:
// {
//  DATABASE_URL: "...",
//  PORT: "...",
//  JWT_SECRET: "..."
// }
dotenv.config();

export const db = new Pool({ //pool manages connections automatically. acquires an available connection, executes the query, and returns the connection to the pool for reuse. scales efficiently under concurrent load
  connectionString: process.env.DATABASE_URL,
});
