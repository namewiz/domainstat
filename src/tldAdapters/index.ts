import { CheckerAdapter } from '../types';
import { NgRdapWhoisAdapter } from './ngAdapter';

export interface TldAdapterSet {
  dns?: CheckerAdapter;
  rdap?: CheckerAdapter;
  whois?: CheckerAdapter;
}

const ngRdap = new NgRdapWhoisAdapter('rdap', 'rdap.ng');
const ngWhois = new NgRdapWhoisAdapter('whois.api', 'whois.ng');

export const tldAdapters: Record<string, TldAdapterSet> = {
  ng: { rdap: ngRdap, whois: ngWhois },
};

export function getTldAdapter(suffix?: string): TldAdapterSet | undefined {
  if (!suffix) return undefined;
  const lower = suffix.toLowerCase();
  if (tldAdapters[lower]) return tldAdapters[lower];
  const parts = lower.split('.');
  return tldAdapters[parts[parts.length - 1]];
}

