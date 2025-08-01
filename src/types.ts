
export type Availability =
  | 'available'
  | 'unavailable'
  | 'unsupported'
  | 'invalid'
  | 'unknown';

export type AdapterSource =
  | 'validator'
  | 'dns.host'
  | 'dns.doh'
  | 'rdap'
  | 'whois.lib'
  | 'whois.api'
  | 'app';

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

export interface CheckerAdapter {
  /** Unique identifier used to store results for this adapter */
  namespace: string;
  check(
    domain: string,
    opts?: { signal?: AbortSignal; tldConfig?: TldConfigEntry }
  ): Promise<AdapterResponse>;
}

export interface TldConfigEntry {
  rdapServer?: string;
  skipRdap?: boolean;
}
