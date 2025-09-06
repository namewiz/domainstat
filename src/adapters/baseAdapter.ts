import { CheckerAdapter, AdapterResponse, ParsedDomain, TldConfigEntry, AdapterSource } from '../types';

type BaseOpts = { tldConfig?: TldConfigEntry; cache?: boolean; signal?: AbortSignal };

export abstract class BaseCheckerAdapter implements CheckerAdapter {
  public readonly namespace: AdapterSource;
  private static cache = new Map<string, AdapterResponse>();

  constructor(namespace: AdapterSource) {
    if (!namespace) {
      throw new Error('BaseCheckerAdapter requires a namespace');
    }
    this.namespace = namespace;
  }

  async check(domainObj: ParsedDomain, opts: BaseOpts = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const cacheEnabled = opts.cache !== false;
    const key = `${this.namespace}:${domain}`;
    if (cacheEnabled) {
      const cached = BaseCheckerAdapter.cache.get(key);
      if (cached) {
        return cached;
      }
    }

    const { cache, ...rest } = opts;
    const start = Date.now();
    const res = await this.doCheck(domainObj, rest);
    res.latency = Date.now() - start;
    if (cacheEnabled && (!res.error || res.error.retryable === false)) {
      BaseCheckerAdapter.cache.set(key, res);
    }
    return res;
  }

  protected abstract doCheck(
    domainObj: ParsedDomain,
    opts?: { tldConfig?: TldConfigEntry; signal?: AbortSignal },
  ): Promise<AdapterResponse>;
}
