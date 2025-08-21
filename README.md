# Fast Domain Status

Fast Domain Status is a lightweight TypeScript/JavaScript library for checking
whether domain names are available for registration. It queries several data
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
import { check, checkBatch, checkBatchStream } from 'fast-domain-status';

const res = await check('example.com');
// { domain: 'example.com', availability: 'unavailable', resolver: 'dns.host', raw: {...} }

const batch = await checkBatch(['example.com', 'openai.org']);

for await (const item of checkBatchStream(['foo.dev', 'bar.io'])) {
  console.log(item.domain, item.availability);
}
```

The `availability` field can be `available`, `unavailable`, `unsupported`,
`invalid` or `unknown`. The `resolver` indicates which adapter produced the
result and `raw` contains the raw responses from each adapter.

## API

### `check(domain, options?)`
Checks a single domain and resolves to a `DomainStatus` object.

### `checkBatch(domains, options?)`
Checks multiple domains concurrently and resolves to an array of
`DomainStatus` objects.

### `checkBatchStream(domains, options?)`
Returns an async generator yielding `DomainStatus` for each domain as soon as it
finishes.

### Options

```ts
interface CheckOptions {
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  verbose?: boolean;
  concurrency?: number; // used by batch helpers
  only?: string[];       // run adapters whose namespace starts with these
  skip?: string[];       // skip adapters whose namespace starts with these
  tldConfig?: TldConfigEntry;
  platform?: 'auto' | 'node' | 'browser';
  cache?: boolean;      // enable or disable caching (default true)
  apiKeys?: {
    domainr?: string;
    whoisfreaks?: string;
    whoisxml?: string;
  };
}
```

Logging is disabled unless `verbose` is set. When `platform` is `auto` the
library detects the runtime and chooses suitable adapters. Set `cache: false`
to disable caching.

### API Keys

When running in the browser or when a WHOIS lookup is required, the library can
use paid APIs. Provide credentials via the `apiKeys` option:

```ts
check('example.com', {
  apiKeys: {
    domainr: 'DOMAINR_KEY',
    whoisfreaks: 'WHOISFREAKS_KEY',
    whoisxml: 'WHOISXML_KEY'
  }
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

