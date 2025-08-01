import { CheckerAdapter, DomainStatus, TldConfigEntry } from '../types.js';

export class RdapAdapter implements CheckerAdapter {
  namespace = 'rdap';
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
    const text = await res.text();
    if(text) {
      console.log('\n\nrdap.text', domain, text);
    }
    if (res.status === 404) {
      console.log("rdap.404: ", domain, text )
      return {
        domain,
        availability: 'available',
        source: 'rdap',
        raw: { [this.namespace]: null },
        timestamp: Date.now(),
      };
    }
    if (!res.ok) {
      throw new Error(`rdap failed: ${res.status}`);
    }
    const data = JSON.parse(text);
    return {
      domain,
      availability: 'unavailable',
      source: 'rdap',
      raw: { [this.namespace]: data },
      timestamp: Date.now(),
    };
  }
}
