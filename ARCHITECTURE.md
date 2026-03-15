# ARCHITECTURE.md — ArvyaX Journal System

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Client (React)                       │
│   Write Entry │ View Entries │ Analyze │ View Insights   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────────┐
│                  Express API (Node.js)                   │
│                                                          │
│  POST /api/journal          GET /api/journal/:userId     │
│  POST /api/journal/analyze  GET /api/journal/insights/:id│
│                                                          │
│  Middleware: CORS │ Rate Limit │ JSON parse              │
└────────┬─────────────────────────────┬───────────────────┘
         │                             │
┌────────▼───────────┐      ┌──────────▼──────────────────┐
│  SQLite Database   │      │  Anthropic Claude API        │
│                    │      │  (claude-haiku-4-5)          │
│  journal_entries   │      │                              │
│  analysis_cache    │      │  Emotion analysis            │
└────────────────────┘      └─────────────────────────────┘
```

---

## 1. How Would You Scale This to 100,000 Users?

### Current Bottlenecks at Scale

The current SQLite + single-process Node design works well up to ~1,000 concurrent users. Beyond that, three things break down: SQLite's write contention, the single Express process, and no horizontal scaling path.

### Scaling Strategy

**Database Layer — Migrate to PostgreSQL**

SQLite is file-based and single-writer. At 100k users with concurrent writes, this becomes a bottleneck. Migration path:

- Replace `better-sqlite3` with `pg` (node-postgres) — the query logic is nearly identical
- PostgreSQL handles thousands of concurrent connections, has proper row-level locking, and supports read replicas
- Add a **read replica** for `GET /api/journal/:userId` and `GET /api/journal/insights/:userId` (read-heavy endpoints) so writes go to primary, reads fan out to replicas
- Index strategy is already in place (`idx_journal_user`, `idx_journal_user_created`) — these become critical at scale

**Application Layer — Horizontal Scaling**

```
           Load Balancer (nginx / AWS ALB)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   API Instance  API Instance  API Instance
   (Node.js)     (Node.js)     (Node.js)
        └───────────┼───────────┘
                    │
               PostgreSQL
            Primary + 2 Replicas
```

- Deploy N stateless API instances behind a load balancer (round-robin)
- Session state is already stateless (userId passed in every request) — no sticky sessions needed
- Use PM2 cluster mode or Kubernetes Deployments for orchestration

**Caching Layer — Redis**

Move the `analysis_cache` from SQLite to **Redis**:
- Redis supports atomic operations, TTL-based expiry, and shared access across all API instances
- SQLite cache only works per-instance; Redis cache is shared across the entire fleet
- Key: `analysis:<sha256(text)>` → Value: `{emotion, keywords, summary}` with 30-day TTL

**Async LLM Analysis — Queue-Based**

At scale, blocking HTTP for LLM analysis is risky (slow responses, timeouts, backpressure). Decouple with a job queue:

```
POST /api/journal/analyze
        │
        ▼
  Enqueue job (BullMQ / Redis)
  Return 202 Accepted + jobId
        │
        ▼
  Worker pool consumes queue
  Calls Anthropic API
  Writes result to DB + Redis cache
        │
        ▼
  Client polls GET /api/journal/analyze/status/:jobId
  OR WebSocket push when complete
