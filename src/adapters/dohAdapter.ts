import { AdapterResponse, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

const DEFAULT_TIMEOUT_MS = 1000;

// If this host device has a WIFI DNS override, it would intefer with this adapter.
export class DohAdapter extends BaseCheckerAdapter {
  private url: string;
  constructor(url = 'https://cloudflare-dns.com/dns-query') {
    super('dns.doh');
    // TODO: Add google cloud dns as fallback - https://dns.google/resolve
    // Maybe use cloudflare for some A-K, and google for the rest?
    this.url = url;
  }

  protected async doCheck(
    domainObj: ParsedDomain,
    opts: { timeoutMs?: number } = {},
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const params = new URLSearchParams({ name: domain, type: 'A' });
      const res = await fetch(`${this.url}?${params.toString()}`, {
        headers: { accept: 'application/dns-json' },
        signal: ac.signal,
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
      const available = answers.length === 0;
      return {
        domain,
        availability: available ? 'available' : 'unavailable',
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
          message: isTimeout
            ? `Timed out after ${timeoutMs}ms`
            : err.message || String(err),
          retryable: true,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
