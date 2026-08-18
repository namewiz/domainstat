import premiumNgDomains from './premium-ng-domains.json' with { type: 'json' };

const premiumNgSet = new Set(premiumNgDomains as string[]);

/**
 * Whether `domain` is in NIRA's `.ng` Premium Pool.
 * List source: NIRA's premium domain listing, extracted into
 * ./premium-ng-domains.json (see domainstat/TODO.txt for the refresh command).
 */
export function isPremiumNgDomain(domain: string): boolean {
  return premiumNgSet.has(domain.trim().toLowerCase());
}
