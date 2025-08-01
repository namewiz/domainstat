import tlds from './tlds.json' assert { type: 'json' };

const tldMap: Record<string, string | boolean> = {
  ...(tlds as any).popular,
  ...(tlds as any).gTLDs,
  ...(tlds as any).ccTLDs,
};
import { DomainStatus, TldConfigEntry } from './types.js';
import { parse } from 'tldts';

export function validateDomain(domain: string): {
  config: TldConfigEntry | null;
  status: DomainStatus | null;
} {
  const parsed = parse(domain.toLowerCase());
  if (!parsed.domain || !parsed.publicSuffix || domain.trim() !== parsed.domain) {
    return {
      config: null,
      status: {
        domain,
        availability: 'invalid',
        resolver: 'validator',
        raw: { validator: null },
        error: undefined,
      },
    };
  }

  if (!parsed.isIcann) {
    return {
      config: null,
      status: {
        domain,
        availability: 'unsupported',
        resolver: 'validator',
        raw: { validator: null },
        error: undefined,
      },
    };
  }

  const suffix = parsed.publicSuffix;
  const val = tldMap[suffix];
  if(!val) {
    return {
      config: null,
      status: {
        domain,
        availability: 'unsupported',
        resolver: 'validator',
        raw: { validator: null },
        error: undefined,
      },
    };
  }
  
  const cfg: TldConfigEntry =
    suffix && val ? (typeof val === 'string' ? { rdapServer: val } : {}) : {};

  return { config: cfg, status: null };
}
