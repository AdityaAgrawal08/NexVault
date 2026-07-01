# Advanced Production-Grade Authentication & Security System

A high-performance, robust, and secure authentication system built as a monorepo containing a React (Vite + TypeScript) frontend and an Express (TypeScript) API. Designed to scale to millions of requests with sub-millisecond latencies using a polyglot persistence architecture and robust rate-limiting controls.

---

## Key Features & Architecture

### 1. High-Throughput Centralized Rate Limiting (10k RPS Target)
- **Redis Lua Script Token Bucket**: Replaced resource-heavy sliding window logs (using Redis sorted sets) with a highly optimized Token Bucket algorithm executed via an atomic Redis Lua script in exactly **one round-trip**. Memory and CPU usage are scaled down to \(O(1)\).
- **Specialized Endpoint Policies**: Rate limiting is tailored to endpoint sensitivity instead of using a single global limit:
  - `auth`: Burst capacity 15 per minute (Login, Register, Recover, OAuth).
  - `otp`: Burst capacity 3 per minute (OTP generation/dispatch).
  - `reset`: Burst capacity 5 per minute (Password reset requests).
  - `api`: Burst capacity 100 per minute (Standard authenticated API requests).
  - `global`: Burst capacity 200 per minute (All generic page loads and static assets).
- **Fallback Stores**: Falls back automatically to an in-memory Token Bucket store in the absence of Redis.

### 2. Backpressure & Resource Isolation
- **CPU Hashing Concurrency Queue**: Argon2id is computationally intensive. Under concurrent request spikes, standard parallel hashing saturates CPU cores and freezes the event loop. We isolate Argon2id hashing and verification inside a concurrency-limiting queue capped at `os.cpus().length` logical cores.
- **Graceful Performance Degradation**: If the hashing queue size exceeds 1,000 pending tasks, the backend rejects incoming logins with `429 AUTH_SERVER_BUSY` to prevent CPU exhaustion.
- **Resilient Geolocation Timeout**: Public IP location requests (used in travel speed checks) are wrapped in an `AbortController` with a strict **500ms timeout**, ensuring public API delays never block connection threads.

### 3. Database Protection & Caching
- **PostgreSQL Read/Write Splitting**: Configured with separate connection pools (`writePool` and `readPool`). Automatically routes all read queries (`SELECT`) to read replicas while directing all mutations (`INSERT`, `UPDATE`, `DELETE`) to the primary database writer.
- **Negative Caching of Revoked Tokens**: To prevent Postgres from being hammered by repetitive requests containing invalid, expired, or revoked sessions, the backend caches a special `"revoked"` placeholder in Redis for 5 minutes. Subsequent compromised requests fail-fast at the cache level without touching the DB.

### 4. Advanced Security Hardening & Session Hijacking Defense
- **Request-Level Fingerprint Verification**: In [auth.middleware.ts](file:///apps/api/src/core/security/auth.middleware.ts), every single authenticated request calculates the client's device fingerprint hash (from User-Agent, IP address, and client-provided headers) and compares it with the stored session signature.
- **Session Hijacking Auto-Lockout**: If a signature mismatch is detected (e.g. an attacker copies the `accessToken` and attempts to use it on another browser/network), the server **instantly revokes the session**, logs a `SESSION_HIJACK_DETECTED` security audit trace, and denies access with `401 AUTH_SESSION_HIJACK_DETECTED`.
- **Impossible Travel / Geo-Velocity Checks**: Calculates travel speed between consecutive requests using coordinates. If speed exceeds **800 km/h** (commercial jet speed), the session is instantly revoked and the request is blocked.
- **IP/Subnet Blacklisting**: Intercepts requests against a global IP blacklist (`blacklist:ips` in Redis) to block malicious traffic at the edge.
- **Refresh Token Rotation (RTR)**: Rotates refresh tokens on every refresh. If reuse of an old token is detected, it triggers immediate revocation of all sessions and fires security alert emails to the user.

### 5. Multi-Session Concurrent Login Control
- **Interactive Conflict UI**: If a user attempts to log in while an active session exists elsewhere, the frontend displays an interactive conflict panel allowing them to `[Cancel]` or `[Log Out Other Devices]`.
- **Forced Logout Credential Re-entry**: Clicking **Log Out Other Devices** fires a request that terminates all other sessions on the backend and returns the code `AUTH_CONCURRENT_SESSIONS_REVOKED`. The frontend redirects the user back to the login card with a success message, requiring they re-enter their email and password to log in. This prevents race conditions and immediate token generation.

### 6. Observability & Monitoring
- **OpenTelemetry & APM**: Auto-instrumented to trace Express requests, PG database queries, and Redis commands.
- **Prometheus Metrics**: Exposes a real-time `/metrics` endpoint collecting:
  - `requests_total` & `requests_errors_total` (counters)
  - `request_latency_seconds_avg`, `_p95`, `_p99` (rolling gauges for API response speed)
  - `db_query_latency_seconds_avg` (gauge monitoring Postgres)
  - `hashing_queue_depth` (gauge monitoring hashing backpressure)
  - `cache_hit_ratio` (gauge monitoring Redis hit/miss rates)
  - `active_sessions_count`, `rate_limit_triggers_total`, and `email_queue_size`.

---

## Setup & Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- PostgreSQL (Local or hosted, e.g. Neon)
- Redis (Local or hosted, e.g. Upstash)

### 1. Environment Variables
Create a `.env` file in `apps/api/`:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host/db
DATABASE_READ_URL=postgresql://user:pass@read-host/db
JWT_SECRET=super-secure-production-jwt-secret-key-123456
REDIS_URL=redis://localhost:6379
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxx
EMAIL_FROM=no-reply@update.shooterdelta.tech
```

Create a `.env` file in `apps/web/`:
```env
VITE_API_URL=/api
```

### 2. Installation & Run
```bash
# Install dependencies (forces devDependencies to install even if NODE_ENV=production is set)
pnpm install --production=false

# Build the project (compiles backend TypeScript and builds React frontend statically)
pnpm build

# Start the development server (Frontend on :3001, API on :3000)
pnpm dev
```

---

## Production Deployment (Render + Cloudflare)

Since the Express backend serves the React frontend statically in production, you have a **Unified Same-Origin Deployment** (you only run the Express app on port `3000` in the cloud).

### 1. Setup on Render
1. Create a new **Web Service** on [Render](https://render.com) pointing to your GitHub repository.
2. Configure settings:
   - **Build Command**: `pnpm install --production=false && pnpm build`
   - **Start Command**: `node apps/api/dist/app/server.js`
   - **Port**: `3000`
3. Add your production environment variables (from your `.env` file) under the **Environment** tab.
4. Render will deploy your service and give you a target URL like `your-app.onrender.com`.

### 2. Point Custom Domain in Cloudflare
1. Go to your **Cloudflare Dashboard > DNS > Records**.
2. Add a new record:
   - **Type**: `CNAME`
   - **Name**: `NexVault` (to map `NexVault.shooterdelta.tech`)
   - **Target**: `your-app.onrender.com`
   - **Proxy Status**: **DNS Only** (grey cloud). *Since Render manages SSL, DNS-Only prevents double-proxy routing conflicts (Cloudflare Error 1000).*
3. Add `NexVault.shooterdelta.tech` under the **Custom Domains** section in your Render Web Service settings page to verify ownership and activate the SSL certificate.