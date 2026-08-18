import type { EppConfig } from '../types';

/**
 * Real EPP-over-TLS implementation, split out of niraEppAdapter.ts so the
 * browser build can swap in eppCheck.browser.ts and statically exclude the
 * `epp-client` import (Turbopack resolves every `import()` regardless of
 * runtime guards, so keeping this file out of the browser bundle's source
 * text is the only thing that works).
 */
export async function checkViaEpp(
  domain: string,
  eppConfig: NonNullable<EppConfig['ng']>,
  signal?: AbortSignal,
): Promise<{ availability: 'registered' | 'unregistered' | 'unknown'; raw: any }> {
  const { default: EppClient, EppClientConfig } = await import('epp-client');

  const eppClientConfig = new EppClientConfig({
    host: eppConfig.host,
    port: eppConfig.port,
    rejectUnauthorized: eppConfig.rejectUnauthorized,
  });
  const client = new EppClient(eppClientConfig);

  const connectError = await client.connect();
  if (connectError instanceof Error) {
    throw connectError;
  }

  let loggedIn = false;
  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const loginResult = await client.login({ username: eppConfig.username, password: eppConfig.password });
    if (loginResult instanceof Error) {
      throw loginResult;
    }
    if (!loginResult.success) {
      throw new Error(loginResult.resultMessage || 'NIRA EPP login failed');
    }
    loggedIn = true;

    const checkResult = await client.checkDomain({ name: domain });
    if (checkResult instanceof Error) {
      throw checkResult;
    }

    const domainCheck = Array.isArray(checkResult) ? checkResult[0] : checkResult;
    if (!domainCheck) {
      return { availability: 'unknown', raw: null };
    }

    return { availability: domainCheck.availability, raw: domainCheck };
  } finally {
    if (loggedIn) {
      await client.logout().catch(() => undefined);
    }
    await client.disconnect().catch(() => undefined);
  }
}
