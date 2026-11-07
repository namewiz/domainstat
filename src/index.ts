import { parse } from 'tldts';
import { AltStatusAdapter } from './adapters/altStatusAdapter';
import { BootstrapRdapAdapter } from './adapters/bootstrapRdapAdapter';
import { DohAdapter } from './adapters/dohAdapter';
import { WhoisApiAdapter } from './adapters/whoisApiAdapter';
import { isPremiumNgDomain } from './premiumNg';
import { parseRdapToWhois } from './rdap-parser';
import { getTldAdapter } from './tldAdapters';
import type { AdapterError, AdapterResponse, AdapterSource, CheckOptions, DomainStatus } from './types';
import { validateDomain } from './validator';

export type { DomainStatus } from './types';

const MAX_CONCURRENCY = 10;
const DEFAULT_STAGGER_DELAY = 200;
const doh = new DohAdapter();
const rdap = new BootstrapRdapAdapter();

interface CacheEntryTimes {
  /** When the result was stored (ms since epoch). */
  storedAt: number;
  /** When the result stops being served (ms since epoch): storedAt plus the writer's TTL. */
  expiresAt: number;
}

interface ResultCache {
  /** Returns the cached result unless it has expired or is older than `maxAge` ms. */
  get(domain: string, maxAge: number): Promise<DomainStatus | undefined>;
  /** Stores `value`, to be served for at most `ttl` ms. */
  set(domain: string, value: DomainStatus, ttl: number): Promise<void>;
  clear(): Promise<void>;
}

const CACHE_NAME = 'domainstat:response-cache';
const CACHE_URL_PREFIX = 'https://domainstat.local/cache/';
const DEFAULT_CACHE_TTL = 2 * 60 * 60 * 1000;
const CACHE_STORED_HEADER = 'x-domainstat-stored-at';
const CACHE_EXPIRES_HEADER = 'x-domainstat-expires-at';
/** The in-memory cache sweeps out expired entries whenever it reaches this size, then twice its live size. */
const MIN_MEMORY_SWEEP_SIZE = 1000;

function isFresh(times: CacheEntryTimes, maxAge: number, now: number): boolean {
  return now < times.expiresAt && now - times.storedAt < maxAge;
}

function resolveCacheTtl(opts: CheckOptions): number {
  if (opts.cacheTtl === undefined) {
    return DEFAULT_CACHE_TTL;
  }
  const ttl = Number(opts.cacheTtl);
  if (Number.isNaN(ttl) || ttl < 0) {
    throw new RangeError(`cacheTtl must be a non-negative number of milliseconds, got ${opts.cacheTtl}`);
  }
  return ttl;
}

interface MemoryCacheEntry extends CacheEntryTimes {
  value: DomainStatus;
}

function createMemoryCache(): ResultCache {
  const store = new Map<string, MemoryCacheEntry>();
  let nextSweepSize = MIN_MEMORY_SWEEP_SIZE;
  // Entries can have different TTLs, so a sweep has to scan the whole Map. Sweeping only when
  // the Map has doubled since the last sweep keeps the cost amortized O(1) per write.
  const sweepIfLarge = (now: number) => {
    if (store.size < nextSweepSize) {
      return;
    }
    for (const [domain, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(domain);
      }
    }
    nextSweepSize = Math.max(MIN_MEMORY_SWEEP_SIZE, store.size * 2);
  };
  return {
    async get(domain: string, maxAge: number) {
      const entry = store.get(domain);
      if (!entry) {
        return undefined;
      }
      const now = Date.now();
      if (entry.expiresAt <= now) {
        store.delete(domain);
        return undefined;
      }
      return isFresh(entry, maxAge, now) ? entry.value : undefined;
    },
    async set(domain: string, value: DomainStatus, ttl: number) {
      const now = Date.now();
      store.set(domain, { value, storedAt: now, expiresAt: now + ttl });
      sweepIfLarge(now);
    },
    async clear() {
      store.clear();
      nextSweepSize = MIN_MEMORY_SWEEP_SIZE;
    },
  };
}

