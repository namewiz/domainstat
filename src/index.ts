import { DomainStatus, AdapterResponse, CheckOptions, Platform, AdapterError, AdapterSource } from './types';
export type { DomainStatus } from './types';
import { HostAdapter } from './adapters/hostAdapter';
import { PingAdapter } from './adapters/pingAdapter';
import { DohAdapter } from './adapters/dohAdapter';
import { RdapAdapter } from './adapters/rdapAdapter';
import { WhoisLibAdapter } from './adapters/whoisLibAdapter';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter';
import { AltStatusAdapter } from './adapters/altStatusAdapter';
import { validateDomain } from './validator';
import { parse } from 'tldts';
import { getTldAdapter } from './tldAdapters';

const MAX_CONCURRENCY = 10;
const host = new HostAdapter();
const ping = new PingAdapter();
const doh = new DohAdapter();
const rdap = new RdapAdapter();
const whoisLib = new WhoisLibAdapter();
const noopLogger: Pick<Console, 'info' | 'warn' | 'error'> = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function detectNode(): boolean {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
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

// Default per-adapter execution timeouts (in ms)
const defaultTimeoutConfig: Partial<Record<AdapterSource, number>> = {
  'dns.ping': 3000,
  'whois.lib': 3000,
  'whois.api': 3000,
};

function getAdapterTimeout(ns: AdapterSource, opts: CheckOptions): number | undefined {
  return opts.timeoutConfig?.[ns] ?? defaultTimeoutConfig[ns];
}

export async function checkSerial(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose ? (opts.logger ?? console) : noopLogger;
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

  const altStatus = new AltStatusAdapter(opts.apiKeys?.domainr);
  const whoisApi = new WhoisApiAdapter(opts.apiKeys?.whoisfreaks, opts.apiKeys?.whoisxml);

  const controller = new AbortController();
  const signal = controller.signal;
  const done = new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));

  let finalError: AdapterError | undefined;
  let result: DomainStatus | null = null;
  const running: Promise<void>[] = [];

  const handleResponse = (res: AdapterResponse) => {
    raw[res.source] = res.raw;
    if (!signal.aborted && !res.error && res.availability !== 'unknown') {
      controller.abort();
      result = { domain: name, availability: res.availability, resolver: res.source, raw, error: undefined };
      return;
    }
    if (res.error) {
      logger.warn(`${res.source}.failed`, { domain: name, error: res.error.message });
      finalError = res.error;
    }
  };

  const launch = (adapter: any, options: any) => {
    // Compose a signal that aborts either when the global signal aborts or when timeout elapses
    const timeoutMs = getAdapterTimeout(adapter.namespace as AdapterSource, opts);
    let controller: AbortController | undefined;
    let timer: any;
    let onAbort: (() => void) | undefined;
    const baseSignal: AbortSignal | undefined = options?.signal;
    const finalOptions = { ...options };
    if (typeof timeoutMs === 'number') {
      controller = new AbortController();
      // If the outer/global signal aborts, propagate
      if (baseSignal) {
        if (baseSignal.aborted) {
          controller.abort();
        } else {
          onAbort = () => controller && controller.abort();
          baseSignal.addEventListener('abort', onAbort);
        }
      }
      timer = setTimeout(() => controller && controller.abort(), timeoutMs);
      finalOptions.signal = controller.signal;
    }

    const p = adapter
      .check(parsed, finalOptions)
      .then(handleResponse)
      .catch((err: any) => {
        handleResponse({
          domain: name,
          availability: 'unknown',
          source: adapter.namespace,
          raw: null,
          error: {
            code: err?.code || 'ADAPTER_ERROR',
            message: err?.message || String(err),
            retryable: true,
          },
        });
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (onAbort && options?.signal) options.signal.removeEventListener('abort', onAbort);
      });
    running.push(p);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const getAllottedLatency = (ns: AdapterSource) => opts.allottedLatency?.[ns] ?? 200;

  const sequence: Array<{ adapter: any; options: any }> = [];
  const usePing = opts.only?.some((p) => p.startsWith('dns.ping')) || opts.skip?.some((p) => p.startsWith('dns.host'));
  const dnsAdapter = tldAdapter?.dns ?? (isNode ? (usePing ? ping : host) : doh);
  if (adapterAllowed(dnsAdapter.namespace, opts)) {
    sequence.push({ adapter: dnsAdapter, options: { cache: opts.cache, signal } });
  }
  const rdapAdapter = tldAdapter?.rdap ?? rdap;
  if (!opts.tldConfig?.skipRdap && adapterAllowed(rdapAdapter.namespace, opts)) {
    sequence.push({ adapter: rdapAdapter, options: { tldConfig: opts.tldConfig, cache: opts.cache, signal } });
  }
  if (adapterAllowed(altStatus.namespace, opts)) {
    sequence.push({ adapter: altStatus, options: { cache: opts.cache, signal } });
  }
  const whoisAdapter = tldAdapter?.whois ?? (isNode ? whoisLib : whoisApi);
  if (adapterAllowed(whoisAdapter.namespace, opts)) {
    sequence.push({ adapter: whoisAdapter, options: { cache: opts.cache, signal } });
  }

  for (const item of sequence) {
    if (signal.aborted) break;
    launch(item.adapter, item.options);
    await Promise.race([sleep(getAllottedLatency(item.adapter.namespace as AdapterSource)), done]);
  }

  if (!signal.aborted) {
    await Promise.all(running);
  }

  const finalResult = result ?? {
    domain: name,
    availability: 'unknown',
    resolver: 'app',
    raw,
    error: finalError,
  };
  logger.info('domain.check.end', {
    domain: name,
    status: finalResult.availability,
    resolver: finalResult.resolver,
  });
  return finalResult;
}

