import { CheckerAdapter, AdapterResponse, ParsedDomain } from '../types';
import { promises as dns } from 'dns';

const DEFAULT_TIMEOUT_MS = 1000;

export class HostAdapter implements CheckerAdapter {
  namespace = 'dns.host';
  async check(domainObj: ParsedDomain, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    );
    try {
      const raw = await Promise.race([dns.resolve(domain, 'A'), timer]);
      return {
        domain,
        availability: 'unavailable',
        source: 'dns.host',
        raw,
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
      // TODO: This is only the case for some TLDs, limit to TLDs.
      // E.g. for .lc, timeout => available.
      // if(err.code === 'ESERVFAIL' || err.code === 'ETIMEOUT') {
      //   return {
      //     domain,
      //     availability: 'unavailable',
      //     source: 'dns.host',
      //     raw: false,
      //   };
      // }

      const isTimeout = err.killed && err.signal === 'SIGTERM' && err.code === null;
      return {
        domain,
        availability: 'unknown',
        source: 'dns.host',
        raw: null,
        error: isTimeout
          ? new Error(`Timed out after ${timeoutMs}ms`)
          : err,
      };
    }
  }
}
