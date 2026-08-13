import { AdapterResponse, EppConfig, ParsedDomain } from '../types';
import { BaseCheckerAdapter } from './baseAdapter';

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
      const result = await this.checkViaEpp(domain, eppConfig, opts.signal);
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

  private async checkViaEpp(
    domain: string,
    eppConfig: NonNullable<EppConfig['ng']>,
    signal?: AbortSignal,
  ): Promise<{ availability: 'registered' | 'unregistered' | 'unknown'; raw: any }> {
    // Dynamically imported so bundlers never need to resolve epp-client's
    // Node-only `net`/`tls` dependencies for a browser build.
    const { default: EppClient, EppClientConfig } = await import('epp-client');

    const eppClientConfig = new EppClientConfig({
      host: eppConfig.host,
      port: eppConfig.port,
      rejectUnauthorized: eppConfig.rejectUnauthorized,
    });
    const client = new EppClient(eppClientConfig);

    const connectError = await client.connect();
    if (connectError instanceof Error) throw connectError;

    let loggedIn = false;
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const loginResult = await client.login({ username: eppConfig.username, password: eppConfig.password });
      if (loginResult instanceof Error) throw loginResult;
      if (!loginResult.success) throw new Error(loginResult.resultMessage || 'NIRA EPP login failed');
      loggedIn = true;

      const checkResult = await client.checkDomain({ name: domain });
      if (checkResult instanceof Error) throw checkResult;

      const domainCheck = Array.isArray(checkResult) ? checkResult[0] : checkResult;
      if (!domainCheck) return { availability: 'unknown', raw: null };

      return { availability: domainCheck.availability, raw: domainCheck };
    } finally {
      if (loggedIn) {
        await client.logout().catch(() => undefined);
      }
      await client.disconnect().catch(() => undefined);
    }
  }
}
