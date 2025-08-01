import { CheckerAdapter, AdapterResponse } from '../types.js';
import { promises as dns } from 'dns';

const DEFAULT_TIMEOUT_MS = 3000;

export class HostAdapter implements CheckerAdapter {
  namespace = 'dns.host';
  async check(domain: string, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    );
    try {
      await Promise.race([dns.resolve(domain, 'A'), timer]);
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
