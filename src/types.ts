import type { ParseResult } from 'tldts';

export type Availability = 'unregistered' | 'registered' | 'unsupported' | 'invalid' | 'unknown';

export type AdapterSource =
  | 'validator'
  | 'dns.doh'
  | 'rdap'
  | 'rdap.ng'
  | 'altstatus'
  | 'altstatus.domainr'
  | 'altstatus.mono'
  | 'whois.api'
  | 'app';

// Platform option and Node-specific utils were removed to ensure consistent
// behavior across environments and reduce complexity.

export interface AdapterError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AdapterResponse {
  domain: string;
  availability: Availability;
  fineStatus?: 'expiring_soon' | 'registered_not_in_use' | 'premium' | 'for_sale' | 'reserved';
  source: AdapterSource;
  raw: any;
  /**
   * Time taken for the adapter to produce this response in milliseconds.
   */
  latency?: number;
  error?: AdapterError;
}

export interface DomainStatus {
  domain: string;
  availability: Availability;
  fineStatus?: 'expiring_soon' | 'registered_not_in_use' | 'premium' | 'for_sale' | 'reserved';
  resolver: AdapterSource;
  /**
   * Raw responses from each adapter keyed by its namespace.
   */
  raw: Record<string, any>;
  /**
   * Latency (in ms) reported by each adapter keyed by its namespace.
   */
  latencies: Record<string, number>;
  error?: AdapterError;
}

export type ParsedDomain = ParseResult;

export interface CheckerAdapter {
  /** Unique identifier used to store results for this adapter */
  namespace: string;
  check(
    domainObj: ParsedDomain,
    opts?: { tldConfig?: TldConfigEntry; signal?: AbortSignal },
  ): Promise<AdapterResponse>;
}

export interface TldConfigEntry {
  rdapServer?: string;
  skipRdap?: boolean;
}

export interface CheckOptions {
  logger?: Console;
  verbose?: boolean;
  concurrency?: number;
  /** Only run adapters whose namespace starts with one of these prefixes */
  only?: string[];
  /** Skip adapters whose namespace starts with one of these prefixes */
  skip?: string[];
  tldConfig?: TldConfigEntry;
  /**
   * Enable or disable caching. Caching is enabled by default.
   */
  cache?: boolean;
  /**
   * API keys for third-party services.
   */
  apiKeys?: {
    domainr?: string;
    whoisfreaks?: string;
    whoisxml?: string;
  };
  /** When true, run adapters in parallel */
  burstMode?: boolean;
  /**
   * Allotted latency before launching the next adapter in serial mode, keyed by adapter namespace.
   * Defaults to 200ms when not specified for an adapter.
   */
  allottedLatency?: Partial<Record<AdapterSource, number>>;
  /**
   * Maximum execution time per adapter in milliseconds. When exceeded, the adapter is aborted.
   * Provide values keyed by adapter namespace. If not specified, defaults may apply.
   */
  timeoutConfig?: Partial<Record<AdapterSource, number>>;
}
