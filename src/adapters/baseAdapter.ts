import { AdapterResponse, AdapterSource, CheckerAdapter, EppConfig, ParsedDomain, TldConfigEntry } from '../types';

type BaseOpts = { tldConfig?: TldConfigEntry; eppConfig?: EppConfig; signal?: AbortSignal };

export abstract class BaseCheckerAdapter implements CheckerAdapter {
  public readonly namespace: AdapterSource;

  constructor (namespace: AdapterSource) {
    if (!namespace) {
      throw new Error('BaseCheckerAdapter requires a namespace');
    }
    this.namespace = namespace;
  }

  async check(domainObj: ParsedDomain, opts: BaseOpts = {}): Promise<AdapterResponse> {
    const start = Date.now();
    const res = await this.doCheck(domainObj, opts);
    res.latency = Date.now() - start;
    return res;
  }

  protected abstract doCheck(
    domainObj: ParsedDomain,
    opts?: BaseOpts,
  ): Promise<AdapterResponse>;
}
