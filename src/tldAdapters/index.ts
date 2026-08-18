import { NiraEppAdapter } from '../adapters/niraEppAdapter';
import type { CheckerAdapter } from '../types';
import { NgAdapter } from './ngAdapter';

export interface TldAdapter {
  dns?: CheckerAdapter;
  rdap?: CheckerAdapter;
  whois?: CheckerAdapter;
  /**
   * Last-resort registry (EPP) fallback, only queried when every other
   * adapter above has come back `unknown`. See `NiraEppAdapter`.
   */
  registry?: CheckerAdapter;
}

const niraEppAdapter = new NiraEppAdapter('registry.ng');

const tldAdapters: Record<string, TldAdapter> = {
  ng: { rdap: new NgAdapter('rdap.ng'), registry: niraEppAdapter },
  'com.ng': { rdap: new NgAdapter('rdap.ng'), registry: niraEppAdapter },
  'org.ng': { rdap: new NgAdapter('rdap.ng'), registry: niraEppAdapter },
  'net.ng': { rdap: new NgAdapter('rdap.ng'), registry: niraEppAdapter },
};

export function getTldAdapter(suffix?: string): TldAdapter | undefined {
  if (!suffix) {
    return undefined;
  }
  const lower = suffix.toLowerCase();
  if (tldAdapters[lower]) {
    return tldAdapters[lower];
  }
  const parts = lower.split('.');
  return tldAdapters[parts[parts.length - 1]];
}
