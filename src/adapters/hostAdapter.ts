import { CheckerAdapter, DomainStatus } from '../types.js';
import { promises as dns } from 'dns';

export class HostAdapter implements CheckerAdapter {
  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<DomainStatus> {
    const start = Date.now();
    try {
      await dns.resolve(domain, 'A');
      return {
        domain,
        availability: 'unavailable',
        source: 'host',
        raw: true,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
        return {
          domain,
          availability: 'available',
          source: 'host',
          raw: false,
          timestamp: Date.now(),
        };
      }
      throw err;
    }
  }
}
