import assert from 'assert';
import { check } from '../dist/index.js';

const domains = [
  { name: 'example.com', availability: 'unavailable' },
  { name: 'iana.org', availability: 'unavailable' },
  { name: 'example.net', availability: 'unavailable' },
  { name: 'example.io', availability: 'unavailable' },
  { name: 'this-domain-should-not-exist-12345.com', availability: 'available' },
  { name: 'my-test-domain-12345.co.uk', availability: 'available' },
  { name: 'bundesregierung.de', availability: 'unavailable' },
  { name: 'example.cn', availability: 'unavailable' },
  { name: 'invalid@domain', availability: 'invalid' },
  { name: 'example.invalidtld', availability: 'unsupported' },
];

(async () => {
  let passed = 0;
  for (const d of domains) {
    const res = await check(d.name);
    console.log(d.name, res.availability);
    try {
      assert.strictEqual(res.availability, d.availability);
      console.log(`PASSED: domain:${d.name}, expected:${d.availability}, got:${res.availability}`);
      passed++;
    } catch (err) {
      console.error(`FAILED: domain:${d.name}, expected:${d.availability}, got:${res.availability}`);
    }
  }
  console.log(`\nTests passed: ${passed}/${domains.length}`);
})();
