export interface DomainStatus {
  domain: string;
  availability: 'available' | 'unavailable' | 'unsupported';
  fineStatus?:
    | 'expiring_soon'
    | 'registered_not_in_use'
    | 'premium'
    | 'for_sale'
    | 'reserved';
  source: 'host' | 'doh' | 'rdap' | 'whois-lib' | 'whois-api';
  raw: any;
  timestamp: number;
}

export interface CheckerAdapter {
  check(
    domain: string,
    opts?: { signal?: AbortSignal; tldConfig?: TldConfigEntry }
  ): Promise<DomainStatus>;
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

export interface Logger {
  info(msg: string, meta?: object): void;
  warn(msg: string, meta?: object): void;
  error(msg: string, meta?: object): void;
  debug(msg: string, meta?: object): void;
}

export interface TldConfigEntry {
  rdapServer?: string;
  skipRdap?: boolean;
}
