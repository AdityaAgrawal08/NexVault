import { db } from "../database/postgres";
import { redis } from "../database/redis";

class MetricsService {
  private rateLimitTriggers = 0;
  private argon2idLatencies: number[] = [];

  public incrementRateLimitTriggers() {
    this.rateLimitTriggers += 1;
  }

  public recordArgon2idLatency(durationMs: number) {
    this.argon2idLatencies.push(durationMs);
    // Keep only last 100 entries to prevent memory growth
    if (this.argon2idLatencies.length > 100) {
      this.argon2idLatencies.shift();
    }
  }

  private getAverageArgon2idLatency(): number {
    if (this.argon2idLatencies.length === 0) return 0;
    const sum = this.argon2idLatencies.reduce((a, b) => a + b, 0);
    return sum / this.argon2idLatencies.length / 1000; // Convert to seconds
  }

  public async getMetricsText(): Promise<string> {
    // 1. Fetch active sessions count from Postgres
    const { rows: sessionRows } = await db.readQuery(
      "SELECT COUNT(*) as count FROM refresh_tokens WHERE is_revoked = FALSE AND expires_at > NOW()"
    );
    const activeSessions = parseInt(sessionRows[0]?.count || "0", 10);

    // 2. Fetch email queue size
    let emailQueueSize = 0;
    if (redis) {
      const priorities = ["CRITICAL", "HIGH", "NORMAL", "BULK"];
      for (const priority of priorities) {
        emailQueueSize += await redis.llen(`email:queue:${priority}`);
      }
    } else {
      const { rows: queueRows } = await db.readQuery(
        "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'QUEUED'"
      );
      emailQueueSize = parseInt(queueRows[0]?.count || "0", 10);
    }

    const avgArgon2Latency = this.getAverageArgon2idLatency();

    // Format in Prometheus text format
    return [
      "# HELP active_sessions_count Number of active user sessions",
      "# TYPE active_sessions_count gauge",
      `active_sessions_count ${activeSessions}`,
      "",
      "# HELP rate_limit_triggers_total Total number of rate limit triggers",
      "# TYPE rate_limit_triggers_total counter",
      `rate_limit_triggers_total ${this.rateLimitTriggers}`,
      "",
      "# HELP email_queue_size Current size of the email queue",
      "# TYPE email_queue_size gauge",
      `email_queue_size ${emailQueueSize}`,
      "",
      "# HELP argon2id_hashing_latency_seconds Average Argon2id password hashing latency in seconds",
      "# TYPE argon2id_hashing_latency_seconds gauge",
      `argon2id_hashing_latency_seconds ${avgArgon2Latency.toFixed(6)}`,
    ].join("\n");
  }
}

export const metricsService = new MetricsService();
export type { MetricsService };
