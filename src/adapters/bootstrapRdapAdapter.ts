import bootstrapData from '../rdap-dns.json';
import type { AdapterResponse, ParsedDomain, TldConfigEntry } from '../types';
import { RdapAdapter } from './rdapAdapter';

export class BootstrapRdapAdapter extends RdapAdapter {
  private readonly bootstrapMap: Map<string, string>;

  constructor() {
    super(); // default baseUrl is rdap.org
    this.bootstrapMap = new Map();
    const services = (bootstrapData as any).services || [];
    for (const service of services) {
      const tlds = service[0];
      const urls = service[1];
      if (tlds && urls && urls.length > 0) {
        const url = urls[0];
        const normalizedUrl = url.endsWith('/') ? url : `${url}/`;
        for (const tld of tlds) {
          this.bootstrapMap.set(tld.toLowerCase(), `${normalizedUrl}domain/`);
        }
      }
    }
  }

  protected async doCheck(
    domainObj: ParsedDomain,
    opts: { tldConfig?: TldConfigEntry; signal?: AbortSignal } = {},
  ): Promise<AdapterResponse> {
    const fullTld = domainObj.publicSuffix?.toLowerCase();
    let baseUrl = opts.tldConfig?.rdapServer;

    if (!baseUrl && fullTld) {
      baseUrl = this.bootstrapMap.get(fullTld);
      if (!baseUrl && fullTld.includes('.')) {
        const parts = fullTld.split('.');
        const topLevel = parts[parts.length - 1];
        baseUrl = this.bootstrapMap.get(topLevel);
      }
    }

    if (!baseUrl) {
      // Fall back to parent which uses rdap.org or opts.tldConfig.rdapServer
      return super.doCheck(domainObj, opts);
    }

    // Use the bootstrap URL
    const newOpts = {
      ...opts,
      tldConfig: {
        ...opts.tldConfig,
        rdapServer: baseUrl,
      },
    };

    return super.doCheck(domainObj, newOpts);
  }
}
