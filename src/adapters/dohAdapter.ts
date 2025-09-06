import { AdapterResponse, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

// If this host device has a WIFI DNS override, it would intefer with this adapter.
export class DohAdapter extends BaseCheckerAdapter {
  private url: string;
  constructor(url = 'https://cloudflare-dns.com/dns-query') {
    super('dns.doh');
    // TODO: Add google cloud dns as fallback - https://dns.google/resolve
    // Maybe use cloudflare for some A-K, and google for the rest?
    this.url = url;
  }

  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    try {
      const params = new URLSearchParams({ name: domain, type: 'A' });
      const res = await fetch(`${this.url}?${params.toString()}`, {
        headers: { accept: 'application/dns-json' },
        signal: opts.signal,
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        return {
          domain,
          availability: 'unknown',
          source: 'dns.doh',
          raw: null,
          error: {
            code: `HTTP_${res.status}`,
            message: `doh query failed: ${res.status}`,
            retryable,
          },
        };
      }
      const data = await res.json();
      const answers = data.Answer || [];
      const unknown = answers.length === 0;
      return {
        domain,
        availability: unknown ? 'unknown' : 'registered',
        source: 'dns.doh',
        raw: data,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      return {
        domain,
        availability: 'unknown',
        source: 'dns.doh',
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'DOH_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
