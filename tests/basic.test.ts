import assert from 'assert';
import { check } from '../src/index.js';

const domains = [
  { name: 'example.com', availability: 'unavailable' },
  { name: 'iana.org', availability: 'unavailable' },
  { name: 'this-domain-should-not-exist-12345.com', availability: 'available' },
  { name: 'invalid@domain', availability: 'unsupported' },
];

(async () => {
  for (const d of domains) {
    const res = await check(d.name);
    console.log(d.name, res.availability);
    assert.strictEqual(res.availability, d.availability);
  }
  console.log('tests passed');
})();
