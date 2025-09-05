import { AdapterResponse, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

const DEFAULT_TIMEOUT_MS = 1000;

export class WhoisApiAdapter extends BaseCheckerAdapter {
  private freaksKey?: string;
  private xmlKey?: string;
  constructor(freaksKey?: string, xmlKey?: string) {
    super('whois.api');
    this.freaksKey = freaksKey;
    this.xmlKey = xmlKey;
  }

    private async fetchFreaks(domain: string, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    if (!this.freaksKey) throw new Error('whoisfreaks api key missing');
    const url = `https://api.whoisfreaks.com/v1.0/whois?apiKey=${this.freaksKey}&whois=live&domain=${domain}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
      const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, ac.signal]) : ac.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`whoisfreaks failed: ${res.status}`);
      err.quota = res.status === 429 || /quota|limit/i.test(text);
      throw err;
    }
    return JSON.parse(text);
  }

    private async fetchXml(domain: string, timeoutMs: number, signal?: AbortSignal): Promise<any> {
    if (!this.xmlKey) throw new Error('whoisxml api key missing');
    const url = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${this.xmlKey}&domainName=${domain}&outputFormat=JSON`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
      const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, ac.signal]) : ac.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) throw new Error(`whoisxml failed: ${res.status}`);
    return JSON.parse(text);
  }

  protected async doCheck(
    domainObj: ParsedDomain,
      opts: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      let data: any;
        try {
          data = await this.fetchFreaks(domain, timeoutMs, opts.signal);
      } catch (err: any) {
        if (err.quota) {
            data = await this.fetchXml(domain, timeoutMs, opts.signal);
        } else {
          throw err;
        }
      }

      const text = JSON.stringify(data).toLowerCase();
      const isAvailable =
        text.includes('n/a') || text.includes('no match') || text.includes('not found');
      return {
        domain,
        availability: isAvailable ? 'available' : 'unavailable',
        source: 'whois.api',
        raw: data,
      };
    } catch (err: any) {
      const message = err?.message || String(err);
      let code = err?.code || 'WHOIS_API_ERROR';
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
        source: 'whois.api',
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
