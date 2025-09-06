import { AdapterResponse, ParsedDomain } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseCheckerAdapter } from './baseAdapter';

const execAsync = promisify(exec);

// Do not use this adapter except for liveness checks.
// Host is superior in speed, reliability and coverage.
// The nodejs implementation is not better either https://www.npmjs.com/package/net-ping.
export class PingAdapter extends BaseCheckerAdapter {
  constructor() {
    super('dns.ping');
  }

  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const cmd = `ping -c 1 ${domain}`;
    try {
      const { stdout, stderr } = await execAsync(cmd, { signal: opts.signal });
      return {
        domain,
        availability: 'registered',
        source: 'dns.ping',
        raw: stdout || stderr,
      };
    } catch (err: any) {
      // const stderr: string = err?.stderr || '';
      // if (stderr.includes('Name or service not known') || stderr.includes('unknown host')) {
      //   return {
      //     domain,
      //     availability: 'unregistered',
      //     source: 'dns.ping',
      //     raw: false,
      //   };
      // }
      const isTimeout = err?.name === 'AbortError' || (err.killed && err.signal === 'SIGTERM' && err.code === null);
      return {
        domain,
        availability: 'unknown',
        source: 'dns.ping',
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'PING_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
