import { CheckerAdapter, AdapterResponse } from '../types.js';
import { promises as dns } from 'dns';

export class HostAdapter implements CheckerAdapter {
  namespace = 'dns.host';
  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    try {
      await dns.resolve(domain, 'A');
      return {
        domain,
        availability: 'unavailable',
        source: 'dns.host',
        raw: true,
      };
    } catch (err: any) {
      if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
        return {
          domain,
          availability: 'available',
          source: 'dns.host',
          raw: false,
        };
      }
      return {
        domain,
        availability: 'unknown',
        source: 'dns.host',
        raw: null,
        error: err,
      };
    }
  }
}
