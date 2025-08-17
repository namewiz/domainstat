import { CheckerAdapter, AdapterResponse, ParsedDomain } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_MS = 1000;

// Do not use this adapter except for liveness checks.
// Host is superior in speed, reliability and coverage.
// The nodejs implementation is not better either https://www.npmjs.com/package/net-ping.
export class PingAdapter implements CheckerAdapter {
  namespace = 'dns.ping';

  async check(domainObj: ParsedDomain, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const cmd = `ping -c 1 ${domain}`;
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs });
      return {
        domain,
        availability: 'unavailable',
        source: 'dns.ping',
        raw: stdout || stderr,
      };
    } catch (err: any) {
      const stderr: string = err?.stderr || '';
      if (stderr.includes('Name or service not known') || stderr.includes('unknown host')) {
        return {
          domain,
          availability: 'available',
          source: 'dns.ping',
          raw: false,
        };
      }
      const isTimeout = err.killed && err.signal === 'SIGTERM' && err.code === null;
      return {
        domain,
        availability: 'unknown',
        source: 'dns.ping',
        raw: null,
        error: isTimeout ? new Error(`Timed out after ${timeoutMs}ms`) : err,
      };
    }
  }
}

