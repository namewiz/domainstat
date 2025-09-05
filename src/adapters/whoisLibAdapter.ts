import { AdapterResponse, ParsedDomain } from '../types';
import whois from 'whois';
import { BaseCheckerAdapter } from './baseAdapter';

function lookup(domain: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const req: any = whois.lookup(domain, {}, (err: any, data: string) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
    if (signal) {
      signal.addEventListener('abort', () => {
        try {
          req?.abort?.();
        } catch {
          // ignore
        }
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }
  });
}

export class WhoisLibAdapter extends BaseCheckerAdapter {
  constructor() {
    super('whois.lib');
  }
  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    try {
      const stdout = await lookup(domain, opts.signal);
      const text = stdout.toLowerCase();
      if (text.includes(`tld is not supported`)) {
        return {
          domain,
          availability: 'unknown',
          source: 'whois.lib',
          raw: text,
          error: {
            code: 'UNSUPPORTED_TLD',
            message: `TLD '${domainObj.publicSuffix}' is not supported for whois`,
            retryable: false,
          },
        };
      }
      const availablePatterns = [
        'no match',
        'not found',
        'no object found',
        'no data found',
        'no entries found',
        'status: available',
      ];
      const isAvailable = availablePatterns.some((p) => text.includes(p));
      return {
        domain,
        availability: isAvailable ? 'available' : 'unavailable',
        source: 'whois.lib',
        raw: stdout,
      };
    } catch (err: any) {
      const isTimeout =
        err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message));
      return {
        domain,
        availability: 'unknown',
        source: 'whois.lib',
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'WHOIS_LIB_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
