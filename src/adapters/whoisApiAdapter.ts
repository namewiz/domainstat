import { CheckerAdapter, DomainStatus } from '../types.js';

export class WhoisApiAdapter implements CheckerAdapter {
  namespace = 'whois.api';
  private freaksKey?: string;
  private xmlKey?: string;
  constructor(freaksKey?: string, xmlKey?: string) {
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

  async check(domain: string, opts: { signal?: AbortSignal } = {}): Promise<DomainStatus> {
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
    const isAvailable = text.includes('n/a') || text.includes('no match') || text.includes('not found');
    return {
      domain,
      availability: isAvailable ? 'available' : 'unavailable',
      source: 'whois.api',
      raw: { [this.namespace]: data },
      timestamp: Date.now(),
    };
  }
}
