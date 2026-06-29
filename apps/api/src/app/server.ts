import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { initializeUsernameBloomFilter } from "../modules/auth/username-bloom-filter";
import { initializeDatabase } from "../core/database/init";

const port = Number(process.env.PORT);

if (!Number.isInteger(port)) {
  throw new Error("Port must be a valid integer.");
}

async function startServer() {
  await initializeDatabase();
  await initializeUsernameBloomFilter();

  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});


