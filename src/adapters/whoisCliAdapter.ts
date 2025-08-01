import { CheckerAdapter, AdapterResponse } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const DEFAULT_TIMEOUT_MS = 1000;

const execAsync = promisify(exec);

export class WhoisCliAdapter implements CheckerAdapter {
  namespace = 'whois.lib';
  async check(domain: string, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const cmd = `whois ${domain}`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024, timeout: timeoutMs });
      const text = stdout.toLowerCase();
      const availablePatterns = [
        'no match',
        'not found',
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
      return {
        domain,
        availability: 'unknown',
        source: 'whois.lib',
        raw: null,
        error: err,
      };
    }
  }
}
