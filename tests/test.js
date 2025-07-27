import assert from 'assert';
import { check } from '../dist/index.js';

const availableNgTLDs = [
  { name: 'this-domain-should-not-exist-12345.ng', availability: 'available' },
  { name: 'this-domain-should-not-exist-12345.com.ng', availability: 'available' },
  { name: 'this-domain-should-not-exist-12345.org.ng', availability: 'available' },
  { name: 'this-domain-should-not-exist-12345.edu.ng', availability: 'unsupported' },
  { name: 'this-domain-should-not-exist-12345.net.ng', availability: 'available' },
  { name: 'this-domain-should-not-exist-12345.sch.ng', availability: 'available' },
  { name: 'this-domain-should-not-exist-12345.gov.ng', availability: 'unsupported' },
  { name: 'this-domain-should-not-exist-12345.mil.ng', availability: 'unsupported' },
];

const unavailableNgTLDs = [
  { name: 'jiji.ng', availability: 'unavailable' },
  { name: 'jiji.com.ng', availability: 'unavailable' },
  { name: 'abisc.org.ng', availability: 'unavailable' },
  { name: 'lwms.net.ng', availability: 'unavailable' },
  { name: 'prudenceschools.sch.ng', availability: 'unavailable' },
  { name: 'afit.edu.ng', availability: 'unsupported' },
];

const domains = [
  { name: 'example.com', availability: 'unavailable' },
  { name: 'iana.org', availability: 'unavailable' },
  { name: 'example.net', availability: 'unavailable' },
  { name: 'my-test-domain-12345.dev', availability: 'available' },
  { name: 'google.dev', availability: 'unavailable' },
  { name: 'example.io', availability: 'unsupported' },
  { name: 'this-domain-should-not-exist-12345.com', availability: 'available' },
  { name: 'my-test-domain-12345.co.uk', availability: 'available' },
  { name: 'bundesregierung.de', availability: 'unavailable' },
  { name: 'example.cn', availability: 'unavailable' },
  { name: 'invalid@domain', availability: 'invalid' },
  { name: 'example.invalidtld', availability: 'unsupported' },
].concat(...availableNgTLDs, ...unavailableNgTLDs);

(async () => {
  let passed = 0;
  for (const d of domains) {
    const res = await check(d.name);
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
