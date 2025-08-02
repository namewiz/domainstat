# Domain Status Checker Library — Design Document

---

## 1. Overview & Motivation

A **Domain Status Checker** library provides a fast, reliable way to determine whether a given domain name is:

* **Available** for registration
* **Unavailable** - already registered or not trivially purchasable

Else returns **Error** for invalid syntax or unsupported TLD.

A domain is **available** if (and only if) there's no whois/rdap record for it *AND* it can be automatically purchased without reservations.


To achieve both speed and accuracy under varying environments (Node.js vs browser), the library:

1. **Tier&nbsp;1 – DNS**: probe via `host` and/or DNS-over-HTTPS (DOH) in parallel.
2. **Tier&nbsp;2 – RDAP**, when available.
3. **Tier&nbsp;3 – WHOIS**: local WHOIS library or a paid WHOIS API.

---

## 2. Requirements & Features

### 2.1 Functional Requirements

* **Fast “first-good-win”** DNS probing (cancel slower probes once a record is found).
* **Three-tier fallback**: DNS (host/DOH) → RDAP → WHOIS library/WHOIS API.
* **Uniform result shape** for all sources.
* **Per-TLD overrides**, e.g. custom RDAP servers or skipping RDAP entirely.
* **Environment detection**: Node.js gets CLI & libraries; browser uses DOH & APIs.
* **Batch mode**: concurrent checks with configurable concurrency limit.
* **Extended statuses**: `expiring_soon`, `premium`, `reserved`, etc.

---

## 5 Public API

```ts
import { check, checkBatch } from './index';

export {
  check,
  checkBatch,
};
```

### 5.2 Configuration

Both `check` and `checkBatch` accept an optional `options` object:

```ts
interface CheckOptions {
  logger?: Logger;
  verbose?: boolean;
  concurrency?: number; // only used by checkBatch
  /** Only run adapters whose namespace starts with one of these prefixes */
  only?: string[];
  /** Skip adapters whose namespace starts with one of these prefixes */
  skip?: string[];
  tldConfig?: TldConfigEntry;
  /** Select platform. Defaults to 'auto' */
  platform?: 'auto' | 'node' | 'browser';
}

check(domain: string, options?: CheckOptions);
checkBatch(domains: string[], options?: CheckOptions);
```

Logging is disabled by default; pass `verbose: true` to enable log output.
The `platform` option lets you override automatic environment detection and force
Node or browser-specific adapters.

### 5.3 Error Handling & Retries

* **Timeouts** on all network calls (configurable, e.g. 3 s for DNS, 5 s for RDAP).
* **Retries**: simple exponential backoff for RDAP and WHOIS API (max 2 retries).
* **Per-adapter timeouts** via an optional `timeoutMs` parameter.
* **Graceful degradation**: if RDAP fails or is skipped, still attempt WHOIS library & API.

---


## Pending TODOs

* Add UI demo at demo/index.html which uses the bundled js in dist/index.js
  * Make this demo the Github page
  * This demo should test the domains like for available and unavailable tlds.
  * Add an npm command to bring up the demo.

* Implement rdap overrides for TLDs that are not rdap conformant like .ng
  * .ng registry https://whois.nic.net.ng/domains?name=jiji.ng&exactMatch=true
* Fix whois fallback, perhaps using whois-json library.
* Expand ccTLD list to include all ccTLDs.
* Add namespace to adapters, use it to store raw responses.
* ~~Implement `only` and `skip` config options, using namespaces~~
* ~~Implement per-adapter timeouts~~

## Running the Demo

1. Build the library:

   ```bash
   npm run build
   ```

2. Start the demo server:

   ```bash
   npm run demo
   ```

   This uses `npx serve` to host the `demo/` folder. Open the printed URL in your browser to try the UI.
   The page includes a collapsible panel to choose which TLDs to check and
   shows a results table for each query.
