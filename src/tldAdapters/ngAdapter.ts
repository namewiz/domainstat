import { CheckerAdapter, AdapterResponse, ParsedDomain, AdapterSource } from '../types';

const DEFAULT_TIMEOUT_MS = 3000;

export class NgAdapter implements CheckerAdapter {
  namespace: string;
  private source: AdapterSource;

  constructor(source: AdapterSource, namespace: string) {
    this.source = source;
    this.namespace = namespace;
  }

  private async query(domain: string, timeoutMs: number): Promise<{ exists: boolean; raw: any }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    // This bypasses secure connection, their cert is expired.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const res = await fetch(
        `https://whois.nic.net.ng/domains?name=${domain}&exactMatch=true`,
        { signal: ac.signal }
      );
      const data = await res.json();
      console.log(`\n\nrdap.ng: data for ${domain}: ${JSON.stringify(data)} \n\n`)
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

    // The API fails because the server is not using a proper secure connection
    return {
        domain,
        availability: 'unknown',
        source: this.source,
        raw: null,
        error: new Error("Not implemented yet"),
      };

    try {
      const { exists, raw } = await this.query(domain, timeoutMs);
      return {
        domain,
        availability: exists ? 'unavailable' : 'available',
        source: this.source,
        raw,
      };
    } catch (err: any) {
      console.error(`\n\nrdap.ng: check error ${err} \n\n`)
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

