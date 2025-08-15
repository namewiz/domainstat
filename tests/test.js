import { checkBatchStream } from '../dist/index.js';
import tlds from '../src/tlds.json' with { type: 'json' };
import unavailableDomainsJson from '../src/unavailable-domains.json' with { type: 'json' };

const tldMap = { ...tlds.popular, ...tlds.gTLDs, ...tlds.ccTLDs, ...tlds.SLDs };
const unavailableMap = {
  ...unavailableDomainsJson.popular,
  ...unavailableDomainsJson.gTLDs,
  ...unavailableDomainsJson.ccTLDs,
  ...unavailableDomainsJson.SLDs,
};
const specialDomains = [
  { name: 'www.example.com', availability: 'invalid' },
  { name: 'invalid@domain', availability: 'invalid' },
  { name: 'example.invalidtld', availability: 'unsupported' },
];

async function runTests() {
  const availableTldDomains = Object.entries(tldMap)
    .filter(([, val]) => !!val)
    .map(([tld]) => ({ name: `this-domain-should-not-exist-12345.${tld}`, availability: 'available' }));
  const unavailableTldDomains = Object.values(unavailableMap)
    .map((domain) => ({ name: domain, availability: 'unavailable' }))
    .filter((d) => tldMap[d.name.split('.').pop()]);

  const allDomains = specialDomains.concat(...availableTldDomains, ...unavailableTldDomains);

  const expectedMap = Object.fromEntries(allDomains.map((d) => [d.name, d.availability]));
  const uniqueNames = Array.from(new Set(Object.keys(expectedMap)));
  let passed = 0;
  let failed = 0;

  for await (const res of checkBatchStream(uniqueNames, {skip: ['dns']})) {
    const expected = expectedMap[res.domain];
    const msg = `domain:${res.domain}, expected:${expected}, got:${res.availability}, resolver:${res.resolver}`;
    if (res.availability === expected) {
      console.log(`PASSED: ${msg}`);
      passed++;
    } else {
      const failMsg = `FAILED: ${msg}\n\t${res.error ?? 'No error message provided'}`;
      console.error(`\x1b[31m${failMsg}\x1b[0m`);
      failed++;
    }
  }

  const total = uniqueNames.length;
  if (failed === 0) {
    console.log(`\x1b[32mAll ${total} tests passed!\x1b[0m`);
  } 
  else if (passed / total >= 0.85) {
    console.log(`\x1b[32m\nPassable: ${failed}/${total} (${((failed * 100) / total).toFixed(2)}%) tests failed:\x1b[0m`);
  }
  else {
    console.log(`\x1b[31m\n${failed}/${total} (${((failed * 100) / total).toFixed(2)}%) tests failed:\x1b[0m`);
    process.exitCode = 1;
  }
}

await runTests();