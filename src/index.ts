import {
  DomainStatus,
  AdapterResponse,
  CheckOptions,
  Platform,
  AdapterError,
} from './types';
export type { DomainStatus } from './types';
import { HostAdapter } from './adapters/hostAdapter';
import { PingAdapter } from './adapters/pingAdapter';
import { DohAdapter } from './adapters/dohAdapter';
import { RdapAdapter } from './adapters/rdapAdapter';
import { WhoisLibAdapter } from './adapters/whoisLibAdapter';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter';
import { validateDomain } from './validator';
import { parse } from 'tldts';
import { getTldAdapter } from './tldAdapters';

const MAX_CONCURRENCY = 10;
const host = new HostAdapter();
const ping = new PingAdapter();
const doh = new DohAdapter();
const rdap = new RdapAdapter();
const whoisLib = new WhoisLibAdapter();
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

function normalizeDomains(domains: string[]): string[] {
  return Array.from(new Set(domains.map((d) => d.trim().toLowerCase())));
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
  const validated = validateDomain(parsed, domain);
  if (validated.error) {
    logger.error(`validation error for domain '${domain}', error: ${validated.error.message}`);
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
    let finalError: AdapterError | undefined;

    let dnsResult: AdapterResponse | null = null;
    const usePing =
      opts.only?.some((p) => p.startsWith('dns.ping')) ||
      opts.skip?.some((p) => p.startsWith('dns.host'));
    const dnsAdapter = tldAdapter?.dns ?? (isNode ? (usePing ? ping : host) : doh);
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      try {
        dnsResult = await dnsAdapter.check(parsed, { cache: opts.cache });
      } catch (err: any) {
        dnsResult = {
          domain: name,
          availability: 'unknown',
          source: dnsAdapter.namespace as any,
          raw: null,
          error: {
            code: err?.code || 'DNS_ERROR',
            message: err?.message || String(err),
            retryable: true,
          },
        };
      }
      raw[dnsAdapter.namespace] = dnsResult.raw;
      if (dnsResult.error) {
        logger.warn('dns.failed', { domain: name, error: dnsResult.error.message });
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
      const rdapRes = await rdapAdapter.check(parsed, {
        tldConfig: opts.tldConfig,
        cache: opts.cache,
      });
      raw[rdapAdapter.namespace] = rdapRes.raw;
      if (rdapRes.error) {
        logger.warn('rdap.failed', { domain: name, error: rdapRes.error.message });
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
    const whoisAdapter = tldAdapter?.whois ?? (isNode ? whoisLib : whoisApi);
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      whoisRes = await whoisAdapter.check(parsed, { cache: opts.cache });
      raw[whoisAdapter.namespace] = whoisRes.raw;
      if (whoisRes.error) {
        logger.warn(
          tldAdapter?.whois ? 'whois.tld.failed' : isNode ? 'whois.lib.failed' : 'whois.api.failed',
          { domain: name, error: whoisRes.error.message }
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

export async function* checkBatchStream(
  domains: string[],
  opts: CheckOptions = {}
): AsyncGenerator<DomainStatus> {
  const queue = [...normalizeDomains(domains)];
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const active: Array<{ id: number; promise: Promise<{ id: number; res: DomainStatus }> }> = [];
  let idCounter = 0;

  const enqueue = () => {
    if (!queue.length) return;
    const domain = queue.shift()!;
    const id = idCounter++;
    const promise = check(domain, opts).then((res) => ({ id, res: { ...res, domain } }));
    active.push({ id, promise });
  };

  for (let i = 0; i < concurrency && queue.length; i++) {
    enqueue();
  }

  while (active.length) {
    const { id, res } = await Promise.race(active.map((a) => a.promise));
    yield res;
    const idx = active.findIndex((a) => a.id === id);
    if (idx >= 0) {
      active.splice(idx, 1);
    }
    enqueue();
  }
}

export async function checkBatch(
  domains: string[],
  opts: CheckOptions = {},
): Promise<DomainStatus[]> {
  const results: DomainStatus[] = [];

  for await (const res of checkBatchStream(domains, opts)) {
    results.push(res);
  }

  return results;
}