function createBrowserCache(scope: any): ResultCache {
  const cacheStorage: any = scope.caches;
  let cachePromise: Promise<any> | null = null;
  const getCache = async () => {
    if (!cachePromise) {
      cachePromise = cacheStorage.open(CACHE_NAME);
    }
    try {
      return await cachePromise;
    } catch (err) {
      cachePromise = null;
      throw err;
    }
  };
  const buildRequest = (domain: string) => new scope.Request(`${CACHE_URL_PREFIX}${encodeURIComponent(domain)}`);
  return {
    async get(domain: string, maxAge: number) {
      try {
        const cache = await getCache();
        const request = buildRequest(domain);
        const cachedResponse = await cache.match(request);
        if (!cachedResponse) {
          return undefined;
        }
        // Entries written before the TTL existed have no timestamp headers. Number(null) is 0,
        // so they read as stored and expired at the epoch and are dropped like any expired entry.
        const times: CacheEntryTimes = {
          storedAt: Number(cachedResponse.headers.get(CACHE_STORED_HEADER)),
          expiresAt: Number(cachedResponse.headers.get(CACHE_EXPIRES_HEADER)),
        };
        const now = Date.now();
        if (Number.isNaN(times.storedAt) || Number.isNaN(times.expiresAt) || times.expiresAt <= now) {
          await cache.delete(request);
          return undefined;
        }
        if (!isFresh(times, maxAge, now)) {
          return undefined;
        }
        const text = await cachedResponse.text();
        if (!text) {
          return undefined;
        }
        return JSON.parse(text) as DomainStatus;
      } catch {
        cachePromise = null;
        return undefined;
      }
    },
    async set(domain: string, value: DomainStatus, ttl: number) {
      try {
        const cache = await getCache();
        const now = Date.now();
        const response = new scope.Response(JSON.stringify(value), {
          headers: {
            'content-type': 'application/json',
            [CACHE_STORED_HEADER]: String(now),
            [CACHE_EXPIRES_HEADER]: String(now + ttl),
          },
        });
        await cache.put(buildRequest(domain), response);
      } catch {
        cachePromise = null;
        // Ignore write errors to avoid breaking the resolution flow
      }
    },
    async clear() {
      try {
        await cacheStorage.delete(CACHE_NAME);
        cachePromise = null;
      } catch {
        cachePromise = null;
      }
    },
  };
}

function createResponseCache(): ResultCache {
  const scope: any = typeof globalThis !== 'undefined' ? globalThis : {};
  const isBrowser = typeof scope.window !== 'undefined' && scope.window === scope;
  const hasCacheStorage = isBrowser && scope.caches && typeof scope.caches.open === 'function';
  const hasRequest = typeof scope.Request === 'function';
  const hasResponse = typeof scope.Response === 'function';
  if (hasCacheStorage && hasRequest && hasResponse) {
    return createBrowserCache(scope);
  }
  return createMemoryCache();
}

