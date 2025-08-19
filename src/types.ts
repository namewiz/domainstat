import type { ParseResult } from 'tldts';

export type Availability =
  | 'available'
  | 'unavailable'
  | 'unsupported'
  | 'invalid'
  | 'unknown';

export type AdapterSource =
  | 'validator'
  | 'dns.host'
  | 'dns.ping'
  | 'dns.doh'
  | 'rdap'
  | 'whois.lib'
  | 'whois.api'
  | 'app';

export enum Platform {
  AUTO = 'auto',
  NODE = 'node',
  BROWSER = 'browser',
}

export interface AdapterResponse {
  domain: string;
  availability: Availability;
  fineStatus?:
    | 'expiring_soon'
    | 'registered_not_in_use'
    | 'premium'
    | 'for_sale'
    | 'reserved';
  source: AdapterSource;
  raw: any;
  error?: Error;
}

export interface DomainStatus {
  domain: string;
  availability: Availability;
  fineStatus?:
    | 'expiring_soon'
    | 'registered_not_in_use'
    | 'premium'
    | 'for_sale'
    | 'reserved';
  resolver: AdapterSource;
  /**
   * Raw responses from each adapter keyed by its namespace.
   */
  raw: Record<string, any>;
  error?: Error;
}

export type ParsedDomain = ParseResult;

export interface CheckerAdapter {
  /** Unique identifier used to store results for this adapter */
  namespace: string;
  check(
    domainObj: ParsedDomain,
    opts?: { timeoutMs?: number; tldConfig?: TldConfigEntry; cache?: boolean }
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
   * Platform to run adapters on. Defaults to auto-detect based on environment.
   */
  platform?: Platform;
  /**
   * Enable or disable caching. Caching is enabled by default.
   */
  cache?: boolean;
}
