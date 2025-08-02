import { DomainStatus, TldConfigEntry, AdapterResponse, CheckOptions } from './types.js';
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

const host = new HostAdapter();
const doh = new DohAdapter();
const rdap = new RdapAdapter();
const whoisCli = new WhoisCliAdapter();
const whoisApi = new WhoisApiAdapter(
  typeof process !== 'undefined' ? (process.env.WHOISFREAKS_API_KEY as string | undefined) : undefined,
  typeof process !== 'undefined' ? (process.env.WHOISXML_API_KEY as string | undefined) : undefined
);

const noopLogger: Pick<Console, 'info' | 'warn' | 'error'> = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function adapterAllowed(ns: string, opts: CheckOptions): boolean {
  if (opts.only && !opts.only.some((p) => ns.startsWith(p))) {
    return false;
  }
  if (opts.skip && opts.skip.some((p) => ns.startsWith(p))) {
    return false;
  }
  return true;
}

export async function check(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose
    ? opts.logger ?? console
    : noopLogger;
  logger.info('domain.check.start', { domain });
  const raw: Record<string, any> = {};
  const validated = validateDomain(domain);
  if (validated.error) {
    logger.error("validation error: ", validated.error.message)
    logger.info('domain.check.end', { domain, status: validated.availability, resolver: 'validator', error: validated.error.message });
    return validated;
  }

  try {
    let finalError: Error | undefined;

    let dnsResult: AdapterResponse | null = null;
    const dnsAdapter = isNode ? host : doh;
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      try {
        dnsResult = await dnsAdapter.check(domain);
      } catch (err: any) {
        dnsResult = {
          domain,
          availability: 'unknown',
          source: dnsAdapter.namespace as any,
          raw: null,
          error: err,
        };
      }
      raw[dnsAdapter.namespace] = dnsResult.raw;
      if (dnsResult.error) {
        logger.warn('dns.failed', { domain, error: String(dnsResult.error) });
        finalError = dnsResult.error;
      }
    }

    if (dnsResult && !dnsResult.error && dnsResult.availability === 'unavailable') {
      const result: DomainStatus = {
        domain,
        availability: dnsResult.availability,
        resolver: dnsResult.source,
        raw,
        error: undefined,
      };
      logger.info('domain.check.end', { domain, status: result.availability, resolver: result.resolver });
      return result;
    }

    if (!opts.tldConfig?.skipRdap && adapterAllowed(rdap.namespace, opts)) {
      const rdapRes = await rdap.check(domain, { tldConfig: opts.tldConfig });
      raw[rdap.namespace] = rdapRes.raw;
      if (rdapRes.error) {
        logger.warn('rdap.failed', { domain, error: String(rdapRes.error) });
        finalError = rdapRes.error;
      } else {
        const result: DomainStatus = {
          domain,
          availability: rdapRes.availability,
          resolver: rdapRes.source,
          raw,
          error: undefined,
        };
        logger.info('domain.check.end', { domain, status: result.availability, resolver: result.resolver });
        return result;
      }
    }

    let whoisRes: AdapterResponse | null = null;
    const whoisAdapter = isNode ? whoisCli : whoisApi;
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      whoisRes = await whoisAdapter.check(domain);
      raw[whoisAdapter.namespace] = whoisRes.raw;
      if (whoisRes.error) {
        logger.warn(isNode ? 'whois.lib.failed' : 'whois.api.failed', { domain, error: String(whoisRes.error) });
        finalError = whoisRes.error;
      } else {
        const result: DomainStatus = {
          domain,
          availability: whoisRes.availability,
          resolver: whoisRes.source,
          raw,
          error: undefined,
        };
        logger.info('domain.check.end', { domain, status: result.availability, resolver: result.resolver });
        return result;
      }
    }

    const result: DomainStatus = {
      domain,
      availability: 'unknown',
      resolver: 'app',
      raw,
      error: finalError,
    };
    logger.info('domain.check.end', { domain, status: result.availability, resolver: result.resolver });
    return result;
  } finally {
    // nothing to cleanup
  }
}

export async function checkBatch(domains: string[], opts: CheckOptions = {}): Promise<DomainStatus[]> {
  const results: DomainStatus[] = [];
  const queue = [...domains];
  const workers: Promise<void>[] = [];

  // Each worker pulls a domain from the queue and processes until the queue is empty.
  const worker = async () => {
    while (queue.length) {
      const d = queue.shift();
      if (!d) break;
      const res = await check(d, opts);
      results[domains.indexOf(d)] = res;
    }
  };

  const numWorkers = opts.concurrency ?? 10;
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export type { DomainStatus } from './types.js';
