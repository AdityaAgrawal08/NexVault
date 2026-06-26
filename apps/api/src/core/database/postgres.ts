import { Pool } from "pg"; //Because every request should not create a new database connection.
import dotenv from "dotenv";
dotenv.config();

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});
