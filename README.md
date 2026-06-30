# Advanced Production-Grade Authentication & Security System

A high-performance, robust, and secure authentication system built as a monorepo containing a React (Vite + TypeScript) frontend and an Express (TypeScript) API. Designed to scale to millions of requests with sub-millisecond latencies using a polyglot persistence architecture.

---

## Key Features & Architecture

### 1. Pluggable Production-Grade Databases
- **PostgreSQL**: Stores core transactional user profiles, credentials, roles, and session metadata.
- **Redis (Auto-detection & Fallback)**:
  - If `REDIS_URL` is provided, the system leverages Redis for high-throughput, low-latency operations.
  - If `REDIS_URL` is absent, the system gracefully falls back to local in-memory and PostgreSQL stores, ensuring a **zero-setup** developer experience.
- **Asynchronous Email Delivery Queue**: Swaps database polling with Redis Lists (`LPUSH`/`RPOP`) to process outbound emails asynchronously (e.g. OTPs, welcome emails) without blocking user requests.
- **Write-Through Session Cache**: Caches active sessions in Redis, reducing PostgreSQL read pressure and validating tokens in sub-milliseconds.

### 2. Advanced Security Hardening
- **Access Token Blocklisting**: Upon logout or password change, the active access token's signature is blocklisted in Redis with a TTL matching its remaining expiration, instantly revoking its validity.
- **Refresh Token Rotation (RTR) with SIEM Alerting**: Prevents token replay attacks by rotating refresh tokens on every refresh. If token reuse is detected, all active sessions are instantly revoked, a critical security audit event is logged, and a security alert email is sent to the user.
- **Argon2id Password Hashing**: Explicitly tuned using the RFC 9106 recommended profile (`memoryCost: 64MB`, `timeCost: 3`, `parallelism: 4`) to maximize offline brute-force difficulty.
- **Device Fingerprint Hijacking Protection**: The client sends a persistent device signature via the `X-Device-Fingerprint` header. The backend hashes and stores it alongside the session. A fingerprint mismatch during token refresh triggers immediate session revocation across all devices.
- **Sliding-Window Rate Limiting**: Distributed rate limiting using Redis sorted sets (or in-memory sliding window fallback) to prevent brute-force attacks on sensitive endpoints.
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

---

## Setup & Running Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- PostgreSQL (Local or hosted, e.g. Neon)
- *Optional*: Redis (v6+)

### 1. Environment Variables
Create a `.env` file in `apps/api/`:
```env
PORT=3000
DATABASE_URL=postgresql://user:pass@host/db
JWT_SECRET=super-secure-dev-jwt-secret-key-123456
REDIS_URL=redis://localhost:6379 # Optional: omit for in-memory fallback
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