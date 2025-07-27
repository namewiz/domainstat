import { checkBatch } from '../dist/index.js';
import tlds from '../src/tlds.json' with { type: 'json' };

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

(async function runTests() {
  const tldDomains = Object.entries(tlds)
    .filter(([, val]) => !!val)
    .map(([tld]) => ({ name: `this-domain-should-not-exist-12345.${tld}`, availability: 'available' }));

  const allDomains = domains.concat(...tldDomains);

  const names = allDomains.map((d) => d.name);
  const uniqueNames = Array.from(new Set(names));
  const batchResults = await checkBatch(uniqueNames);
  const resultsMap = Object.fromEntries(uniqueNames.map((n, i) => [n, batchResults[i]]));

  let passed = 0;
  const failed = [];

  for (const d of allDomains) {
    const res = resultsMap[d.name];
    const msg = `domain:${d.name}, expected:${d.availability}, got:${res.availability}`;
    if (res.availability === d.availability) {
      console.log(`PASSED: ${msg}`);
      passed++;
    } else {
      failed.push(`FAILED: ${msg}`);
    }
  }

  for (const f of failed) {
    console.error(f);
  }

  console.log(`\nTotal tests passed: ${passed}/${allDomains.length}`);
})();
