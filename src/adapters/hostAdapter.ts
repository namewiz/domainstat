import { CheckerAdapter, DomainStatus } from '../types.js';
import { promises as dns } from 'dns';

export class HostAdapter implements CheckerAdapter {
  namespace = 'dns.host';
  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<DomainStatus> {
    const start = Date.now();
    try {
      await dns.resolve(domain, 'A');
      return {
        domain,
        availability: 'unavailable',
        source: 'dns.host',
        raw: { [this.namespace]: true },
        timestamp: Date.now(),
      };
    } catch (err: any) {
      if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
        return {
          domain,
          availability: 'available',
          source: 'dns.host',
          raw: { [this.namespace]: false },
          timestamp: Date.now(),
        };
      }
      console.log("dns.host: error: " + err.code)
      throw err;
    }
  }
}
