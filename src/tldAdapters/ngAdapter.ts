import { AdapterResponse, ParsedDomain, AdapterSource } from '../types';
import { BaseCheckerAdapter } from '../adapters/baseAdapter';

const DEFAULT_TIMEOUT_MS = 3000;

export class NgAdapter extends BaseCheckerAdapter {
  private source: AdapterSource;

  constructor(source: AdapterSource, namespace: AdapterSource) {
    super(namespace);
    this.source = source;
  }

  private async query(domain: string, timeoutMs: number): Promise<{ exists: boolean; raw: any }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    // This bypasses secure connection, their cert is expired.
    // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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

  protected async doCheck(
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
        source: this.namespace,
        raw,
      };
    } catch (err: any) {
      const isTimeout = err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message));
      return {
        domain,
        availability: 'unknown',
        source: this.namespace,
        raw: null,
        error: isTimeout ? new Error(`Timed out after ${timeoutMs}ms`) : err,
      };
    }
  }
}