const responseCache: ResultCache = createResponseCache();
const noopLogger: Pick<Console, 'info' | 'warn' | 'error'> = {
  info: () => {
    // no-op: default logger when the caller doesn't pass verbose/logger options
  },
  warn: () => {
    // no-op: default logger when the caller doesn't pass verbose/logger options
  },
  error: () => {
    // no-op: default logger when the caller doesn't pass verbose/logger options
  },
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

function normalizeDomains(domains: string[]): string[] {
  return Array.from(new Set(domains.map((d) => d.trim().toLowerCase())));
}

// Default per-adapter execution timeouts (in ms)
const defaultTimeoutConfig: Partial<Record<AdapterSource, number>> = {
  'whois.api': 3000,
};

function getAdapterTimeout(ns: AdapterSource, opts: CheckOptions): number | undefined {
  return opts.timeoutConfig?.[ns] ?? defaultTimeoutConfig[ns];
}

export async function checkSerial(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose ? (opts.logger ?? console) : noopLogger;
  logger.info(`[checkSerial] start domain=${domain}`);
  const raw: Record<string, any> = {};
  const parsedData: Record<string, any> = {};
  const latencies: Record<string, number> = {};
  const parsed = parse(domain.trim().toLowerCase());
  const validated = validateDomain(parsed, domain);
  if (validated.error) {
    logger.error(`[checkSerial] validation error for domain '${domain}': ${validated.error.message}`);
    return validated;
  }
  const name = parsed.domain!;
  const tldAdapter = getTldAdapter(parsed.publicSuffix ?? undefined);

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
    latencies[res.source] = res.latency ?? 0;
    logger.info(
      `[checkSerial] adapter=${res.source} domain=${name} availability=${res.availability} latency=${res.latency ?? 0}ms error=${res.error?.message ?? 'none'}`,
    );

    // Parse RDAP responses
    if ((res.source === 'rdap' || res.source === 'rdap.ng') && res.raw && !res.error) {
      try {
        parsedData[res.source] = parseRdapToWhois(res.raw);
      } catch (err) {
        logger.warn(
          `[checkSerial] ${res.source} parse failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!signal.aborted && !res.error && res.availability !== 'unknown') {
      controller.abort();
      logger.info(`[checkSerial] resolved domain=${name} availability=${res.availability} resolver=${res.source}`);
      result = {
        domain: name,
        availability: res.availability,
        resolver: res.source,
        raw,
        parsed: parsedData,
        latencies,
        error: undefined,
      };
      return;
    }
    if (res.error) {
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
        if (timer) {
          clearTimeout(timer);
        }
        if (onAbort && options?.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      });
    running.push(p);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const getStaggerDelay = (ns: AdapterSource) => opts.staggerDelay?.[ns] ?? DEFAULT_STAGGER_DELAY;

  const sequence: Array<{ adapter: any; options: any }> = [];
  const dnsAdapter = tldAdapter?.dns ?? doh;
  if (adapterAllowed(dnsAdapter.namespace, opts)) {
    sequence.push({ adapter: dnsAdapter, options: { signal } });
  }
  const rdapAdapter = tldAdapter?.rdap ?? rdap;
  if (!opts.tldConfig?.skipRdap && adapterAllowed(rdapAdapter.namespace, opts)) {
    sequence.push({
      adapter: rdapAdapter,
      options: { tldConfig: opts.tldConfig, signal },
    });
  }
  if (adapterAllowed(altStatus.namespace, opts)) {
    sequence.push({ adapter: altStatus, options: { signal } });
  }
  const whoisAdapter = tldAdapter?.whois ?? whoisApi;
  if (adapterAllowed(whoisAdapter.namespace, opts)) {
    sequence.push({ adapter: whoisAdapter, options: { signal } });
  }

  logger.info(`[checkSerial] adapters=[${sequence.map((s) => s.adapter.namespace).join(', ')}]`);

  for (const item of sequence) {
    if (signal.aborted) {
      break;
    }
    logger.info(`[checkSerial] launching adapter=${item.adapter.namespace} domain=${name}`);
    launch(item.adapter, item.options);
    await Promise.race([sleep(getStaggerDelay(item.adapter.namespace as AdapterSource)), done]);
  }

  if (!signal.aborted) {
    await Promise.all(running);
  }

  if (!result && tldAdapter?.registry && adapterAllowed(tldAdapter.registry.namespace, opts)) {
    logger.info(`[checkSerial] falling back to registry adapter=${tldAdapter.registry.namespace} domain=${name}`);
    const res = await tldAdapter.registry.check(parsed, { tldConfig: opts.tldConfig, eppConfig: opts.eppConfig });
    handleResponse(res);
  }

  const finalResult: DomainStatus = result ?? {
    domain: name,
    availability: 'unknown' as const,
    resolver: 'app' as const,
    raw,
    parsed: parsedData,
    latencies,
    error: finalError,
  };
  logger.info(
    `[checkSerial] end domain=${name} availability=${finalResult.availability} resolver=${finalResult.resolver}`,
  );
  return finalResult;
}

export async function checkParallel(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose ? (opts.logger ?? console) : noopLogger;
  logger.info(`[checkParallel] start domain=${domain}`);
  const raw: Record<string, any> = {};
  const parsedData: Record<string, any> = {};
  const latencies: Record<string, number> = {};
  const parsed = parse(domain.trim().toLowerCase());
  const validated = validateDomain(parsed, domain);
  if (validated.error || !parsed.publicSuffix) {
    logger.error(`[checkParallel] validation error for domain '${domain}': ${validated.error?.message}`);
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
      logger.info(`[checkParallel] end domain=${name} availability=${result.availability} resolver=${result.resolver}`);
      resolve(result);
    };

    const handleResponse = (res: AdapterResponse) => {
      raw[res.source] = res.raw;
      latencies[res.source] = res.latency ?? 0;
      logger.info(
        `[checkParallel] adapter=${res.source} domain=${name} availability=${res.availability} latency=${res.latency ?? 0}ms error=${res.error?.message ?? 'none'}`,
      );

      // Parse RDAP responses
      if ((res.source === 'rdap' || res.source === 'rdap.ng') && res.raw && !res.error) {
        try {
          parsedData[res.source] = parseRdapToWhois(res.raw);
        } catch (err) {
          logger.warn(
            `[checkParallel] ${res.source} parse failed for ${name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!controller.signal.aborted && !res.error && res.availability !== 'unknown') {
        controller.abort();
        logger.info(`[checkParallel] resolved domain=${name} availability=${res.availability} resolver=${res.source}`);
        finish({
          domain: name,
          availability: res.availability,
          resolver: res.source,
          raw,
          parsed: parsedData,
          latencies,
          error: undefined,
        });
        return;
      }
      if (res.error) {
        finalError = res.error;
      }
      pending--;
      if (pending === 0 && !controller.signal.aborted) {
        void tryRegistryFallback();
      }
    };

    const tryRegistryFallback = async () => {
      if (controller.signal.aborted || !tldAdapter?.registry || !adapterAllowed(tldAdapter.registry.namespace, opts)) {
        finish({
          domain: name,
          availability: 'unknown',
          resolver: 'app',
          raw,
          parsed: parsedData,
          latencies,
          error: finalError,
        });
        return;
      }
      logger.info(`[checkParallel] falling back to registry adapter=${tldAdapter.registry.namespace} domain=${name}`);
      const res = await tldAdapter.registry.check(parsed, {
        tldConfig: opts.tldConfig,
        eppConfig: opts.eppConfig,
        signal,
      });
      raw[res.source] = res.raw;
      latencies[res.source] = res.latency ?? 0;
      if (!controller.signal.aborted && !res.error && res.availability !== 'unknown') {
        finish({
          domain: name,
          availability: res.availability,
          resolver: res.source,
          raw,
          parsed: parsedData,
          latencies,
          error: undefined,
        });
        return;
      }
      finish({
        domain: name,
        availability: 'unknown',
        resolver: 'app',
        raw,
        parsed: parsedData,
        latencies,
        error: res.error ?? finalError,
      });
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
          if (timer) {
            clearTimeout(timer);
          }
          if (onAbort && baseSignal) {
            baseSignal.removeEventListener('abort', onAbort);
          }
        });
    };

    const adapters: string[] = [];
    const dnsAdapter = tldAdapter?.dns ?? doh;
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      adapters.push(dnsAdapter.namespace);
      launch(dnsAdapter, { signal });
    }

    const rdapAdapter = tldAdapter?.rdap ?? rdap;
    if (!opts.tldConfig?.skipRdap && adapterAllowed(rdapAdapter.namespace, opts)) {
      adapters.push(rdapAdapter.namespace);
      launch(rdapAdapter, { tldConfig: opts.tldConfig, signal });
    }

    if (adapterAllowed(altStatus.namespace, opts)) {
      adapters.push(altStatus.namespace);
      launch(altStatus, { signal });
    }

    const whoisAdapter = tldAdapter?.whois ?? whoisApi;
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      adapters.push(whoisAdapter.namespace);
      launch(whoisAdapter, { signal });
    }

    logger.info(`[checkParallel] launched adapters=[${adapters.join(', ')}] domain=${name}`);

    if (pending === 0) {
      void tryRegistryFallback();
    }
  });
}

