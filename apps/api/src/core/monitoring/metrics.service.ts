import { db } from "../database/postgres";
import { redis } from "../database/redis";

class MetricsService {
  private rateLimitTriggers = 0;
  private argon2idLatencies: number[] = [];
  
  // New HTTP Latency & Throughput metrics
  private totalRequests = 0;
  private totalErrors = 0;
  private requestLatencies: number[] = [];
  
  // New Database latency metrics
  private dbQueryLatencies: number[] = [];
  
  // New Cache hit ratio metrics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Provider callback for Hashing Queue Depth (prevents circular dependency)
  private queueDepthProvider: (() => number) | null = null;

  // Overload and Concurrency Metrics
  private concurrentRequests = 0;
  private peakConcurrentRequests = 0;
  private overloadRejections = 0;

  public setConcurrentRequests(count: number) {
    this.concurrentRequests = count;
    if (count > this.peakConcurrentRequests) {
      this.peakConcurrentRequests = count;
    }
  }

  public incrementOverloadRejections() {
    this.overloadRejections += 1;
  }

  public registerQueueDepthProvider(provider: () => number) {
    this.queueDepthProvider = provider;
  }

  public incrementRateLimitTriggers() {
    this.rateLimitTriggers += 1;
  }

  public recordArgon2idLatency(durationMs: number) {
    this.argon2idLatencies.push(durationMs);
    if (this.argon2idLatencies.length > 100) {
      this.argon2idLatencies.shift();
    }
  }

  public recordRequest(durationMs: number, hasError: boolean) {
    this.totalRequests += 1;
    if (hasError) {
      this.totalErrors += 1;
    }
    this.requestLatencies.push(durationMs);
    if (this.requestLatencies.length > 1000) {
      this.requestLatencies.shift();
    }
  }

  public recordDbQuery(durationMs: number) {
    this.dbQueryLatencies.push(durationMs);
    if (this.dbQueryLatencies.length > 1000) {
      this.dbQueryLatencies.shift();
    }
  }

  public recordCacheHit() {
    this.cacheHits += 1;
  }

  public recordCacheMiss() {
    this.cacheMisses += 1;
  }

  public incrementErrors() {
    this.totalErrors += 1;
  }

  private getAverageLatency(list: number[]): number {
    if (list.length === 0) return 0;
    const sum = list.reduce((a, b) => a + b, 0);
    return sum / list.length / 1000; // Convert to seconds
  }

  private getPercentileLatency(list: number[], percentile: number): number {
    if (list.length === 0) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    const val = sorted[index] || 0;
    return val / 1000; // Convert to seconds
  }

  private getCacheHitRatio(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 1.0;
    return this.cacheHits / total;
  }

  public async getMetricsText(): Promise<string> {
    // 1. Fetch active sessions count from Postgres
    let activeSessions = 0;
    try {
      const { rows: sessionRows } = await db.readQuery(
        "SELECT COUNT(*) as count FROM refresh_tokens WHERE is_revoked = FALSE AND expires_at > NOW()"
      );
      activeSessions = parseInt(sessionRows[0]?.count || "0", 10);
    } catch (e) {
      // Graceful error fallback
    }

    // 2. Fetch email queue size
    let emailQueueSize = 0;
    try {
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
    } catch (e) {
      // Graceful error fallback
    }

    const avgArgon2Latency = this.getAverageLatency(this.argon2idLatencies);
    const avgRequestLatency = this.getAverageLatency(this.requestLatencies);
    const p95RequestLatency = this.getPercentileLatency(this.requestLatencies, 0.95);
    const p99RequestLatency = this.getPercentileLatency(this.requestLatencies, 0.99);
    const avgDbLatency = this.getAverageLatency(this.dbQueryLatencies);
    const cacheHitRatio = this.getCacheHitRatio();
    const queueDepth = this.queueDepthProvider ? this.queueDepthProvider() : 0;

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
      "",
      "# HELP requests_total Total number of processed HTTP requests",
      "# TYPE requests_total counter",
      `requests_total ${this.totalRequests}`,
      "",
      "# HELP requests_errors_total Total number of failed HTTP requests",
      "# TYPE requests_errors_total counter",
      `requests_errors_total ${this.totalErrors}`,
      "",
      "# HELP request_latency_seconds_avg Average HTTP request latency in seconds",
      "# TYPE request_latency_seconds_avg gauge",
      `request_latency_seconds_avg ${avgRequestLatency.toFixed(6)}`,
      "",
      "# HELP request_latency_seconds_p95 P95 HTTP request latency in seconds",
      "# TYPE request_latency_seconds_p95 gauge",
      `request_latency_seconds_p95 ${p95RequestLatency.toFixed(6)}`,
      "",
      "# HELP request_latency_seconds_p99 P99 HTTP request latency in seconds",
      "# TYPE request_latency_seconds_p99 gauge",
      `request_latency_seconds_p99 ${p99RequestLatency.toFixed(6)}`,
      "",
      "# HELP hashing_queue_depth Depth of the password hashing backpressure queue",
      "# TYPE hashing_queue_depth gauge",
      `hashing_queue_depth ${queueDepth}`,
      "",
      "# HELP db_query_latency_seconds_avg Average database query latency in seconds",
      "# TYPE db_query_latency_seconds_avg gauge",
      `db_query_latency_seconds_avg ${avgDbLatency.toFixed(6)}`,
      "",
      "# HELP cache_hit_ratio The ratio of cache hits to total cache check requests",
      "# TYPE cache_hit_ratio gauge",
      `cache_hit_ratio ${cacheHitRatio.toFixed(4)}`,
      "",
      "# HELP concurrent_requests_current Number of currently active concurrent HTTP requests",
      "# TYPE concurrent_requests_current gauge",
      `concurrent_requests_current ${this.concurrentRequests}`,
      "",
      "# HELP concurrent_requests_peak Peak number of concurrent HTTP requests observed",
      "# TYPE concurrent_requests_peak gauge",
      `concurrent_requests_peak ${this.peakConcurrentRequests}`,
      "",
      "# HELP requests_rejected_overload_total Total number of requests rejected due to server overload",
      "# TYPE requests_rejected_overload_total counter",
      `requests_rejected_overload_total ${this.overloadRejections}`
    ].join("\n");
  }
}

export const metricsService = new MetricsService();
export type { MetricsService };
