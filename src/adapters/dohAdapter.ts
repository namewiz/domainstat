import { CheckerAdapter, DomainStatus } from '../types.js';

export class DohAdapter implements CheckerAdapter {
  private url: string;
  constructor(url = 'https://cloudflare-dns.com/dns-query') {
    this.url = url;
  }

  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<DomainStatus> {
    const params = new URLSearchParams({ name: domain, type: 'A' });
    const res = await fetch(`${this.url}?${params.toString()}`, {
      headers: { accept: 'application/dns-json' },
      signal: opts.signal,
    });
    if (!res.ok) {
      throw new Error(`doh query failed: ${res.status}`);
    }
    const data = await res.json();
    const answers = data.Answer || [];
    const available = answers.length === 0;
    return {
      domain,
      availability: available ? 'available' : 'unavailable',
      source: 'doh',
      raw: data,
      timestamp: Date.now(),
    };
  }
}
