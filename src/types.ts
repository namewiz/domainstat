export interface AdapterResponse {
  domain: string;
  availability: 'available' | 'unavailable' | 'unsupported' | 'invalid' | 'unknown';
  source:
    | 'validator'
    | 'dns.host'
    | 'dns.doh'
    | 'rdap'
    | 'whois.lib'
    | 'whois.api'
    | 'app';
  raw: any;
  error?: Error;
}

export interface DomainStatus {
  domain: string;
  availability: 'available' | 'unavailable' | 'unsupported' | 'invalid' | 'unknown';
  resolver: AdapterResponse['source'];
  raw: Record<AdapterResponse['source'], AdapterResponse['raw']>;
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
