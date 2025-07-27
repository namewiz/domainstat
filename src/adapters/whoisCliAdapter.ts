import { CheckerAdapter, DomainStatus } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WhoisCliAdapter implements CheckerAdapter {
  async check(domain: string): Promise<DomainStatus> {
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
      source: 'whois-lib',
      raw: stdout,
      timestamp: Date.now(),
    };
  }
}