export async function checkParallel(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose ? (opts.logger ?? console) : noopLogger;
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

  const altStatus = new AltStatusAdapter(opts.apiKeys?.domainr);
  const whoisApi = new WhoisApiAdapter(opts.apiKeys?.whoisfreaks, opts.apiKeys?.whoisxml);

  const controller = new AbortController();
  const signal = controller.signal;

  return await new Promise<DomainStatus>((resolve) => {
    let finalError: AdapterError | undefined;
    let pending = 0;

    const finish = (result: DomainStatus) => {
      logger.info('domain.check.end', {
        domain: name,
        status: result.availability,
        resolver: result.resolver,
      });
      resolve(result);
    };

    const handleResponse = (res: AdapterResponse) => {
      raw[res.source] = res.raw;
      if (!controller.signal.aborted && !res.error && res.availability !== 'unknown') {
        controller.abort();
        finish({ domain: name, availability: res.availability, resolver: res.source, raw, error: undefined });
        return;
      }
      if (res.error) {
        logger.warn(`${res.source}.failed`, { domain: name, error: res.error.message });
        finalError = res.error;
      }
      pending--;
      if (pending === 0 && !controller.signal.aborted) {
        finish({ domain: name, availability: 'unknown', resolver: 'app', raw, error: finalError });
      }
    };

    const launch = (adapter: any, options: any) => {
      // Compose a signal that aborts either when the global signal aborts or when timeout elapses
      const timeoutMs = getAdapterTimeout(adapter.namespace as AdapterSource, opts);
      let controller: AbortController | undefined;
      let timer: any;
      let onAbort: (() => void) | undefined;
      const baseSignal: AbortSignal | undefined = options?.signal ?? signal;
      const finalOptions = { ...options };
      if (typeof timeoutMs === 'number') {
        controller = new AbortController();
        if (baseSignal) {
          if (baseSignal.aborted) {
            controller.abort();
          } else {
            onAbort = () => controller && controller.abort();
            baseSignal.addEventListener('abort', onAbort);
          }
        }
        timer = setTimeout(() => controller && controller.abort(), timeoutMs);
        finalOptions.signal = controller.signal;
      }

      pending++;
      adapter
        .check(parsed, finalOptions)
        .then(handleResponse)
        .catch((err: any) => {
          handleResponse({
            domain: name,
            availability: 'unknown',
            source: adapter.namespace,
            raw: null,
            error: {
              code: err?.code || 'ADAPTER_ERROR',
              message: err?.message || String(err),
              retryable: true,
            },
          });
        })
        .finally(() => {
          if (timer) clearTimeout(timer);
          if (onAbort && baseSignal) baseSignal.removeEventListener('abort', onAbort);
        });
    };

    const usePing =
      opts.only?.some((p) => p.startsWith('dns.ping')) || opts.skip?.some((p) => p.startsWith('dns.host'));
    const dnsAdapter = tldAdapter?.dns ?? (isNode ? (usePing ? ping : host) : doh);
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      launch(dnsAdapter, { cache: opts.cache, signal });
    }

    const rdapAdapter = tldAdapter?.rdap ?? rdap;
    if (!opts.tldConfig?.skipRdap && adapterAllowed(rdapAdapter.namespace, opts)) {
      launch(rdapAdapter, { tldConfig: opts.tldConfig, cache: opts.cache, signal });
    }

    if (adapterAllowed(altStatus.namespace, opts)) {
      launch(altStatus, { cache: opts.cache, signal });
    }

    const whoisAdapter = tldAdapter?.whois ?? (isNode ? whoisLib : whoisApi);
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      launch(whoisAdapter, { cache: opts.cache, signal });
    }

    if (pending === 0) {
      finish({ domain: name, availability: 'unknown', resolver: 'app', raw, error: finalError });
    }
  });
}

export async function check(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  return opts.burstMode ? checkParallel(domain, opts) : checkSerial(domain, opts);
}

export async function* checkBatchStream(domains: string[], opts: CheckOptions = {}): AsyncGenerator<DomainStatus> {
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

export async function checkBatch(domains: string[], opts: CheckOptions = {}): Promise<DomainStatus[]> {
  const results: DomainStatus[] = [];

  for await (const res of checkBatchStream(domains, opts)) {
    results.push(res);
  }

  return results;
}
