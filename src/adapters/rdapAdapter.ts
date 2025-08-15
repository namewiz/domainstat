import { CheckerAdapter, AdapterResponse, TldConfigEntry, ParsedDomain } from '../types';

const DEFAULT_TIMEOUT_MS = 3000;

export class RdapAdapter implements CheckerAdapter {
  namespace = 'rdap';
  private baseUrl: string;
  constructor(baseUrl = 'https://rdap.org/domain/') {
    this.baseUrl = baseUrl;
  }

  async check(
    domainObj: ParsedDomain,
    opts: { timeoutMs?: number; tldConfig?: TldConfigEntry } = {}
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const baseUrl = opts.tldConfig?.rdapServer || this.baseUrl;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${domain}`, { signal: ac.signal });
      const text = await res.text();
      if (res.status === 404) {
        return {
          domain,
          availability: 'available',
          source: 'rdap',
          raw: null,
        };
      }
      if (!res.ok) {
        return {
          domain,
          availability: 'unknown',
          source: 'rdap',
          raw: text,
          error: new Error(`rdap failed: ${res.status}`),
        };
      }
      const data = JSON.parse(text);
      return {
        domain,
        availability: 'unavailable',
        source: 'rdap',
        raw: data,
      };
    } catch (err: any) {
      return {
        domain,
        availability: 'unknown',
        source: 'rdap',
        raw: null,
        error: err,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
