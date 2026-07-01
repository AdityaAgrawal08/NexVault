import argon2 from "argon2";
import os from "os";
import { metricsService } from "../monitoring/metrics.service";
import { AppError } from "../../shared/errors/app-error";

// Explicitly tuned Argon2id configuration matching RFC 9106 guidelines
// for general-use password hashing, maximizing offline brute-force difficulty.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64MB memory cost
  timeCost: 3,           // 3 iterations
  parallelism: 4,        // 4 parallel threads
} as const;

class ConcurrencyLimiter {
  private activeCount = 0;
  private maxConcurrency = Math.max(1, os.cpus().length || 4); // Concurrency capped to CPU cores
  private maxQueueSize = 1000;
  private queue: (() => void)[] = [];

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      try {
        return await fn();
      } finally {
        this.activeCount--;
        this.next();
      }
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new AppError({
        message: "Server is temporarily busy. Please try again.",
        statusCode: 429,
        code: "AUTH_SERVER_BUSY",
      });
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.activeCount++;
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeCount--;
            this.next();
          });
      });
    });
  }

  private next() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency) {
      const task = this.queue.shift();
      if (task) task();
    }
  }

  public getQueueDepth(): number {
    return this.queue.length;
  }
}

export const hashingLimiter = new ConcurrencyLimiter();

export async function hashPassword(password: string): Promise<string> {
  const start = Date.now();
  const hash = await hashingLimiter.run(() => argon2.hash(password, ARGON2_OPTIONS));
  metricsService.recordArgon2idLatency(Date.now() - start);
  return hash;
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return hashingLimiter.run(() => argon2.verify(hash, password));
}

export function needsPasswordRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

// Register queue depth provider for Prometheus metrics reporting
metricsService.registerQueueDepthProvider(() => hashingLimiter.getQueueDepth());
