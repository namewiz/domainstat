import { AdapterResponse, ParsedDomain, AdapterSource } from '../types';
import { BaseCheckerAdapter } from '../adapters/baseAdapter';

export class NgAdapter extends BaseCheckerAdapter {
  private source: AdapterSource;

  constructor(source: AdapterSource, namespace: AdapterSource) {
    super(namespace);
    this.source = source;
  }

  private async query(domain: string, signal?: AbortSignal): Promise<{ exists: boolean; raw: any }> {
    // This bypasses secure connection, their cert is expired.
    // (TLS checks must be disabled externally if required)
    const res = await fetch(`https://whois.nic.net.ng/domains?name=${domain}&exactMatch=true`, { signal });
    const data = await res.json();
    const exists = Array.isArray(data.domainSearchResults) && data.domainSearchResults.length > 0;
    return { exists, raw: data };
  }

  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;

    try {
      const { exists, raw } = await this.query(domain, opts.signal);
      return {
        domain,
        availability: exists ? 'unavailable' : 'available',
        source: this.namespace,
        raw,
      };
    } catch (err: any) {
      const isTimeout =
        err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message));
      return {
        domain,
        availability: 'unknown',
        source: this.namespace,
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'NG_ADAPTER_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
