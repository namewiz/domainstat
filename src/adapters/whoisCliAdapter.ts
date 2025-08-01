import { CheckerAdapter, AdapterResponse } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WhoisCliAdapter implements CheckerAdapter {
  namespace = 'whois.lib';
  async check(domain: string): Promise<AdapterResponse> {
    try {
      const cmd = `whois ${domain}`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
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
