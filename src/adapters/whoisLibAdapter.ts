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
    opts: { timeoutMs?: number } = {},
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const stdout = await lookup(domain, timeoutMs);
      const text = stdout.toLowerCase();
      if (text.includes(`tld is not supported`)) {
        return {
          domain,
          availability: 'unknown',
          source: 'whois.lib',
          raw: text,
          error: new Error(`TLD '${domainObj.publicSuffix}' is not supported for whois`),
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
      const isTimeout = err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message));
      return {
        domain,
        availability: 'unknown',
        source: 'whois.lib',
        raw: null,
        error: isTimeout ? new Error(`Timed out after ${timeoutMs}ms`) : err,
      };
    }
  }
}
