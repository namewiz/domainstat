import tlds from './tlds.json' assert { type: 'json' };
import { DomainStatus, TldConfigEntry } from './types.js';
import { parse } from 'tldts';

export function validateDomain(domain: string): {
  config: TldConfigEntry | null;
  status: DomainStatus | null;
} {
  const parsed = parse(domain.toLowerCase());
  if (!parsed.domain || !parsed.publicSuffix) {
    return {
      config: null,
      status: {
        domain,
        availability: 'invalid',
        source: 'validator',
        raw: null,
        timestamp: Date.now(),
      },
    };
  }

  if (!parsed.isIcann) {
    return {
      config: null,
      status: {
        domain,
        availability: 'unsupported',
        source: 'validator',
        raw: null,
        timestamp: Date.now(),
      },
    };
  }

  const suffix = parsed.publicSuffix;
  const val = (tlds as Record<string, string | boolean>)[suffix];
  if(!val) {
    return {
      config: null,
      status: {
        domain,
        availability: 'unsupported',
        source: 'validator',
        raw: null,
        timestamp: Date.now(),
      },
    };
  }
  
  const cfg: TldConfigEntry =
    suffix && val ? (typeof val === 'string' ? { rdapServer: val } : {}) : {};

  return { config: cfg, status: null };
}
