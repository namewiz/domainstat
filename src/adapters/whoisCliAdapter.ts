import { CheckerAdapter, AdapterResponse, ParsedDomain } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const DEFAULT_TIMEOUT_MS = 5000;

const execAsync = promisify(exec);

export class WhoisCliAdapter implements CheckerAdapter {
  namespace = 'whois.lib';
  async check(domainObj: ParsedDomain, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const cmd = `whois ${domain}`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024, timeout: timeoutMs });
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
      // TODO: Investigate the command failing with undefined error.
      const isTimeout = err.killed && err.signal === 'SIGTERM' && err.code === null;
      return {
        domain,
        availability: 'unknown',
        source: 'whois.lib',
        raw: null,
        error: isTimeout
          ? new Error(`Timed out after ${timeoutMs}ms`)
          : err,
      };
    }
  }
}
