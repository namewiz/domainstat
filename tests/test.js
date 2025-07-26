import assert from 'assert';
import { check } from '../dist/index.js';
import dns from 'dns';

// stub DNS and fetch so tests do not require network access
dns.promises.resolve = async (domain) => {
  if (
    domain === 'this-domain-should-not-exist-12345.com' ||
    domain === 'my-test-domain.co.uk'
  ) {
    const err = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    throw err;
  }
  return ['93.184.216.34'];
};

global.fetch = async (url, opts = {}) => {
  if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
    const u = new URL(url);
    const name = u.searchParams.get('name');
    const answer =
      name === 'this-domain-should-not-exist-12345.com' ||
      name === 'my-test-domain.co.uk'
        ? []
        : [{}];
    return {
      ok: true,
      json: async () => ({ Answer: answer }),
    };
  }
  if (url.startsWith('https://rdap.org/domain/')) {
    const domain = url.substring(url.lastIndexOf('/') + 1);
    if (
      domain === 'this-domain-should-not-exist-12345.com' ||
      domain === 'my-test-domain.co.uk'
    ) {
      return { status: 404, ok: false, json: async () => ({}) };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  }
  return { status: 200, ok: true, json: async () => ({}) };
};

const domains = [
  { name: 'example.com', availability: 'unavailable' },
  { name: 'iana.org', availability: 'unavailable' },
  { name: 'example.net', availability: 'unavailable' },
  { name: 'example.io', availability: 'unavailable' },
  { name: 'this-domain-should-not-exist-12345.com', availability: 'available' },
  { name: 'my-test-domain.co.uk', availability: 'available' },
  { name: 'bundesregierung.de', availability: 'unavailable' },
  { name: 'example.cn', availability: 'unavailable' },
  { name: 'invalid@domain', availability: 'invalid' },
  { name: 'example.invalidtld', availability: 'unsupported' },
];

(async () => {
  for (const d of domains) {
    const res = await check(d.name);
    console.log(d.name, res.availability);
    assert.strictEqual(res.availability, d.availability);
  }
  console.log('tests passed');
})();
