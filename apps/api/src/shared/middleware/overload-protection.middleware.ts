import { Request, Response, NextFunction } from "express";
import { metricsService } from "../../core/monitoring/metrics.service";
import { AppError } from "../errors/app-error";

// Configuration (configurable via env variables)
const MAX_CONCURRENT = parseInt(process.env["OVERLOAD_MAX_CONCURRENT"] || "20", 10);
const RECOVERY_CONCURRENT = parseInt(process.env["OVERLOAD_RECOVERY_CONCURRENT"] || "12", 10);

const MAX_MEM_MB = parseInt(process.env["OVERLOAD_MEM_MB"] || "400", 10);
const RECOVERY_MEM_MB = parseInt(process.env["OVERLOAD_RECOVERY_MEM_MB"] || "320", 10);

const MAX_LAG_MS = parseInt(process.env["OVERLOAD_LAG_MS"] || "150", 10);
const RECOVERY_LAG_MS = parseInt(process.env["OVERLOAD_RECOVERY_LAG_MS"] || "50", 10);

// Global States
type OverloadState = "NORMAL" | "WARNING" | "OVERLOADED";
let currentState: OverloadState = "NORMAL";

let activeRequests = 0;
let eventLoopLag = 0;
let lastLagCheck = Date.now();

// Start event loop lag monitor
function monitorEventLoop() {
  const check = () => {
    const now = Date.now();
    const delay = now - lastLagCheck - 1000; // Scheduled for 1000ms delay
    eventLoopLag = Math.max(0, delay);
    lastLagCheck = now;
    setTimeout(check, 1000).unref();
  };
  setTimeout(check, 1000).unref();
}
monitorEventLoop();

// Request priorities definition
enum RequestPriority {
  HEALTH = 1,
  AUTH = 2,
  APP_AUTHENTICATED = 3,
  NON_ESSENTIAL = 4,
}

// Classify request priority based on path and authorization headers
function getRequestPriority(req: Request): RequestPriority {
  const url = req.originalUrl || req.url || "";
  
  // 1. Health Checks
  if (url === "/health" || url === "/api/health" || url === "/metrics" || url === "/api/metrics") {
    return RequestPriority.HEALTH;
  }

  // 2. Authentication Flow
  if (
    url.startsWith("/api/login") || 
    url.startsWith("/api/register") || 
    url.startsWith("/api/verify-otp") || 
    url.startsWith("/api/send-otp") || 
    url.startsWith("/api/verify-email") || 
    url.startsWith("/api/oauth/login") || 
    url.startsWith("/api/reauth")
  ) {
    return RequestPriority.AUTH;
  }

  // 3. Authenticated App requests
  const hasAuthToken = req.headers["authorization"]?.startsWith("Bearer ");
  const hasAuthCookie = req.cookies && req.cookies["refreshToken"];
  if (hasAuthToken || hasAuthCookie) {
    return RequestPriority.APP_AUTHENTICATED;
  }

  // 4. Everything else (Non-essential/Guest/Static)
  return RequestPriority.NON_ESSENTIAL;
}

// Evaluate system health and update state using Hysteresis
function evaluateSystemHealth(): { state: OverloadState; reason: string } {
  const memoryRSS = process.memoryUsage().rss / (1024 * 1024); // RSS in MB
  
  let targetState: OverloadState = "NORMAL";
  let reason = "";

  // Check critical thresholds to enter OVERLOADED
  if (activeRequests > MAX_CONCURRENT) {
    targetState = "OVERLOADED";
    reason = `Active requests limit exceeded (${activeRequests}/${MAX_CONCURRENT})`;
  } else if (memoryRSS > MAX_MEM_MB) {
    targetState = "OVERLOADED";
    reason = `Memory limit exceeded (${memoryRSS.toFixed(1)}MB/${MAX_MEM_MB}MB)`;
  } else if (eventLoopLag > MAX_LAG_MS) {
    targetState = "OVERLOADED";
    reason = `Event loop lag limit exceeded (${eventLoopLag}ms/${MAX_LAG_MS}ms)`;
  }
  // Check warning thresholds if not overloaded
  else if (currentState !== "OVERLOADED") {
    if (activeRequests > RECOVERY_CONCURRENT) {
      targetState = "WARNING";
      reason = `Active requests high (${activeRequests}/${RECOVERY_CONCURRENT})`;
    } else if (memoryRSS > RECOVERY_MEM_MB) {
      targetState = "WARNING";
      reason = `Memory usage high (${memoryRSS.toFixed(1)}MB/${RECOVERY_MEM_MB}MB)`;
    } else if (eventLoopLag > RECOVERY_LAG_MS) {
      targetState = "WARNING";
      reason = `Event loop lag high (${eventLoopLag}ms/${RECOVERY_LAG_MS}ms)`;
    }
  }
  // Hysteresis: Maintain OVERLOADED until all metrics fall below recovery thresholds
  else if (currentState === "OVERLOADED") {
    const isRecovered = 
      activeRequests < RECOVERY_CONCURRENT && 
      memoryRSS < RECOVERY_MEM_MB && 
      eventLoopLag < RECOVERY_LAG_MS;
      
    if (!isRecovered) {
      targetState = "OVERLOADED";
      reason = `Still recovering from overload. Memory: ${memoryRSS.toFixed(1)}MB, Lag: ${eventLoopLag}ms, Requests: ${activeRequests}`;
    }
  }

  return { state: targetState, reason };
}

export function overloadProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Track concurrent request stats
  activeRequests++;
  metricsService.setConcurrentRequests(activeRequests);

  // Monitor cleanup on request end
  const cleanup = () => {
    activeRequests--;
    metricsService.setConcurrentRequests(activeRequests);
    res.removeListener("finish", cleanup);
    res.removeListener("close", cleanup);
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);

  // Evaluate state
  const { state, reason } = evaluateSystemHealth();
  
  if (state !== currentState) {
    console.log(`[OverloadProtection] Transitioned from ${currentState} to ${state}. Reason: ${reason || "Normal state recovery"}`);
    currentState = state;
  }

  const priority = getRequestPriority(req);

  // Enforcement decision based on priority and state
  let reject = false;
  if (currentState === "OVERLOADED") {
    // Overloaded: reject everything except Health checks
    if (priority !== RequestPriority.HEALTH) {
      reject = true;
    }
  } else if (currentState === "WARNING") {
    // Warning: reject non-essential requests
    if (priority === RequestPriority.NON_ESSENTIAL) {
      reject = true;
    }
  }

  if (reject) {
    metricsService.incrementOverloadRejections();
    
    // Log the rejection
    console.warn(`[OverloadProtection] Rejected request to '${req.originalUrl || req.url}' (Priority: ${priority}, State: ${currentState}). Reason: ${reason}`);

    res.setHeader("Retry-After", 10); // Prompt client retry in 10s
    return next(
      new AppError({
        message: "The server is currently experiencing high traffic and cannot process your request at the moment. Please try again in a few moments.",
        statusCode: 503,
        code: "SERVER_OVERLOADED",
      })
    );
  }

  next();
}

export function getOverloadStateInfo() {
  const memoryRSS = process.memoryUsage().rss / (1024 * 1024);
  return {
    state: currentState,
    activeRequests,
    eventLoopLag,
    memoryRSS,
  };
}
