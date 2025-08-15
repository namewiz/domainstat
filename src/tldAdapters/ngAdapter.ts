import { CheckerAdapter, AdapterResponse, ParsedDomain, AdapterSource } from '../types';

const DEFAULT_TIMEOUT_MS = 600;

export class NgRdapWhoisAdapter implements CheckerAdapter {
  namespace: string;
  private source: AdapterSource;

  constructor(source: AdapterSource, namespace: string) {
    this.source = source;
    this.namespace = namespace;
  }

  private async query(domain: string, timeoutMs: number): Promise<{ exists: boolean; raw: any }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(
        `https://whois.nic.net.ng/domains?name=${domain}&exactMatch=true`,
        { signal: ac.signal }
      );
      const data = await res.json();
      const exists = Array.isArray(data.domainSearchResults) && data.domainSearchResults.length > 0;
      return { exists, raw: data };
    } finally {
      clearTimeout(timer);
    }
  }

  async check(
    domainObj: ParsedDomain,
    opts: { timeoutMs?: number } = {}
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const { exists, raw } = await this.query(domain, timeoutMs);
      return {
        domain,
        availability: exists ? 'unavailable' : 'available',
        source: this.source,
        raw,
      };
    } catch (err: any) {
      return {
        domain,
        availability: 'unknown',
        source: this.source,
        raw: null,
        error: err,
      };
    }
  }
}

