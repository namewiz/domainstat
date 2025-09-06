# Fast Domain Status

Fast Domain Status is a lightweight TypeScript/JavaScript library for checking
whether domain names are unregistered (available to register). It queries several data
sources in a "first good win" order – DNS, RDAP and finally WHOIS – and returns a
uniform result describing the domain's status.

The package is suitable for both Node.js and browser environments and exposes
batch utilities for high–volume lookups.

## Features

- ⚡ **Fast**: probes DNS first and cancels slower checks once a definitive
  answer is found.
- 🔁 **Three tier lookup**: DNS → RDAP → WHOIS library/API.
- 🌐 **Universal**: automatically detects Node or browser and selects the right
  adapters. A `platform` option allows manual control.
- ⚙️ **Customisable**: per‑TLD overrides, pluggable logging and adapter include/
  exclude filters.
- 📦 **Batch helpers**: check lists of domains with concurrency limits or stream
  results as they arrive.

## Installation

```bash
npm install fast-domain-status
```

## Quick Start

```ts
import { check, checkBatch, checkBatchStream, checkSerial, checkParallel, type DomainStatus } from 'fast-domain-status';

const res = await check('example.com');
// { domain: 'example.com', availability: 'registered', resolver: 'dns.host', raw: {...} }

// checkBatch resolves to an array when all lookups finish
const batch: DomainStatus[] = await checkBatch(['example.com', 'openai.org']);

// checkBatchStream streams the array items as they complete
const streamed: DomainStatus[] = [];
for await (const item of checkBatchStream(['foo.dev', 'bar.io'])) {
  streamed.push(item);
}

// Run all adapters in parallel using burst mode
const fast = await check('example.com', { burstMode: true });
```

Both batch helpers produce arrays of `DomainStatus`; `checkBatch` waits for all results,
while `checkBatchStream` yields items as they become available.

The `availability` field can be `unregistered`, `registered`, `unsupported`,
`invalid` or `unknown`. The `resolver` indicates which adapter produced the
result and `raw` contains the raw responses from each adapter.

### Response Schema

| Field        | Type                                                                      | Description                                       |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------- |
| domain       | `string`                                                                  | Domain that was checked.                          |
| availability | `'unregistered' \| 'registered' \| 'unsupported' \| 'invalid' \| 'unknown'` | Overall status of the domain.                     |
| resolver     | `string`                                                                  | Adapter namespace that produced the final result. |
| raw          | `Record<string, any>`                                                     | Raw responses keyed by adapter namespace.         |
| error?       | `{ code: string; message: string; retryable: boolean }`                   | Optional error details if lookup failed.          |

## API

### `check(domain, options?)`

Checks a single domain and resolves to a `DomainStatus` object.

### `checkSerial(domain, options?)`

Sequential version of `check` that invokes adapters one after another.

### `checkParallel(domain, options?)`

Runs all adapters concurrently and aborts pending ones once a result is found.

### `checkBatch(domains, options?)`

Checks multiple domains concurrently and resolves to an array of
`DomainStatus` objects.

### `checkBatchStream(domains, options?)`

Returns an async generator yielding `DomainStatus` for each domain as soon as it
finishes.

### Options

| Option           | Type                                                            | Description                                                                                  |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| logger?          | `Pick<Console, 'info' \| 'warn' \| 'error'>`                    | Custom logger used when `verbose` is true.                                                   |
| verbose?         | `boolean`                                                       | Enable logging output.                                                                       |
| concurrency?     | `number`                                                        | Maximum concurrent lookups for batch helpers.                                                |
| only?            | `string[]`                                                      | Run only adapters whose namespace starts with these prefixes.                                |
| skip?            | `string[]`                                                      | Skip adapters whose namespace starts with these prefixes.                                    |
| tldConfig?       | `TldConfigEntry`                                                | Per‑TLD overrides such as RDAP server.                                                       |
| platform?        | `'auto' \| 'node' \| 'browser'`                                 | Force runtime platform.                                                                      |
| cache?           | `boolean`                                                       | Enable or disable caching (default `true`).                                                  |
| apiKeys?         | `{ domainr?: string; whoisfreaks?: string; whoisxml?: string }` | API keys for third‑party services.                                                           |
| burstMode?       | `boolean`                                                       | When true, use `checkParallel` to query all adapters simultaneously.                         |
| allottedLatency? | `Partial<Record<AdapterSource, number>>`                        | Per‑adapter latency before launching the next in serial mode; defaults to `200ms` per entry. |
| timeoutConfig?   | `Partial<Record<AdapterSource, number>>`                        | Maximum execution time per adapter in milliseconds. |

Logging is disabled unless `verbose` is set. When `platform` is `auto` the
library detects the runtime and chooses suitable adapters. Set `cache: false`
to disable caching.

### Adapters

| Namespace           | Description                                 |
| ------------------- | ------------------------------------------- |
| `validator`         | Validates domain syntax and supported TLDs. |
| `dns.host`          | DNS lookup using Node's resolver.           |
| `dns.ping`          | ICMP ping as a DNS fallback (Node only).    |
| `dns.doh`           | DNS-over-HTTPS lookup (Cloudflare).         |
| `rdap`              | Generic RDAP query.                         |
| `rdap.ng`           | RDAP lookup for `.ng` domains.              |
| `altstatus.domainr` | Domain status via Domainr API.              |
| `altstatus.mono`    | Domain status via Mono Domains API.         |
| `altstatus`         | Fallback when status APIs fail.             |
| `whois.lib`         | WHOIS lookup using `whois` library.         |
| `whois.api`         | WHOIS lookup via external APIs.             |

### API Keys

When running in the browser or when a WHOIS lookup is required, the library can
use paid APIs. Provide credentials via the `apiKeys` option:

```ts
check('example.com', {
  apiKeys: {
    domainr: 'DOMAINR_KEY',
    whoisfreaks: 'WHOISFREAKS_KEY',
    whoisxml: 'WHOISXML_KEY',
  },
});
```

The library does not read environment variables for credentials; all API keys
must be supplied explicitly through `apiKeys`.

## Demo

A small demo application lives in the `demo/` directory.

```bash
npm run build
npm run demo
```

Open the printed URL in your browser to test domain lookups via the bundled
library.

## Testing

```bash
npm test
```

## License

ISC
