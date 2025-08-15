import { checkBatch } from '../dist/index.js';
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
  const unavailableTldDomains = Object.values(unavailableMap).map((domain) => ({ name: domain, availability: 'unavailable' })).filter(d => tldMap[d.name.split('.').pop()]);

  const allDomains = specialDomains.concat(...availableTldDomains, ...unavailableTldDomains);

  const names = allDomains.map((d) => d.name);
  const uniqueNames = Array.from(new Set(names));
  const batchResults = await checkBatch(uniqueNames);
  const resultsMap = Object.fromEntries(uniqueNames.map((n, i) => [n, batchResults[i]]));

  let passed = 0;
  const failed = [];

  for (const d of allDomains) {
    const res = resultsMap[d.name];
    const msg = `domain:${d.name}, expected:${d.availability}, got:${res.availability}, resolver:${res.resolver}`;
    
    // TODO: Add a separate check for valid responses (e.g. must include resolver).
    const hasNs = res.raw && res.raw[res.resolver] !== undefined;
    if (res.availability === d.availability) {
      console.log(`PASSED: ${msg}`);
      passed++;
    } else {
      failed.push(`FAILED: ${msg}`);
    }
  }

  for (const f of failed) {
    console.error(`\x1b[31m${f}\x1b[0m`);
  }

  if(failed.length === 0) {
    console.log(`\x1b[32mAll ${allDomains.length} tests passed!\x1b[0m`);
  } else {
    console.log(`\x1b[31m\n${failed.length}/${allDomains.length} (${failed.length * 100 / allDomains.length}%) tests failed:\x1b[0m`);
  }
  if (failed.length / allDomains.length > 0.15) {
    process.exitCode = 1;
  }
};

await runTests();