import { checkBatch, check, configure } from '../dist/index.js';
import tlds from '../src/tlds.json' with { type: 'json' };
import unavailableDomainsJson from '../src/unavailable-domains.json' with { type: 'json' };
const tldMap = { ...tlds.popular, ...tlds.gTLDs, ...tlds.ccTLDs, ...tlds.SLDs };
const unavailableMap = {
  ...unavailableDomainsJson.popular,
  ...unavailableDomainsJson.gTLDs,
  ...unavailableDomainsJson.ccTLDs,
};


const unavailableNgTLDs = [
  { name: 'jiji.ng', availability: 'unavailable' },
  { name: 'jiji.com.ng', availability: 'unavailable' },
  { name: 'abisc.org.ng', availability: 'unavailable' },
  { name: 'lwms.net.ng', availability: 'unavailable' },
  { name: 'prudenceschools.sch.ng', availability: 'unavailable' },
  { name: 'afit.edu.ng', availability: 'unavailable' },
];

const domains = [
  { name: 'example.com', availability: 'unavailable' },
  { name: 'www.example.com', availability: 'invalid' },
  { name: 'iana.org', availability: 'unavailable' },
  { name: 'example.net', availability: 'unavailable' },
  { name: 'google.dev', availability: 'unavailable' },
  { name: 'google.io', availability: 'unavailable' },
  { name: 'example.io', availability: 'available' }, // todo: investigate why this is available.
  { name: 'amazon.shop', availability: 'unavailable' },
  { name: 'bundesregierung.de', availability: 'unavailable' },
  { name: 'example.cn', availability: 'unavailable' },
  { name: 'invalid@domain', availability: 'invalid' },
  { name: 'example.invalidtld', availability: 'unsupported' },
].concat(...unavailableNgTLDs);

(async function runTests() {
  const availableTldDomains = Object.entries(tldMap)
    .filter(([, val]) => !!val)
    .map(([tld]) => ({ name: `this-domain-should-not-exist-12345.${tld}`, availability: 'available' }));
  const unavailableTldDomains = Object.values(unavailableMap).map((domain) => ({ name: domain, availability: 'unavailable' }));

  const allDomains = domains.concat(...availableTldDomains, ...unavailableTldDomains);

  const names = allDomains.map((d) => d.name);
  const uniqueNames = Array.from(new Set(names));
  const batchResults = await checkBatch(uniqueNames);
  const resultsMap = Object.fromEntries(uniqueNames.map((n, i) => [n, batchResults[i]]));

  let passed = 0;
  const failed = [];

  for (const d of allDomains) {
    const res = resultsMap[d.name];
    const msg = `domain:${d.name}, expected:${d.availability}, got:${res.availability}, resolver:${res.resolver}`;
    const hasNs = res.raw && res.raw[res.resolver] !== undefined;
    if (res.availability === d.availability && hasNs) {
      console.log(`PASSED: ${msg}`);
      passed++;
    } else {
      failed.push(`FAILED: ${msg}`);
    }
  }

  for (const f of failed) {
    console.error(`\x1b[31m${f}\x1b[0m`);
  }

  console.log(`\nTotal tests passed: ${passed}/${allDomains.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
  await runConfigTests();
})();

async function runConfigTests() {
  let passed = 0;
  let total = 0;
  configure({ only: ['rdap'] });
  const resOnly = await check('example.com');
  if (resOnly.resolver === 'rdap') passed++;
  total++;

  configure({ skip: ['rdap'] });
  const resSkip = await check('this-domain-should-not-exist-12345.com');
  if (resSkip.resolver !== 'rdap') passed++;
  total++;

  configure({ only: undefined, skip: undefined });

  console.log(`Config option tests passed: ${passed}/${total}`);
  if (passed !== total) {
    process.exitCode = 1;
  }
}
