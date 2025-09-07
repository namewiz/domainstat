import { AdapterResponse, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

export class AltStatusAdapter extends BaseCheckerAdapter {
  private domainrKey?: string;
  constructor (domainrKey?: string) {
    super('altstatus');
    this.domainrKey = domainrKey;
  }

  private async fetchDomainr(domain: string, signal?: AbortSignal): Promise<any> {
    if (!this.domainrKey) throw new Error('domainr api key missing');
    const url = `https://domainr.p.rapidapi.com/v2/status?domain=${domain}&mashape-key=${this.domainrKey}`;
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`domainr failed: ${res.status}`);
      err.quota = res.status === 429 || /quota|limit/i.test(text);
      throw err;
    }
    return JSON.parse(text);
  }

  private async fetchMono(domain: string, signal?: AbortSignal): Promise<any> {
    const url = `https://api.mono.domains/availability/${domain}`;
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`mono domains failed: ${res.status}`);
    return JSON.parse(text);
  }

  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    try {
      if (this.domainrKey) {
        try {
          const data = await this.fetchDomainr(domain, opts.signal);
          const summary = data?.status?.[0]?.summary;
          const isUnregistered = summary === 'inactive';
          return {
            domain,
            availability: isUnregistered ? 'unregistered' : 'registered',
            source: 'altstatus.domainr',
            raw: data,
          };
        } catch (err) {
          // fallthrough to mono
        }
      }
      const monoData = await this.fetchMono(domain, opts.signal);
      if (!monoData?.success) {
        throw new Error('mono domains failed');
      }
      return {
        domain,
        availability: monoData.isDomainAvailable ? 'unregistered' : 'registered',
        source: 'altstatus.mono',
        raw: monoData,
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      let code = err?.code || 'STATUS_API_ERROR';
      let retryable = true;
      if (/api key missing/i.test(message)) {
        code = 'API_KEY_MISSING';
        retryable = false;
      } else if (err?.quota || /429/.test(message)) {
        code = 'RATE_LIMIT';
        retryable = true;
      } else if (err?.name === 'AbortError' || /timed out/i.test(message)) {
        code = 'TIMEOUT';
        retryable = true;
      }
      return {
        domain,
        availability: 'unknown',
        source: 'altstatus',
        raw: null,
        error: {
          code,
          message,
          retryable,
        },
      };
    }
  }
}
