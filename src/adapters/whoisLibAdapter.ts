import { AdapterResponse, ParsedDomain } from '../types';
import whois from 'whois';
import { BaseCheckerAdapter } from './baseAdapter';

const DEFAULT_TIMEOUT_MS = 5000;

function lookup(domain: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    whois.lookup(domain, { timeout: timeoutMs }, (err: any, data: string) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

export class WhoisLibAdapter extends BaseCheckerAdapter {
  constructor() {
    super('whois.lib');
  }
  protected async doCheck(
    domainObj: ParsedDomain,
      opts: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      try {
        const lookupPromise = lookup(domain, timeoutMs);
        const stdout = opts.signal
          ? await Promise.race([
              lookupPromise,
              new Promise<string>((_, reject) =>
                opts.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
              ),
            ])
          : await lookupPromise;
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
          message: isTimeout
            ? `Timed out after ${timeoutMs}ms`
            : err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
