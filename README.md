# Domain Status Checker Library — Design Document

---

## 1. Overview & Motivation

A **Domain Status Checker** library provides a fast, reliable way to determine whether a given domain name is:

* **Available** for registration
* **Unavailable** (already registered)
* **Unsupported** (invalid syntax or unsupported TLD)
* **Fine-status** variants (expiring soon, premium, reserved, etc.)

To achieve both speed and accuracy under varying environments (Node.js vs browser), the library:

1. **Tier&nbsp;1 – DNS**: probe via `host` and/or DNS-over-HTTPS (DOH) in parallel.
2. **Tier&nbsp;2 – RDAP**, when available.
3. **Tier&nbsp;3 – WHOIS**: local WHOIS library followed by a paid WHOIS API.
4. **Normalizes** every response to a uniform interface.
5. **Caches**, **logs**, and **tests** extensively for production readiness.

---

## 2. Requirements & Features

### 2.1 Functional Requirements

* **Fast “first-good-win”** DNS probing (cancel slower probes once a record is found).
* **Three-tier fallback**: DNS (host/DOH) → RDAP → WHOIS library/WHOIS API.
* **Uniform result shape** for all sources.
* **Per-TLD overrides**, e.g. custom RDAP servers or skipping RDAP entirely.
* **Environment detection**: Node.js gets CLI & libraries; browser uses DOH & APIs.
* **Batch mode**: concurrent checks with configurable concurrency limit.
* **Extended statuses**: `expiring_soon`, `premium`, `for_sale`, etc.

### 2.2 Non-Functional Requirements

* **Caching** with TTLs to reduce repeated network calls.
* **Structured logging** of probes, fallbacks, latencies, errors.
* **Comprehensive testing**: unit, integration, performance.
* **Pluggable adapters**: easy to add new WHOIS or DNS providers.
* **Zero external dependencies** beyond HTTP/DNS libraries.

---

## 3. High-Level Architecture

```text
┌─────────────────────────┐
│      Public API        │
│  check(domain)         │
│  checkBatch(domains)   │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Orchestrator / Runner │
│  - DNS race            │
│  - Fallback ladder     │
│  - Normalizer          │
└────────┬────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  Adapters & Utilities                                │
│  • hostAdapter    (Node only)                        │
│  • dohAdapter     (Node+Browser)                     │
│  • rdapAdapter    (per-TLD config)                   │
│  • whoisLibAdapter(Node only)                        │
│  • whoisApiAdapter (remote HTTP)                     │
│  • cacheLayer                                        │
│  • loggingLayer                                      │
└────────────────────────────────────────────────────────┘
```

---

## 4. Core Interfaces & Data Models

### 4.1 `DomainStatus`

```ts
export interface DomainStatus {
  domain:        string;
  availability:  'available' | 'unavailable' | 'unsupported';
  fineStatus?:   'expiring_soon'
               | 'registered_not_in_use'
               | 'premium'
               | 'for_sale'
               | 'reserved';
  source:        'host' | 'doh' | 'rdap' | 'whois-lib' | 'whois-api';
  raw:           any;       // raw adapter response
  timestamp:     number;    // Date.now()
}
```

### 4.2 `CheckerAdapter`

```ts
export interface CheckerAdapter {
  /**
   * Checks a domain; respects AbortSignal for cancellation.
   */
  check(
    domain: string,
    opts?: {  
      signal?: AbortSignal,
      tldConfig?: TldConfigEntry
    }
  ): Promise<DomainStatus>;
}
```

### 4.3 `Logger`

```ts
export interface Logger {
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
  debug(msg: string, meta?: object): void;
}
```

### 4.4 `TldConfigEntry`

```ts
export interface TldConfigEntry {
  rdapServer?: string;
  /** If true, skip RDAP and go straight to WHOIS */
  skipRdap?: boolean;
}
```

---

## 5. Module Breakdown & APIs

```
/src
 ├─ index.ts        # public API and orchestration
 ├─ adapters/
 │    ├─ hostAdapter.ts
 │    ├─ dohAdapter.ts
 │    └─ rdapAdapter.ts
 ├─ cache.ts       # in-memory cache implementation
 ├─ validator.ts
 ├─ tlds.json
 ├─ tests/         # unit & integration tests
 └─ types.ts       # shared interfaces & enums
```

### 5.1 Public API (`index.ts`)

```ts
import { check, checkBatch } from './index';
import { configure } from './index';

export {
  check,
  checkBatch,
  configure,  // allow injecting custom cache and logger
  DomainStatus,
};
```

