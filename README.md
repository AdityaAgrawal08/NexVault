# Advanced Production-Grade Authentication & Security System

A high-performance, robust, and secure authentication system built as a monorepo containing a React (Vite + TypeScript) frontend and an Express (TypeScript) API. Designed to scale to millions of requests with sub-millisecond latencies using a polyglot persistence architecture.

---

## Key Features & Architecture

### 1. Pluggable Production-Grade Databases & Scaling
- **PostgreSQL Read/Write Splitting**: Configured with separate connection pools (`writePool` and `readPool`). Automatically routes all read queries (`SELECT`) to read replicas while directing all mutations (`INSERT`, `UPDATE`, `DELETE`) to the primary database writer.
- **Redis Integration**:
  - The system automatically detects `REDIS_URL` in your `.env` file.
  - When active, the system offloads high-write, transient, and caching operations from PostgreSQL to Redis.
  - If `REDIS_URL` is omitted, the system gracefully falls back to local in-memory and PostgreSQL stores, ensuring a **zero-setup** developer experience.
- **Asynchronous Email Delivery Queue with Dead Letter Queue (DLQ)**:
  - Processes outbound emails (OTPs, alerts, welcomes) asynchronously using Redis Lists (`LPUSH`/`RPOP`) or Postgres polling (`SKIP LOCKED`).
  - If an email job fails after maximum retries, it is automatically moved to a **Dead Letter Queue** (`email:dlq` in Redis or `DLQ` status in Postgres) for inspection and troubleshooting without losing data.
- **Write-Through Session Cache**: Caches active sessions in Redis, reducing PostgreSQL read pressure and validating tokens in sub-milliseconds.
- **Distributed Locking (Redlock)**: Implements distributed locks in Redis (falling back to an in-memory lock manager) to prevent race conditions during highly concurrent operations, such as simultaneous registrations of the same username or concurrent verification attempts of the same OTP.

### 2. Advanced Security Hardening
- **Impossible Travel / Geo-Velocity Checks**: Resolves IP addresses to geographical coordinates (via `ip-api.com` with local caching and loopback simulations). Calculates travel distance (Haversine formula) and speed between consecutive requests. If speed exceeds **800 km/h** (commercial jet speed), the session is instantly revoked and the request is blocked.
- **IP/Subnet Blacklisting**: Integrates a global IP blacklist check against a Redis set (`blacklist:ips`) on every request, blocking flagged IPs with `403 Forbidden`.
- **Leaked Credential Detection**: During registration, password change, and password reset, the password is check against the **HaveIBeenPwned API** using the **k-Anonymity model** (only the first 5 characters of the SHA-1 hash are sent), preventing users from selecting compromised passwords.
- **Access Token Blocklisting**: Upon logout or password change, the active access token's signature is blocklisted in Redis with a TTL matching its remaining expiration, instantly revoking its validity.
- **Refresh Token Rotation (RTR) with SIEM Alerting**: Prevents token replay attacks by rotating refresh tokens on every refresh. If token reuse is detected, all active sessions are instantly revoked, a critical security audit event is logged, and a security alert email is sent to the user.
- **Argon2id Password Hashing**: Explicitly tuned using the RFC 9106 recommended profile (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`) to maximize offline brute-force difficulty.
- **Device Fingerprint Hijacking Protection**: The client sends a persistent device signature via the `X-Device-Fingerprint` header. The backend hashes and stores it alongside the session. A fingerprint mismatch during token refresh triggers immediate session revocation across all devices.
- **GDPR & CCPA Privacy Compliance**: Recursively masks sensitive fields (like emails and phone numbers) in `audit_logs` metadata before saving to the database.

### 3. Centralized Policy Engine (ABAC & RBAC)
- Ownership checks and role-based permissions are decoupled from controller business logic and handled by a centralized `policyEngine` ([policy.ts](file:///home/aditya/dev/website/apps/api/src/core/security/policy.ts)).
- Thin, maintainable controllers that query the policy engine before serving resources.

### 4. Interactive Re-authentication Flow
- Guarding highly sensitive actions:
  - Changing password
  - Changing email
  - Deleting account
  - Revoking other active sessions
- The frontend interceptor automatically opens the `ReauthModal` prompting the user to confirm their identity using their password or an email-based OTP. Once verified, a short-lived (5-minute) `reauthToken` (JWT) is returned and passed in the `X-Reauth-Token` header.

### 5. Observability & Monitoring
- **OpenTelemetry & APM**: Node.js entrypoint is instrumented with the OpenTelemetry SDK (`NodeSDK`) and auto-instrumentations to trace Express requests, PG database queries, Redis commands, and external API requests.
- **Prometheus Metrics**: Exposes a `/metrics` endpoint collecting:
  - `active_sessions_count`: Current active sessions.
  - `rate_limit_triggers_total`: Total rate-limiting triggers.
  - `email_queue_size`: Current email queue size.
  - `argon2id_hashing_latency_seconds`: Average Argon2id hashing latency.

---

## Setup & Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- PostgreSQL (Local or hosted, e.g. Neon)
- Redis (Local or hosted, e.g. Upstash or local docker/system service)

### 1. Environment Variables
Create a `.env` file in `apps/api/`:
```env
PORT=3000
DATABASE_URL=postgresql://user:pass@host/db
DATABASE_READ_URL=postgresql://user:pass@read-host/db # Optional: falls back to DATABASE_URL
JWT_SECRET=super-secure-dev-jwt-secret-key-123456
REDIS_URL=redis://localhost:6379
```

Create a `.env` file in `apps/web/`:
```env
VITE_API_URL=http://localhost:3000
```

### 2. Installation & Run
```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start the development server (Frontend on :3001, API on :3000)
pnpm dev
```

On startup, you will see the following confirmation in your API terminal logs:
```
[Redis] Connected successfully.
[Telemetry] OpenTelemetry initialized successfully.
```
This confirms that all pluggable stores (Rate Limiting, OTP, Session, and Email Queue) are successfully running on Redis, and telemetry is active.