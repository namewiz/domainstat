import { DomainStatus, TldConfigEntry } from './types.js';
import { HostAdapter } from './adapters/hostAdapter.js';
import { DohAdapter } from './adapters/dohAdapter.js';
import { RdapAdapter } from './adapters/rdapAdapter.js';
import { WhoisCliAdapter } from './adapters/whoisCliAdapter.js';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter.js';
import { validateDomain } from './validator.js';

const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

let logger = console;
let numWorkers = 10;


export function configure(opts: { logger?: Console; concurrency?: number; }) {
  if (opts.logger) logger = opts.logger;
  if (opts.concurrency) numWorkers = opts.concurrency;
}

const host = new HostAdapter();
const doh = new DohAdapter();
const rdap = new RdapAdapter();
const whoisCli = new WhoisCliAdapter();
const whoisApi = new WhoisApiAdapter(
  typeof process !== 'undefined' ? (process.env.WHOISFREAKS_API_KEY as string | undefined) : undefined,
  typeof process !== 'undefined' ? (process.env.WHOISXML_API_KEY as string | undefined) : undefined
);

export async function check(domain: string, opts: { tldConfig?: TldConfigEntry } = {}): Promise<DomainStatus> {
  logger.info('domain.check.start', { domain });
  const raw: Record<string, any> = {};
  const validated = validateDomain(domain);
  if (validated.status) {
    Object.assign(raw, validated.status.raw);
    const result: DomainStatus = {
      ...validated.status,
      raw,
    };
    logger.info('domain.check.end', { domain, status: validated.status.availability, source: 'validator' });
    return result;
  }
  opts = { ...opts, tldConfig: { ...opts.tldConfig, ...validated.config } };

  const ac = new AbortController();

  try {
    let dnsResult: DomainStatus | null = null;
    try {
      dnsResult = isNode
        ? await host.check(domain, { signal: ac.signal })
        : await doh.check(domain, { signal: ac.signal });
      Object.assign(raw, dnsResult.raw);
      ac.abort();
    } catch (err) {
      logger.warn('dns.failed', { domain, error: String(err) });
    }

    if (dnsResult && dnsResult.availability === 'unavailable') {
      const result = { ...dnsResult, raw };
      logger.info('domain.check.end', { domain, status: result.availability, source: result.source });
      return result;
    }

    if (!opts.tldConfig?.skipRdap) {
      try {
        const rdapRes = await rdap.check(domain, { tldConfig: opts.tldConfig });
        Object.assign(raw, rdapRes.raw);
        const result = { ...rdapRes, raw };
        logger.info('domain.check.end', { domain, status: result.availability, source: result.source });
        return result;
      } catch (err) {
        logger.warn('rdap.failed', { domain, error: String(err) });
      }
    }

    let whoisRes: DomainStatus | null = null;
    if (isNode) {
      try {
        whoisRes = await whoisCli.check(domain);
        Object.assign(raw, whoisRes.raw);
      } catch (err) {
        logger.warn('whois.lib.failed', { domain, error: String(err) });
      }
    } else {
      try {
        whoisRes = await whoisApi.check(domain);
        Object.assign(raw, whoisRes.raw);
      } catch (err) {
        logger.warn('whois.api.failed', { domain, error: String(err) });
      }
    }

    if (whoisRes) {
      const result = { ...whoisRes, raw };
      logger.info('domain.check.end', { domain, status: result.availability, source: result.source });
      return result;
    }

    const result: DomainStatus = {
      domain,
      availability: 'unknown',
      source: 'app',
      raw,
      timestamp: Date.now(),
    };
    logger.info('domain.check.end', { domain, status: result.availability, source: result.source });
    return result;
  } finally {
    ac.abort();
  }
}

export async function checkBatch(domains: string[]): Promise<DomainStatus[]> {
  const results: DomainStatus[] = [];
  const queue = [...domains];
  const workers: Promise<void>[] = [];

  // Each worker pulls a domain from the queue and processes until the queue is empty.
  const worker = async () => {
    while (queue.length) {
      const d = queue.shift();
      if (!d) break;
      const res = await check(d);
      results[domains.indexOf(d)] = res;
    }
  };

  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export type { DomainStatus } from './types.js';
