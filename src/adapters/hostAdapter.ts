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
        source: this.namespace,
        raw: true,
      };
    } catch (err: any) {
      if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
        return {
          domain,
          availability: 'available',
          source: this.namespace,
          raw: false,
        };
      }
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
