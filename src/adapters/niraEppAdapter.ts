import { AdapterResponse, EppConfig, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';
import { checkViaEpp } from './eppCheck';

type NiraDoCheckOpts = { eppConfig?: EppConfig; signal?: AbortSignal };

/**
 * Last-resort `.ng` availability check via NIRA's EPP registry (not RDAP/HTTP).
 * This is the same registry channel used for real registrations, so unlike
 * the RDAP-based NgAdapter it can't hang indefinitely or drift from the
 * registry's actual state.
 *
 * Deliberately inert unless both of the following hold:
 * - running in Node (EPP is a raw TLS socket; no browser API for it, and the
 *   registrar credentials below must never reach client code), and
 * - the caller passed `opts.eppConfig.ng` (server-only; UI callers never set
 *   this, so this adapter is a true noop for them by default).
 */
export class NiraEppAdapter extends BaseCheckerAdapter {
  private source: string;

  constructor (source: string, namespace: 'registry.ng') {
    super(namespace);
    this.source = source;
  }

  protected async doCheck(domainObj: ParsedDomain, opts: NiraDoCheckOpts = {}): Promise<AdapterResponse> {
    const domain = domainObj.domain as string;
    const isBrowser = typeof window !== 'undefined';
    const eppConfig = opts.eppConfig?.ng;

    if (isBrowser || !eppConfig) {
      return {
        domain,
        availability: 'unknown',
        source: this.namespace,
        raw: null,
      };
    }

    try {
      const result = await checkViaEpp(domain, eppConfig, opts.signal);
      return {
        domain,
        availability: result.availability,
        source: this.namespace,
        raw: result.raw,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || /timed out/i.test(String(err?.message));
      return {
        domain,
        availability: 'unknown',
        source: this.namespace,
        raw: null,
        error: {
          code: isTimeout ? 'TIMEOUT' : err?.code || 'NIRA_EPP_ERROR',
          message: err?.message || String(err),
          retryable: true,
        },
      };
    }
  }
}