### 5.2 Configuration

```ts
export function configure(opts: {
  cache?: Cache;
  logger?: Logger;
  concurrency?: number;
}) { … }
```

---

## 6. Execution Flow

### 6.1 Single-Domain `check(domain: string)`

1. **Sanitize & parse** domain; immediately return `unsupported` if syntax/TLD invalid.
2. **Cache lookup**: if recent entry exists, return it.
3. **DNS Probe (parallel race):**

   * Launch `hostAdapter` (Node), plus one or more `dohAdapter`s.
   * Use `Promise.race()` to pick first responder.
   * On positive record → mark `unavailable`, abort others.
4. **Fallback Ladder:**

   * RDAP (unless `skipRdap` is set) → if still `unknown`,
   * WHOIS library → if still `unknown`,
   * WHOIS API (last resort).
5. **Normalize** raw response → `DomainStatus`.
6. **Cache** result with TTL (e.g. 1h for unavailable, 5min for available).
7. **Log**: adapter used, latency, outcome, errors.
8. **Return** the `DomainStatus` promise.

### 6.2 Batch Mode `checkBatch(domains: string[], concurrency)`

* Use a **promise-pool** (e.g. p-limit) to run up to `concurrency` checks in parallel.
* Aggregate results in input order → `DomainStatus[]`.

---

## 7. Caching Strategy

* **Pluggable**: pass a custom object with `get()`/`set()` to `configure()`; default implementation is an in-memory LRU cache.
* **Key**: `domain.toLowerCase()`
* **TTL**:

  * `available`: 5 minutes
  * `unavailable`: 1 hour
  * `unsupported`: never cached (or very short)
* **Eviction**: LRU with max size (e.g. 10k entries).

---

## 8. Logging Strategy

* **Structured logs** with JSON metadata.
* **Events to log**:

  * Probe start/end (method, latency)
  * Fallback transitions
  * Cache hit/miss
  * Errors and retries
* **Levels**:

  * `info`: high-level flow (cache hits, final status)
  * `debug`: per-adapter details
  * `warn`/`error`: timeouts, adapter failures

```js
logger.info('domain.check.start', { domain });
logger.debug('adapter.response', { domain, adapter, latency, raw });
logger.info('domain.check.end',  { domain, status, source });
```

---

## 9. Testing Strategy

Use a short, curated list of domains with known status and make real network
calls. No mocks or stub servers are involved. Each test invokes the library
against the list and verifies the returned `DomainStatus` matches expectations.

Example list:

* `example.com` – unavailable
* `iana.org` – unavailable
* `this-domain-should-not-exist-12345.com` – available
* `invalid@domain` – unsupported

Running the library on this set provides a simple end-to-end check of the core
flow.

---

## 10. Error Handling & Retries

* **Timeouts** on all network calls (configurable, e.g. 3 s for DNS, 5 s for RDAP).
* **Retries**: simple exponential backoff for RDAP and WHOIS API (max 2 retries).
* **AbortController** support to cancel in-flight race participants.
* **Graceful degradation**: if RDAP fails or is skipped, still attempt WHOIS library & API.

---

## 11. Scalability & Deployment

* **Library** can be used in-process or wrapped in a microservice (Docker + HTTP endpoint).
* **Batch queue**: integrate with job queue (e.g. BullMQ) for massive domain lists.
* **Metrics**: expose Prometheus counters/gauges for total checks, errors, latencies.

---

## 12. Alternatives & Trade-Offs

| Strategy                   | Pros                          | Cons                         |
| -------------------------- | ----------------------------- | ---------------------------- |
| Full parallel of all       | Fastest overall               | High resource & API-costs    |
| Strict sequential fallback | Minimal external calls        | Slow “cold” available checks |
| Bloom-filter caching       | Instant rejects for known set | Risk of false positives      |

Our design balances **speed** (DNS race) and **cost** (deferred paid API), while ensuring **extensibility** and **observability**.

---

## 13. Conclusion

This design document lays out:

* **Clear interfaces** and data models
* **Module decomposition** for adapters, caching, and logging
* **Execution flows** (race + fallback + normalization)
* **Production concerns**: caching, retries, logging, testing, metrics

An engineer can pick up this spec, scaffold the directory structure, implement each adapter to the `CheckerAdapter` interface, wire up the orchestrator, and have a battle-tested, production-grade Domain Status Checker in hours.
