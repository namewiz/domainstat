import { EppConfig } from '../types';

/**
 * Browser stub: dead code in practice, since niraEppAdapter.ts's `isBrowser`
 * guard never calls this. Exists purely so the browser bundle's source text
 * never references `epp-client` (see eppCheck.ts for the real implementation).
 */
export async function checkViaEpp(
  _domain: string,
  _eppConfig: NonNullable<EppConfig['ng']>,
  _signal?: AbortSignal,
): Promise<{ availability: 'registered' | 'unregistered' | 'unknown'; raw: any }> {
  throw new Error('checkViaEpp is not available in browser builds of domainstat');
}
