import { AdapterResponse, TldConfigEntry, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

export class RdapAdapter extends BaseCheckerAdapter {
  private baseUrl: string;
  constructor(baseUrl = 'https://rdap.org/domain/') {
    super('rdap');
    this.baseUrl = baseUrl;
  }

  protected async doCheck(
    domainObj: ParsedDomain,
    opts: { tldConfig?: TldConfigEntry; signal?: AbortSignal } = {},
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const baseUrl = opts.tldConfig?.rdapServer || this.baseUrl;
    try {
      const res = await fetch(`${baseUrl}${domain}`, {
        signal: opts.signal,
      });
      const text = await res.text();
      if (res.status === 404) {
        return {
          domain,
          availability: 'available',
          source: 'rdap',
          raw: null,
        };
      }
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        return {
          domain,
          availability: 'unknown',
          source: 'rdap',
          raw: text,
          error: {
            code: `HTTP_${res.status}`,
            message: `rdap failed: ${res.status}`,
            retryable,
          },
        };
      }
      const data = JSON.parse(text);
      return {
        domain,
        availability: 'unavailable',
        source: 'rdap',
        raw: data,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      return {
        domain,
        availability: 'unknown',
        source: 'rdap',
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err.code || 'RDAP_ERROR',
          message: err.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
