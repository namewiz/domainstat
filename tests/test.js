import assert from 'assert';
import { promises as dns } from 'dns';
import { check } from '../dist/index.js';

const offline = process.env.OFFLINE_TESTS !== 'false';

if (offline) {
  const mapping = {
    'example.com': false,
    'iana.org': false,
    'example.net': false,
    'example.io': false,
    'this-domain-should-not-exist-12345.com': true,
    'my-test-domain.co.uk': true,
    'bundesregierung.de': false,
    'example.cn': false,
  };

  dns.resolve = async (domain) => {
    if (mapping[domain] === undefined) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    if (mapping[domain]) {
      throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    }
    return ['93.184.216.34'];
  };

  globalThis.fetch = async (url) => {
    if (url.includes('dns-query')) {
      const name = new URL(url).searchParams.get('name');
      const available = mapping[name];
      const Answer = available ? [] : [{ data: '93.184.216.34' }];
      return new Response(JSON.stringify({ Answer }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const domain = url.split('/').pop();
    const available = mapping[domain];
    if (available === undefined) {
      return { status: 404, ok: false, json: async () => ({}) };
    }
    if (available) {
      return { status: 404, ok: false, json: async () => ({}) };
    }
    return { status: 200, ok: true, json: async () => ({}) };
  };
}

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
