import { CheckerAdapter, AdapterResponse } from '../types.js';

export class DohAdapter implements CheckerAdapter {
  namespace = 'dns.doh';
  private url: string;
  constructor(url = 'https://cloudflare-dns.com/dns-query') {
    this.url = url;
  }

  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const params = new URLSearchParams({ name: domain, type: 'A' });
    try {
      const res = await fetch(`${this.url}?${params.toString()}`, {
        headers: { accept: 'application/dns-json' },
        signal: opts.signal,
      });
      if (!res.ok) {
        return {
          domain,
          availability: 'unknown',
          source: this.namespace,
          raw: null,
          error: new Error(`doh query failed: ${res.status}`),
        };
      }
      const data = await res.json();
      const answers = data.Answer || [];
      const available = answers.length === 0;
      return {
        domain,
        availability: available ? 'available' : 'unavailable',
        source: this.namespace,
        raw: data,
      };
    } catch (err: any) {
      return {
        domain,
        availability: 'unknown',
        source: this.namespace,
        raw: null,
        error: err,
      };
    }
  }
}
