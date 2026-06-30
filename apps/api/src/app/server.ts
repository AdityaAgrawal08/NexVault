import "dotenv/config";

import { app } from "./app";
import { initializeUsernameBloomFilter } from "../modules/auth/username-bloom-filter";
import { initializeDatabase } from "../core/database/init";
import { emailWorker } from "../modules/email/email.worker";
import { db } from "../core/database/postgres";

const port = Number(process.env.PORT);

if (!Number.isInteger(port)) {
  throw new Error("Port must be a valid integer.");
}

async function startServer() {
  await initializeDatabase();
  await initializeUsernameBloomFilter();
  
  // Start background email worker
  emailWorker.start();

  const server = app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
    
    // Stop accepting new requests
    server.close(() => {
      console.log("[Server] Express server closed.");
    });

    // Stop background email worker
    emailWorker.stop();

    // Close database connection pool
    try {
      await db.end();
      console.log("[Database] Connection pool closed.");
    } catch (err) {
      console.error("[Database] Error closing connection pool:", err);
    }

    console.log("[Server] Graceful shutdown complete. Exiting.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
