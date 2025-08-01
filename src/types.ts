export interface DomainStatus {
  domain: string;
  availability: 'available' | 'unavailable' | 'unsupported' | 'invalid' | 'unknown';
  fineStatus?:
    | 'expiring_soon'
    | 'registered_not_in_use'
    | 'premium'
    | 'for_sale'
    | 'reserved';
  source:
    | 'validator'
    | 'dns.host'
    | 'dns.doh'
    | 'rdap'
    | 'whois.lib'
    | 'whois.api'
    | 'app';
  /**
   * Raw responses from each adapter keyed by its namespace.
   */
  raw: Record<string, any>;
  timestamp: number;
}

export interface CheckerAdapter {
  /** Unique identifier used to store results for this adapter */
  namespace: string;
  check(
    domain: string,
    opts?: { signal?: AbortSignal; tldConfig?: TldConfigEntry }
  ): Promise<DomainStatus>;
}

export interface TldConfigEntry {
  rdapServer?: string;
  skipRdap?: boolean;
}
