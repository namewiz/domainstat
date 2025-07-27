import { DomainStatus, TldConfigEntry } from './types.js';
import { HostAdapter } from './adapters/hostAdapter.js';
import { DohAdapter } from './adapters/dohAdapter.js';
import { RdapAdapter } from './adapters/rdapAdapter.js';
import { WhoisCliAdapter } from './adapters/whoisCliAdapter.js';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter.js';
import { Cache } from './cache.js';
import { validateDomain } from './validator.js';

const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

let cache = new Cache();
let logger = console;
let numWorkers = 100;


export function configure(opts: { cache?: Cache; logger?: Console; concurrency?: number; }) {
  if (opts.cache) cache = opts.cache;
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

function ttlFor(status: DomainStatus['availability']) {
  if (status === 'available') return 5 * 60 * 1000;
  if (status === 'unavailable') return 60 * 60 * 1000;
  return 60 * 1000;
}

export async function check(domain: string, opts: { tldConfig?: TldConfigEntry } = {}): Promise<DomainStatus> {
  logger.info('domain.check.start', { domain });
  const validated = validateDomain(domain);
  if (validated.status) {
    logger.info('domain.check.end', { domain, status: validated.status.availability, source: 'validator' });
    return validated.status;
  }
  opts = { ...opts, tldConfig: { ...opts.tldConfig, ...validated.config } };
  const key = domain.toLowerCase();
  const cached = cache.get<DomainStatus>(key);
  if (cached) {
    logger.info('cache.hit', { domain });
    return cached;
  }

  const ac = new AbortController();

  try {
    let dnsResult: DomainStatus | null = null;
    try {
      dnsResult = isNode
        ? await host.check(domain, { signal: ac.signal })
        : await doh.check(domain, { signal: ac.signal });
      ac.abort();
    } catch (err) {
      logger.warn('dns.failed', { domain, error: String(err) });
    }

    if (dnsResult && dnsResult.availability === 'unavailable') {
      cache.set(key, dnsResult, ttlFor(dnsResult.availability));
      logger.info('domain.check.end', { domain, status: dnsResult.availability, source: dnsResult.source });
      return dnsResult;
    }

    if (!opts.tldConfig?.skipRdap) {
      try {
        const rdapRes = await rdap.check(domain, { tldConfig: opts.tldConfig });
        cache.set(key, rdapRes, ttlFor(rdapRes.availability));
        logger.info('domain.check.end', { domain, status: rdapRes.availability, source: rdapRes.source });
        return rdapRes;
      } catch (err) {
        logger.warn('rdap.failed', { domain, error: String(err) });
      }
    }

    let whoisRes: DomainStatus | null = null;
    if (isNode) {
      try {
        whoisRes = await whoisCli.check(domain);
      } catch (err) {
        logger.warn('whois-lib.failed', { domain, error: String(err) });
      }
    } else {
      try {
        whoisRes = await whoisApi.check(domain);
      } catch (err) {
        logger.warn('whois-api.failed', { domain, error: String(err) });
      }
    }

    if (whoisRes) {
      cache.set(key, whoisRes, ttlFor(whoisRes.availability));
      logger.info('domain.check.end', { domain, status: whoisRes.availability, source: whoisRes.source });
      return whoisRes;
    }

    const result: DomainStatus = {
      domain,
      availability: 'unknown',
      source: 'app',
      raw: null,
      timestamp: Date.now(),
    };
    cache.set(key, result, ttlFor(result.availability));
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
