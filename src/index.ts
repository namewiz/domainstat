import { parse } from "tldts";
import { AltStatusAdapter } from "./adapters/altStatusAdapter";
import { DohAdapter } from "./adapters/dohAdapter";
import { RdapAdapter } from "./adapters/rdapAdapter";
import { WhoisApiAdapter } from "./adapters/whoisApiAdapter";
import { parseRdapToWhois } from "./rdap-parser";
import { getTldAdapter } from "./tldAdapters";
import {
  AdapterError,
  AdapterResponse,
  AdapterSource,
  CheckOptions,
  DomainStatus,
} from "./types";
import { validateDomain } from "./validator";
export type { DomainStatus } from "./types";

const MAX_CONCURRENCY = 10;
const DEFAULT_STAGGER_DELAY = 200;
const doh = new DohAdapter();
const rdap = new RdapAdapter();

type ResultCache = {
  get(domain: string): Promise<DomainStatus | undefined>;
  set(domain: string, value: DomainStatus): Promise<void>;
};

const CACHE_NAME = "domainstat:response-cache";
const CACHE_URL_PREFIX = "https://domainstat.local/cache/";

function createMemoryCache(): ResultCache {
  const store = new Map<string, DomainStatus>();
  return {
    async get(domain: string) {
      return store.get(domain);
    },
    async set(domain: string, value: DomainStatus) {
      store.set(domain, value);
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
  const buildRequest = (domain: string) =>
    new scope.Request(`${CACHE_URL_PREFIX}${encodeURIComponent(domain)}`);
  return {
    async get(domain: string) {
      try {
        const cache = await getCache();
        const cachedResponse = await cache.match(buildRequest(domain));
        if (!cachedResponse) return undefined;
        const text = await cachedResponse.text();
        if (!text) return undefined;
        return JSON.parse(text) as DomainStatus;
      } catch {
        cachePromise = null;
        return undefined;
      }
    },
    async set(domain: string, value: DomainStatus) {
      try {
        const cache = await getCache();
        const response = new scope.Response(JSON.stringify(value), {
          headers: { "content-type": "application/json" },
        });
        await cache.put(buildRequest(domain), response);
      } catch {
        cachePromise = null;
        // Ignore write errors to avoid breaking the resolution flow
      }
    },
  };
}

function createResponseCache(): ResultCache {
  const scope: any = typeof globalThis !== "undefined" ? globalThis : {};
  const isBrowser =
    typeof scope.window !== "undefined" && scope.window === scope;
  const hasCacheStorage =
    isBrowser && scope.caches && typeof scope.caches.open === "function";
  const hasRequest = typeof scope.Request === "function";
  const hasResponse = typeof scope.Response === "function";
  if (hasCacheStorage && hasRequest && hasResponse) {
    return createBrowserCache(scope);
  }
  return createMemoryCache();
}

const responseCache: ResultCache = createResponseCache();
const noopLogger: Pick<Console, "info" | "warn" | "error"> = {
  info: () => { },
  warn: () => { },
  error: () => { },
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
  "whois.api": 3000,
};

function getAdapterTimeout(
  ns: AdapterSource,
  opts: CheckOptions,
): number | undefined {
  return opts.timeoutConfig?.[ns] ?? defaultTimeoutConfig[ns];
}

export async function checkSerial(
  domain: string,
  opts: CheckOptions = {},
): Promise<DomainStatus> {
  const logger: Pick<Console, "info" | "warn" | "error"> = opts.verbose
    ? (opts.logger ?? console)
    : noopLogger;
  logger.info("domain.check.start", { domain });
  const raw: Record<string, any> = {};
  const parsedData: Record<string, any> = {};
  const latencies: Record<string, number> = {};
  const parsed = parse(domain.trim().toLowerCase());
  const validated = validateDomain(parsed, domain);
  if (validated.error) {
    logger.error(
      `validation error for domain '${domain}', error: ${validated.error.message}`,
    );
    logger.info("domain.check.end", {
      domain: validated.domain,
      status: validated.availability,
      resolver: "validator",
      error: validated.error.message,
    });
    return validated;
  }
  const name = parsed.domain!;
  const tldAdapter = getTldAdapter(parsed.publicSuffix ?? undefined);

  const altStatus = new AltStatusAdapter(opts.apiKeys?.domainr);
  const whoisApi = new WhoisApiAdapter(
    opts.apiKeys?.whoisfreaks,
    opts.apiKeys?.whoisxml,
  );

  const controller = new AbortController();
  const signal = controller.signal;
  const done = new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve()),
  );

  let finalError: AdapterError | undefined;
  let result: DomainStatus | null = null;
  const running: Promise<void>[] = [];

  const handleResponse = (res: AdapterResponse) => {
    raw[res.source] = res.raw;
    latencies[res.source] = res.latency ?? 0;

    // Parse RDAP responses
    if (
      (res.source === "rdap" || res.source === "rdap.ng") &&
      res.raw &&
      !res.error
    ) {
      try {
        parsedData[res.source] = parseRdapToWhois(res.raw);
      } catch (err) {
        logger.warn(`${res.source}.parse_failed`, {
          domain: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!signal.aborted && !res.error && res.availability !== "unknown") {
      controller.abort();
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
      logger.warn(`${res.source}.failed`, {
        domain: name,
        error: res.error.message,
      });
      finalError = res.error;
    }
  };

  const launch = (adapter: any, options: any) => {
    // Compose a signal that aborts either when the global signal aborts or when timeout elapses
    const timeoutMs = getAdapterTimeout(
      adapter.namespace as AdapterSource,
      opts,
    );
    let controller: AbortController | undefined;
    let timer: any;
    let onAbort: (() => void) | undefined;
    const baseSignal: AbortSignal | undefined = options?.signal;
    const finalOptions = { ...options };
    if (typeof timeoutMs === "number") {
      controller = new AbortController();
      // If the outer/global signal aborts, propagate
      if (baseSignal) {
        if (baseSignal.aborted) {
          controller.abort();
        } else {
          onAbort = () => controller && controller.abort();
          baseSignal.addEventListener("abort", onAbort);
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
          availability: "unknown",
          source: adapter.namespace,
          raw: null,
          error: {
            code: err?.code || "ADAPTER_ERROR",
            message: err?.message || String(err),
            retryable: true,
          },
        });
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        if (onAbort && options?.signal)
          options.signal.removeEventListener("abort", onAbort);
      });
    running.push(p);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const getStaggerDelay = (ns: AdapterSource) =>
    opts.staggerDelay?.[ns] ?? DEFAULT_STAGGER_DELAY;

  const sequence: Array<{ adapter: any; options: any }> = [];
  const dnsAdapter = tldAdapter?.dns ?? doh;
  if (adapterAllowed(dnsAdapter.namespace, opts)) {
    sequence.push({ adapter: dnsAdapter, options: { signal } });
  }
  const rdapAdapter = tldAdapter?.rdap ?? rdap;
  if (
    !opts.tldConfig?.skipRdap &&
    adapterAllowed(rdapAdapter.namespace, opts)
  ) {
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

  for (const item of sequence) {
    if (signal.aborted) break;
    launch(item.adapter, item.options);
    await Promise.race([
      sleep(getStaggerDelay(item.adapter.namespace as AdapterSource)),
      done,
    ]);
  }

  if (!signal.aborted) {
    await Promise.all(running);
  }

  const finalResult: DomainStatus = result ?? {
    domain: name,
    availability: "unknown" as const,
    resolver: "app" as const,
    raw,
    parsed: parsedData,
    latencies,
    error: finalError,
  };
  logger.info("domain.check.end", {
    domain: name,
    status: finalResult.availability,
    resolver: finalResult.resolver,
  });
  return finalResult;
}

export async function checkParallel(
  domain: string,
  opts: CheckOptions = {},
): Promise<DomainStatus> {
  const logger: Pick<Console, "info" | "warn" | "error"> = opts.verbose
    ? (opts.logger ?? console)
    : noopLogger;
  logger.info("domain.check.start", { domain });
  const raw: Record<string, any> = {};
  const parsedData: Record<string, any> = {};
  const latencies: Record<string, number> = {};
  const parsed = parse(domain.trim().toLowerCase());
  const validated = validateDomain(parsed, domain);
  if (validated.error || !parsed.publicSuffix) {
    logger.error(
      `validation error for domain '${domain}', error: ${validated.error?.message}`,
    );
    logger.info("domain.check.end", {
      domain: validated.domain,
      status: validated.availability,
      resolver: "validator",
      error: validated.error?.message,
    });
    return validated;
  }
  const name = parsed.domain!;
  const tldAdapter = getTldAdapter(parsed.publicSuffix);

  const altStatus = new AltStatusAdapter(opts.apiKeys?.domainr);
  const whoisApi = new WhoisApiAdapter(
    opts.apiKeys?.whoisfreaks,
    opts.apiKeys?.whoisxml,
  );

  const controller = new AbortController();
  const signal = controller.signal;

  return await new Promise<DomainStatus>((resolve) => {
    let finalError: AdapterError | undefined;
    let pending = 0;

    const finish = (result: DomainStatus) => {
      logger.info("domain.check.end", {
        domain: name,
        status: result.availability,
        resolver: result.resolver,
      });
      resolve(result);
    };

    const handleResponse = (res: AdapterResponse) => {
      raw[res.source] = res.raw;
      latencies[res.source] = res.latency ?? 0;

      // Parse RDAP responses
      if (
        (res.source === "rdap" || res.source === "rdap.ng") &&
        res.raw &&
        !res.error
      ) {
        try {
          parsedData[res.source] = parseRdapToWhois(res.raw);
        } catch (err) {
          logger.warn(`${res.source}.parse_failed`, {
            domain: name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (
        !controller.signal.aborted &&
        !res.error &&
        res.availability !== "unknown"
      ) {
        controller.abort();
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
        logger.warn(`${res.source}.failed`, {
          domain: name,
          error: res.error.message,
        });
        finalError = res.error;
      }
      pending--;
      if (pending === 0 && !controller.signal.aborted) {
        finish({
          domain: name,
          availability: "unknown",
          resolver: "app",
          raw,
          parsed: parsedData,
          latencies,
          error: finalError,
        });
      }
    };

    const launch = (adapter: any, options: any) => {
      // Compose a signal that aborts either when the global signal aborts or when timeout elapses
      const timeoutMs = getAdapterTimeout(
        adapter.namespace as AdapterSource,
        opts,
      );
      let controller: AbortController | undefined;
      let timer: any;
      let onAbort: (() => void) | undefined;
      const baseSignal: AbortSignal | undefined = options?.signal ?? signal;
      const finalOptions = { ...options };
      if (typeof timeoutMs === "number") {
        controller = new AbortController();
        if (baseSignal) {
          if (baseSignal.aborted) {
            controller.abort();
          } else {
            onAbort = () => controller && controller.abort();
            baseSignal.addEventListener("abort", onAbort);
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
            availability: "unknown",
            source: adapter.namespace,
            raw: null,
            error: {
              code: err?.code || "ADAPTER_ERROR",
              message: err?.message || String(err),
              retryable: true,
            },
          });
        })
        .finally(() => {
          if (timer) clearTimeout(timer);
          if (onAbort && baseSignal)
            baseSignal.removeEventListener("abort", onAbort);
        });
    };

    const dnsAdapter = tldAdapter?.dns ?? doh;
    if (adapterAllowed(dnsAdapter.namespace, opts)) {
      launch(dnsAdapter, { signal });
    }

    const rdapAdapter = tldAdapter?.rdap ?? rdap;
    if (
      !opts.tldConfig?.skipRdap &&
      adapterAllowed(rdapAdapter.namespace, opts)
    ) {
      launch(rdapAdapter, { tldConfig: opts.tldConfig, signal });
    }

    if (adapterAllowed(altStatus.namespace, opts)) {
      launch(altStatus, { signal });
    }

    const whoisAdapter = tldAdapter?.whois ?? whoisApi;
    if (adapterAllowed(whoisAdapter.namespace, opts)) {
      launch(whoisAdapter, { signal });
    }

    if (pending === 0) {
      finish({
        domain: name,
        availability: "unknown",
        resolver: "app",
        raw,
        parsed: parsedData,
        latencies,
        error: finalError,
      });
    }
  });
}

export async function check(
  domain: string,
  opts: CheckOptions = {},
): Promise<DomainStatus> {
  const normalized = domain.trim().toLowerCase();
  const cacheEnabled = opts.cache !== false;
  if (cacheEnabled) {
    const cached = await responseCache.get(normalized);
    if (cached && adapterAllowed(cached.resolver, opts)) {
      return cached;
    }
  }
  const result = opts.burstMode
    ? await checkParallel(normalized, opts)
    : await checkSerial(normalized, opts);
  if (cacheEnabled && (!result.error || result.error.retryable === false)) {
    await responseCache.set(normalized, result);
  }
  return result;
}

export async function* checkBatchStream(
  domains: string[],
  opts: CheckOptions = {},
): AsyncGenerator<DomainStatus> {
  const queue = [...normalizeDomains(domains)];
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const active: Array<{
    id: number;
    promise: Promise<{ id: number; res: DomainStatus }>;
  }> = [];
  let idCounter = 0;

  const enqueue = () => {
    if (!queue.length) return;
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
