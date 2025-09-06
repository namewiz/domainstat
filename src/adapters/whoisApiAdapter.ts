import { AdapterResponse, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

export class WhoisApiAdapter extends BaseCheckerAdapter {
  private freaksKey?: string;
  private xmlKey?: string;
  constructor(freaksKey?: string, xmlKey?: string) {
    super('whois.api');
    this.freaksKey = freaksKey;
    this.xmlKey = xmlKey;
  }

  private async fetchFreaks(domain: string, signal?: AbortSignal): Promise<any> {
    if (!this.freaksKey) throw new Error('whoisfreaks api key missing');
    const url = `https://api.whoisfreaks.com/v1.0/whois?apiKey=${this.freaksKey}&whois=live&domain=${domain}`;
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`whoisfreaks failed: ${res.status}`);
      err.quota = res.status === 429 || /quota|limit/i.test(text);
      throw err;
    }
    return JSON.parse(text);
  }

  private async fetchXml(domain: string, signal?: AbortSignal): Promise<any> {
    if (!this.xmlKey) throw new Error('whoisxml api key missing');
    const url = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${this.xmlKey}&domainName=${domain}&outputFormat=JSON`;
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`whoisxml failed: ${res.status}`);
    return JSON.parse(text);
  }

  protected async doCheck(domainObj: ParsedDomain, opts: { signal?: AbortSignal } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    try {
      let data: any;
      try {
        data = await this.fetchFreaks(domain, opts.signal);
      } catch (err: any) {
        if (err.quota) {
          data = await this.fetchXml(domain, opts.signal);
        } else {
          throw err;
        }
      }

      const text = JSON.stringify(data).toLowerCase();
      const isUnregistered = text.includes('n/a') || text.includes('no match') || text.includes('not found');
      return {
        domain,
        availability: isUnregistered ? 'unregistered' : 'registered',
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
