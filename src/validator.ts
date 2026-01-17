import tlds from './tlds.json' assert { type: 'json' };
import { DomainStatus, ParsedDomain } from './types.js';

const tldMap: Record<string, string | boolean> = {
  ...(tlds as any).popular,
  ...(tlds as any).gTLDs,
  ...(tlds as any).ccTLDs,
  ...(tlds as any).SLDs,
};

export function validateDomain(parsed: ParsedDomain, originalDomain: string): DomainStatus {
  if (!parsed.domain || !parsed.publicSuffix || parsed.hostname !== parsed.domain) {
    return {
      domain: parsed.hostname || '',
      availability: 'invalid',
      resolver: 'validator',
      raw: { validator: null },
      parsed: {},
      latencies: { validator: 0 },
      error: {
        code: 'PARSE_ERROR',
        message: `Parse error: originalDomain: ${originalDomain}, parsedName: ${parsed.domain}, tld: ${parsed.publicSuffix}`,
        retryable: false,
      },
    };
  }

  const domain = parsed.domain;

  if (!parsed.isIcann) {
    return {
      domain,
      availability: 'unsupported',
      resolver: 'validator',
      raw: { validator: null },
      parsed: {},
      latencies: { validator: 0 },
      error: {
        code: 'UNSUPPORTED_TLD',
        message: `TLD is not ICANN supported`,
        retryable: false,
      },
    };
  }

  const suffix = parsed.publicSuffix;
  const val = tldMap[suffix];
  if (!val) {
    return {
      domain,
      availability: 'unsupported',
      resolver: 'validator',
      raw: { validator: null },
      parsed: {},
      latencies: { validator: 0 },
      error: {
        code: 'UNSUPPORTED_TLD',
        message: `The library does not support the tld .${suffix}`,
        retryable: false,
      },
    };
  }

  return {
    domain,
    availability: 'unknown',
    resolver: 'validator',
    raw: { validator: null },
    parsed: {},
    latencies: { validator: 0 },
  };
}