```

**Estimated Capacity at Scale**

| Component | Current | At 100k Users |
|-----------|---------|---------------|
| DB | SQLite (1 file) | PostgreSQL + 2 read replicas |
| API | 1 Node process | 4–8 instances behind LB |
| Cache | SQLite table | Redis cluster |
| LLM calls | Synchronous | Async queue with workers |
| Analysis throughput | ~5 RPS | ~200 RPS (with queue + workers) |

---

## 2. How Would You Reduce LLM Cost?

LLM calls are the most expensive part of this system. Several strategies dramatically reduce cost without degrading quality.

### a) Model Selection (Already Implemented)

The system uses `claude-haiku-4-5` — Anthropic's fastest and cheapest model. For structured emotion extraction from short journal text, Haiku performs on par with larger models at a fraction of the cost. The task does not require Sonnet or Opus.

### b) Content-Hash Caching (Already Implemented)

Before every LLM call, the system computes `SHA-256(text.trim().toLowerCase())` and checks the `analysis_cache` table. Identical or near-identical journal entries (e.g., a user re-submits the same text) return a cached result instantly at zero LLM cost.

**Expected impact:** In practice, 10–30% of analysis requests in a wellness app are repeat or near-repeat text ("I felt calm", "great session today"). Caching eliminates those entirely.

### c) Prompt Compression

The current system prompt is already lean (under 150 tokens). Avoid verbose few-shot examples unless accuracy degrades — every token costs money at 100k users.

### d) Batch Analysis

Instead of analyzing each entry on-demand, offer a **batch endpoint**:
```
POST /api/journal/analyze/batch
{ "entryIds": ["id1", "id2", "id3"] }
```
Send up to 5 entries in a single LLM call:
```
Analyze these 5 journal entries and return a JSON array...
```
This reduces per-entry overhead (system prompt is amortized across entries).

### e) Client-Side Throttle + Debounce

On the frontend, debounce the "Analyze" button — prevent a user from firing repeated LLM calls within a short window. A 3-second debounce eliminates accidental double-submits.

### f) Lazy Analysis (Don't Analyze Everything)

Only analyze when the user explicitly clicks "Analyze" (current design). Do not auto-analyze every saved entry. This keeps LLM usage intentional and controlled.

### g) Cost Estimation

At 100k users with avg 3 journal entries/week, 30% analyzed:
- ~90,000 analysis calls/week
- ~300 tokens in + 100 tokens out per call = 400 tokens
- ~36M tokens/week
- Haiku pricing: ~$0.25/M input + $1.25/M output ≈ **~$18/week** at scale

With caching absorbing 25% of calls, cost drops to ~**$13.50/week** — highly manageable.

---

## 3. How Would You Cache Repeated Analysis?

### Current Implementation

The system already implements **persistent LLM response caching** in the `analysis_cache` SQLite table:

```sql
CREATE TABLE analysis_cache (
  text_hash TEXT PRIMARY KEY,   -- SHA-256(normalized text)
  emotion   TEXT NOT NULL,
  keywords  TEXT NOT NULL,      -- JSON array
  summary   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1   -- tracks reuse
);
```

**Flow:**
1. Normalize input: `text.trim().toLowerCase()`
2. Hash: `SHA-256(normalized)` → 64-char hex key
3. Check `analysis_cache` table — if hit, return immediately + increment `hit_count`
4. On miss: call LLM, store result, return to client
5. Response includes `"cached": true/false` field for observability

**Why SHA-256 and not the raw text?**
- Privacy: raw journal text is sensitive; the cache table stores only a hash + results
- Efficiency: fixed-length key, fast B-tree lookup
- Collisions: SHA-256 collision probability is negligible (~2^-128)

### Production Cache Upgrade Path

For multi-instance deployments, migrate to **Redis**:

```javascript
// Cache check (Redis)
const cacheKey = `analysis:${sha256(text)}`;
const cached = await redis.get(cacheKey);
if (cached) return { ...JSON.parse(cached), cached: true };

