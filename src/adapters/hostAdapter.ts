import { AdapterResponse, ParsedDomain } from '../types';
import { promises as dns } from 'dns';
import { BaseCheckerAdapter } from './baseAdapter';

export class HostAdapter extends BaseCheckerAdapter {
  constructor() {
    super('dns.host');
  }
  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const abortPromise =
      opts.signal &&
      new Promise((_, reject) =>
        opts.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      );
    try {
      const raw = await (abortPromise
        ? Promise.race([dns.resolve(domain, 'A'), abortPromise])
        : dns.resolve(domain, 'A'));
      return {
        domain,
        availability: 'unavailable',
        source: 'dns.host',
        raw,
      };
    } catch (err: any) {
      // if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      //   return {
      //     domain,
      //     availability: 'available',
      //     source: 'dns.host',
      //     raw: false,
      //   };
      // }
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

      const isTimeout =
        err?.name === 'AbortError' ||
        err?.message === 'timeout' ||
        (err.killed && err.signal === 'SIGTERM' && err.code === null);
      return {
        domain,
        availability: 'unknown',
        source: 'dns.host',
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'DNS_HOST_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
