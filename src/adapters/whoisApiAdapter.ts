import { CheckerAdapter, AdapterResponse, ParsedDomain } from '../types';

const DEFAULT_TIMEOUT_MS = 1000;

export class WhoisApiAdapter implements CheckerAdapter {
  namespace = 'whois.api';
  private freaksKey?: string;
  private xmlKey?: string;
  constructor(freaksKey?: string, xmlKey?: string) {
    this.freaksKey = freaksKey;
    this.xmlKey = xmlKey;
  }

  private async fetchFreaks(domain: string, timeoutMs: number): Promise<any> {
    if (!this.freaksKey) throw new Error('whoisfreaks api key missing');
    const url = `https://api.whoisfreaks.com/v1.0/whois?apiKey=${this.freaksKey}&whois=live&domain=${domain}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      const err: any = new Error(`whoisfreaks failed: ${res.status}`);
      err.quota = res.status === 429 || /quota|limit/i.test(text);
      throw err;
    }
    return JSON.parse(text);
  }

  private async fetchXml(domain: string, timeoutMs: number): Promise<any> {
    if (!this.xmlKey) throw new Error('whoisxml api key missing');
    const url = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${this.xmlKey}&domainName=${domain}&outputFormat=JSON`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) throw new Error(`whoisxml failed: ${res.status}`);
    return JSON.parse(text);
  }

  async check(domainObj: ParsedDomain, opts: { timeoutMs?: number } = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      let data: any;
      try {
        data = await this.fetchFreaks(domain, timeoutMs);
      } catch (err: any) {
        if (err.quota) {
          data = await this.fetchXml(domain, timeoutMs);
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
      return {
        domain,
        availability: 'unknown',
        source: 'whois.api',
        raw: null,
        error: err,
      };
    }
  }
}
