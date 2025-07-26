import tlds from './tlds.json' assert { type: 'json' };
import { parse } from 'tldts';
import { DomainStatus, TldConfigEntry } from './types.js';

export function validateDomain(domain: string): { config: TldConfigEntry | null; status: DomainStatus | null } {
  const result = parse(domain.toLowerCase());
  if (!result.domain) {
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

  const suffix = result.publicSuffix ?? '';
  if (suffix in (tlds as Record<string, string | boolean>)) {
    const val = (tlds as Record<string, string | boolean>)[suffix];
    const cfg: TldConfigEntry = typeof val === 'string' ? { rdapServer: val } : {};
    return { config: cfg, status: null };
  }

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
