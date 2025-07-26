import { CheckerAdapter, DomainStatus, TldConfigEntry } from '../types.js';

export class RdapAdapter implements CheckerAdapter {
  private baseUrl: string;
  constructor(baseUrl = 'https://rdap.org/domain/') {
    this.baseUrl = baseUrl;
  }

  async check(
    domain: string,
    opts: { signal?: AbortSignal; tldConfig?: TldConfigEntry } = {}
  ): Promise<DomainStatus> {
    const baseUrl = opts.tldConfig?.rdapServer || this.baseUrl;
    const res = await fetch(`${baseUrl}${domain}`, { signal: opts.signal });
    if (res.status === 404) {
      return {
        domain,
        availability: 'available',
        source: 'rdap',
        raw: null,
        timestamp: Date.now(),
      };
    }
    if (!res.ok) {
      throw new Error(`rdap failed: ${res.status}`);
    }
    const data = await res.json();
    return {
      domain,
      availability: 'unavailable',
      source: 'rdap',
      raw: data,
      timestamp: Date.now(),
    };
  }
}