export async function check(domain: string, opts: CheckOptions = {}): Promise<DomainStatus> {
  const logger: Pick<Console, 'info' | 'warn' | 'error'> = opts.verbose ? (opts.logger ?? console) : noopLogger;
  const normalized = domain.trim().toLowerCase();
  const cacheTtl = resolveCacheTtl(opts);
  // `cache: false` only skips reading: a fresh result is still written so later lookups can use it.
  const cacheEnabled = opts.cache !== false;
  if (cacheEnabled) {
    const cached = await responseCache.get(normalized, cacheTtl);
    if (cached && adapterAllowed(cached.resolver, opts)) {
      logger.info(
        `[check] cache hit domain=${normalized} availability=${cached.availability} resolver=${cached.resolver}`,
      );
      return cached;
    }
  }
  logger.info(`[check] domain=${normalized} mode=${opts.burstMode ? 'parallel' : 'serial'} cache=${cacheEnabled}`);
  const result = opts.burstMode ? await checkParallel(normalized, opts) : await checkSerial(normalized, opts);
  if (isPremiumNgDomain(result.domain)) {
    result.fineStatus = 'premium';
  }
  if (!result.error || result.error.retryable === false) {
    await responseCache.set(normalized, result, cacheTtl);
  }
  return result;
}

export async function* checkBatchStream(domains: string[], opts: CheckOptions = {}): AsyncGenerator<DomainStatus> {
  const queue = [...normalizeDomains(domains)];
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const active: Array<{
    id: number;
    promise: Promise<{ id: number; res: DomainStatus }>;
  }> = [];
  let idCounter = 0;

  const enqueue = () => {
    if (!queue.length) {
      return;
    }
    const domain = queue.shift()!;
    const id = idCounter++;
    const promise = check(domain, opts).then((res) => ({
      id,
      res: { ...res, domain },
    }));
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

/**
 * Clears the internal result cache.
 */
export async function clearCache(): Promise<void> {
  await responseCache.clear();
}
