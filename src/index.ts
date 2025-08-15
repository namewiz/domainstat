import {
  DomainStatus,
  AdapterResponse,
  CheckOptions,
  Platform,
} from './types';
export type { DomainStatus } from './types';
import { HostAdapter } from './adapters/hostAdapter';
import { DohAdapter } from './adapters/dohAdapter';
import { RdapAdapter } from './adapters/rdapAdapter';
import { WhoisCliAdapter } from './adapters/whoisCliAdapter';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter';
import { validateDomain } from './validator';
import { parse } from 'tldts';
import { getTldAdapter } from './tldAdapters';

const MAX_CONCURRENCY = 10;
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

function detectNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

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
  const platform = opts.platform ?? Platform.AUTO;
  const isNode = platform === Platform.AUTO ? detectNode() : platform === Platform.NODE;
  const parsed = parse(domain.trim().toLowerCase());
  const validated = validateDomain(parsed);
  if (validated.error) {
    logger.error('validation error: ', validated.error.message);
    logger.info('domain.check.end', {
      domain: validated.domain,
      status: validated.availability,
      resolver: 'validator',
      error: validated.error.message,
    });
    return validated;
  }
  const name = parsed.domain!;
  const tldAdapter = getTldAdapter(parsed.publicSuffix);

  try {
    let finalError: Error | undefined;

    let dnsResult: AdapterResponse | null = null;
    const dnsAdapter = tldAdapter?.dns ?? (isNode ? host : doh);
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      try {
        dnsResult = await dnsAdapter.check(parsed);
      } catch (err: any) {
        dnsResult = {
          domain: name,
          availability: 'unknown',
          source: dnsAdapter.namespace as any,
          raw: null,
          error: err,
        };
      }
      raw[dnsAdapter.namespace] = dnsResult.raw;
      if (dnsResult.error) {
        logger.warn('dns.failed', { domain: name, error: String(dnsResult.error) });
        finalError = dnsResult.error;
      }
    }

    if (dnsResult && !dnsResult.error && dnsResult.availability === 'unavailable') {
      const result: DomainStatus = {
        domain: name,
        availability: dnsResult.availability,
        resolver: dnsResult.source,
        raw,
        error: undefined,
      };
      logger.info('domain.check.end', { domain: name, status: result.availability, resolver: result.resolver });
      return result;
    }

    const rdapAdapter = tldAdapter?.rdap ?? rdap;
    if (!opts.tldConfig?.skipRdap && adapterAllowed(rdapAdapter.namespace, opts)) {
      const rdapRes = await rdapAdapter.check(parsed, { tldConfig: opts.tldConfig });
      raw[rdapAdapter.namespace] = rdapRes.raw;
      if (rdapRes.error) {
        logger.warn('rdap.failed', { domain: name, error: String(rdapRes.error) });
        finalError = rdapRes.error;
      } else {
        const result: DomainStatus = {
          domain: name,
          availability: rdapRes.availability,
          resolver: rdapRes.source,
          raw,
          error: undefined,
        };
        logger.info('domain.check.end', { domain: name, status: result.availability, resolver: result.resolver });
        return result;
      }
    }

    let whoisRes: AdapterResponse | null = null;
    const whoisAdapter = tldAdapter?.whois ?? (isNode ? whoisCli : whoisApi);
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      whoisRes = await whoisAdapter.check(parsed);
      raw[whoisAdapter.namespace] = whoisRes.raw;
      if (whoisRes.error) {
        logger.warn(
          tldAdapter?.whois ? 'whois.tld.failed' : isNode ? 'whois.lib.failed' : 'whois.api.failed',
          { domain: name, error: String(whoisRes.error) }
        );
        finalError = whoisRes.error;
      } else {
        const result: DomainStatus = {
          domain: name,
          availability: whoisRes.availability,
          resolver: whoisRes.source,
          raw,
          error: undefined,
        };
        logger.info('domain.check.end', { domain: name, status: result.availability, resolver: result.resolver });
        return result;
      }
    }

    const result: DomainStatus = {
      domain: name,
      availability: 'unknown',
      resolver: 'app',
      raw,
      error: finalError,
    };
    logger.info('domain.check.end', { domain: name, status: result.availability, resolver: result.resolver });
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

  const numWorkers = opts.concurrency ?? MAX_CONCURRENCY;
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

