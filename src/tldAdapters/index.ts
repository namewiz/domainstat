import { CheckerAdapter } from '../types';
import { NgAdapter } from './ngAdapter';

export interface TldAdapter {
  dns?: CheckerAdapter;
  rdap?: CheckerAdapter;
  whois?: CheckerAdapter;
}

export const tldAdapters: Record<string, TldAdapter> = {
  ng: { rdap: new NgAdapter('rdap', 'rdap.ng') },
  'com.ng': { rdap: new NgAdapter('rdap', 'rdap.ng') },
  'org.ng': { rdap: new NgAdapter('rdap', 'rdap.ng') },
  'net.ng': { rdap: new NgAdapter('rdap', 'rdap.ng') },
};

export function getTldAdapter(suffix?: string): TldAdapter | undefined {
  if (!suffix) return undefined;
  const lower = suffix.toLowerCase();
  if (tldAdapters[lower]) return tldAdapters[lower];
  const parts = lower.split('.');
  return tldAdapters[parts[parts.length - 1]];
}