// On LLM result
await redis.setex(cacheKey, 30 * 24 * 3600, JSON.stringify(result)); // 30d TTL
```

Benefits over DB cache:
- Sub-millisecond reads (in-memory)
- Shared across all API instances
- Native TTL eviction — no manual cleanup job needed
- `redis.incr(\`cache:hits\`)` for easy monitoring

### Semantic Cache (Advanced)

For entries with different phrasing but identical meaning ("I felt relaxed" vs "I was at ease today"), an **embedding-based semantic cache** can avoid redundant LLM calls:

1. Embed the input text using a small embedding model
2. Query a vector store (pgvector, Pinecone) for nearest neighbor within cosine similarity > 0.92
3. If found, return the cached analysis; otherwise call LLM

This can absorb an additional 15–25% of calls that exact-hash caching misses.

---

## 4. How Would You Protect Sensitive Journal Data?

Journal entries contain deeply personal mental health content. Protection must be multi-layered.

### a) Encryption at Rest

**Database-level:** Use SQLite Encryption Extension (SEE) or migrate to PostgreSQL with `pgcrypto`. Encrypt the `text` column before writing:

```javascript
// Encrypt before INSERT
const encrypted = aes256gcm.encrypt(entry.text, process.env.DATA_ENCRYPTION_KEY);

// Decrypt after SELECT
const plaintext = aes256gcm.decrypt(row.text, process.env.DATA_ENCRYPTION_KEY);
```

Use AES-256-GCM (authenticated encryption) — it detects tampering in addition to providing confidentiality.

**Key management:** Store encryption keys in a secrets manager (AWS Secrets Manager, HashiCorp Vault) — never in `.env` files or source code in production.

### b) Encryption in Transit

- Enforce HTTPS/TLS 1.3 for all API traffic — terminate TLS at the load balancer (AWS ALB, Cloudflare)
- Set `Strict-Transport-Security` header to prevent downgrade attacks
- The `better-sqlite3` connection is local (no network) — no TLS needed there

### c) Authentication & Authorization

The current design uses a plain `userId` string — suitable for a demo, not production. Replace with:

- **JWT-based auth:** Issue tokens on login; validate on every API request
- **Middleware enforcement:** Every route verifies `req.user.id === params.userId` — a user can only access their own entries
- **Zero trust:** Never trust userId from the request body for authorization decisions

```javascript
// Middleware example
function requireOwnership(req, res, next) {
  if (req.user.id !== req.params.userId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
```

### d) Data Minimization

- The `analysis_cache` table stores only a **hash** of the text, never the plaintext — this is already implemented
- Don't log journal text in application logs — log entry IDs only
- Set log retention policies (30 days max for application logs)

### e) Rate Limiting & Abuse Prevention

Already implemented:
- 100 requests per 15 minutes (general API)
- 10 analysis requests per minute (LLM endpoint)

Production additions:
- Per-user rate limits (not just per-IP) using userId from JWT
- Anomaly detection: alert if a single user fires >50 analysis calls in an hour

### f) GDPR / Right to Erasure

Implement a delete endpoint:
```
DELETE /api/journal/user/:userId
```
This must cascade-delete all entries, analysis results, and any cached data associated with the user. Cache entries keyed by text hash are anonymized already (no userId linkage in cache table).

### g) Infrastructure Security

- Store `ANTHROPIC_API_KEY` and `DATA_ENCRYPTION_KEY` in environment secrets (not in Git)
- Use `.gitignore` to exclude `.env` and `*.db` files (already in place)
- Run the Node process as a non-root user in Docker (already in Dockerfile: `USER node`)
- Regularly rotate API keys

---

## Data Model

```
journal_entries
├── id          TEXT PK        (UUID v4)
├── user_id     TEXT           (indexed)
├── ambience    TEXT           (CHECK constraint)
├── text        TEXT           (sensitive — encrypt at rest in prod)
├── created_at  TEXT           (indexed with user_id for sort)
├── emotion     TEXT NULLABLE  (populated after LLM analysis)
├── keywords    TEXT NULLABLE  (JSON array string)
├── summary     TEXT NULLABLE
└── analyzed_at TEXT NULLABLE

analysis_cache
├── text_hash   TEXT PK        (SHA-256 of normalized input)
├── emotion     TEXT
├── keywords    TEXT           (JSON array)
├── summary     TEXT
├── created_at  TEXT
└── hit_count   INTEGER        (observability)
```

---

## Summary Table

| Concern | Current Design | Production Recommendation |
|---------|---------------|--------------------------|
| Database | SQLite (WAL mode) | PostgreSQL + read replicas |
| Caching | SQLite `analysis_cache` | Redis with TTL |
| LLM cost | Haiku model + hash cache | + batch API + semantic cache |
| Auth | userId string | JWT + middleware ownership check |
| Encryption | None (demo) | AES-256-GCM on `text` column |
| Scaling | Single process | Horizontal via LB + PM2/K8s |
| LLM calls | Synchronous | Async queue (BullMQ) |
| Key management | .env file | AWS Secrets Manager / Vault |
